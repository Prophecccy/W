import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import crypto from "node:crypto";
import { EventEmitter } from "node:events";
import type { ApiRequest, ApiResponse } from "../_lib/http.js";
import { enforceCorsAndCsrf } from "../_lib/cors.js";
import {
  OAUTH_TX_COOKIE_NAME,
  sealPayload,
  SESSION_COOKIE_NAME,
  unsealPayload,
  verifyGoogleIdToken,
} from "../_lib/session.js";
import {
  assertResourceOwner,
  MAX_ABSOLUTE_SESSION_MS,
  requireRole,
  requireSession,
  resolveServerRole,
} from "../_lib/rbac.js";
import {
  logSecurityEvent,
  redactLogString,
  resetSecurityAuditStateForTests,
  setSecurityAlertObserver,
  type SecurityAuditRecord,
} from "../_lib/audit.js";
import callbackHandler from "../auth/callback.js";
import tokenHandler from "../token.js";

function createMockReq(options: {
  method?: string;
  url?: string;
  headers?: Record<string, string>;
  body?: unknown;
} = {}): ApiRequest {
  const req = new EventEmitter() as unknown as ApiRequest;
  req.method = options.method ?? "POST";
  req.url = options.url ?? "/";
  const normalizedHeaders: Record<string, string> = {};
  for (const [k, v] of Object.entries(options.headers ?? {})) {
    normalizedHeaders[k.toLowerCase()] = v;
  }
  req.headers = normalizedHeaders;
  if (options.body !== undefined) {
    req.body = options.body;
  }
  return req;
}

interface MockResHandle {
  res: ApiResponse;
  headers: Record<string, string | string[]>;
  body: string;
}

function createMockRes(): MockResHandle {
  const headers: Record<string, string | string[]> = {};
  let body = "";

  const res = {
    statusCode: 200,
    setHeader(name: string, value: string | number | readonly string[]) {
      const normalized = Array.isArray(value) ? value.map(String) : String(value);
      headers[name.toLowerCase()] = normalized;
      return this;
    },
    getHeader(name: string) {
      return headers[name.toLowerCase()];
    },
    end(chunk?: unknown) {
      if (chunk !== undefined && chunk !== null) {
        body += typeof chunk === "string" ? chunk : Buffer.from(chunk as Uint8Array).toString("utf8");
      }
      return this;
    },
  } as unknown as ApiResponse;

  return {
    res,
    headers,
    get body() {
      return body;
    },
  };
}

describe("Vercel BFF Auth, RBAC, BFLA & BOLA Security Suite", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    resetSecurityAuditStateForTests();
    process.env.BFF_SESSION_SECRET = "0123456789abcdef0123456789abcdef_secret_key";
    process.env.GOOGLE_CLIENT_ID = "test-client-id.apps.googleusercontent.com";
    process.env.GOOGLE_CLIENT_SECRET = "test-server-secret-value";
    process.env.ALLOWED_ORIGINS = "https://w.example.com";
    process.env.NODE_ENV = "production";
    process.env.VERCEL = "1";
    delete process.env.ADMIN_UIDS;
    delete process.env.ADMIN_EMAILS;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe("CORS & CSRF Enforcement (api/_lib/cors.ts)", () => {
    it("never emits wildcard Access-Control-Allow-Origin and rejects untrusted origins with 403", () => {
      const req = createMockReq({
        method: "POST",
        headers: { origin: "https://evil.attacker.com" },
      });
      const mock = createMockRes();

      const allowed = enforceCorsAndCsrf(req, mock.res, {
        methods: ["POST", "OPTIONS"],
        requireSameOriginFetch: true,
      });

      expect(allowed).toBe(false);
      expect(mock.res.statusCode).toBe(403);
      expect(JSON.parse(mock.body)).toEqual({ error: "origin_forbidden" });
      expect(mock.headers["access-control-allow-origin"]).toBeUndefined();
    });

    it("echos exact allowlisted origin with credentials and rejects cross-site Sec-Fetch-Site", () => {
      const okReq = createMockReq({
        method: "POST",
        headers: {
          origin: "https://w.example.com",
          "sec-fetch-site": "same-origin",
        },
      });
      const okMock = createMockRes();
      expect(
        enforceCorsAndCsrf(okReq, okMock.res, {
          methods: ["POST", "OPTIONS"],
          requireSameOriginFetch: true,
        })
      ).toBe(true);
      expect(okMock.headers["access-control-allow-origin"]).toBe("https://w.example.com");
      expect(okMock.headers["access-control-allow-credentials"]).toBe("true");

      const csrfReq = createMockReq({
        method: "POST",
        headers: {
          origin: "https://w.example.com",
          "sec-fetch-site": "cross-site",
        },
      });
      const csrfMock = createMockRes();
      expect(
        enforceCorsAndCsrf(csrfReq, csrfMock.res, {
          methods: ["POST", "OPTIONS"],
          requireSameOriginFetch: true,
        })
      ).toBe(false);
      expect(csrfMock.res.statusCode).toBe(403);
      expect(JSON.parse(csrfMock.body)).toEqual({ error: "cross_site_forbidden" });
    });
  });

  describe("Authenticated Session Encryption (api/_lib/session.ts)", () => {
    it("seals and unseals valid payloads and rejects tampered or expired tokens", () => {
      const sealed = sealPayload({ uid: "user-123", role: "user" }, 60_000);
      const parsed = unsealPayload<{ uid: string; role: string }>(sealed);
      expect(parsed?.uid).toBe("user-123");
      expect(parsed?.role).toBe("user");

      const parts = sealed.split(".");
      const tamperedCipher = `${parts[0]}.${parts[1]}.${parts[2]}.AAAA${parts[3].slice(4)}`;
      expect(unsealPayload(tamperedCipher)).toBeNull();

      // Context-bound AAD + HKDF-SHA256 rejects cross-context ciphertext replay
      const oauthTxToken = sealPayload({ uid: "user-123" }, 60_000, "oauth_tx");
      expect(unsealPayload(oauthTxToken, "session")).toBeNull();
      expect(unsealPayload<{ uid: string }>(oauthTxToken, "oauth_tx")?.uid).toBe("user-123");

      const expired = sealPayload({ uid: "user-123" }, -1000);
      expect(unsealPayload(expired)).toBeNull();
    });

    it("fails closed when BFF_SESSION_SECRET is missing or shorter than 32 chars", () => {
      process.env.BFF_SESSION_SECRET = "too-short";
      expect(() => sealPayload({ uid: "user-1" }, 1000)).toThrow();
    });
  });

  describe("Server-Side Auth, RBAC, BFLA & BOLA (api/_lib/rbac.ts)", () => {
    it("OWASP API2:2023 — fails closed with 401 when session cookie is absent or forged", () => {
      const reqNoCookie = createMockReq();
      const resNoCookie = createMockRes();
      expect(requireSession(reqNoCookie, resNoCookie.res)).toBeNull();
      expect(resNoCookie.res.statusCode).toBe(401);

      const reqForged = createMockReq({
        headers: { cookie: `${SESSION_COOKIE_NAME}=v1.fake.tag.cipher` },
      });
      const resForged = createMockRes();
      expect(requireSession(reqForged, resForged.res)).toBeNull();
      expect(resForged.res.statusCode).toBe(401);
    });

    it("OWASP API5:2023 / Zero Trust — blocks regular user hitting admin route even with spoofed headers/body/User-Agent", () => {
      const regularCookie = sealPayload(
        {
          uid: "regular-uid-1",
          email: "user@example.com",
          name: "User",
          picture: null,
          role: "user",
          refreshToken: "rt-1",
          issuedAt: Date.now(),
        },
        60_000,
        "session"
      );

      const req = createMockReq({
        headers: {
          cookie: `${SESSION_COOKIE_NAME}=${encodeURIComponent(regularCookie)}`,
          "x-user-role": "admin",
          "user-agent": "AdminDesktopApp/2.0",
        },
        body: { role: "admin", isAdmin: true },
      });
      const mock = createMockRes();

      const session = requireRole(req, mock.res, ["admin"]);
      expect(session).toBeNull();
      expect(mock.res.statusCode).toBe(403);
      expect(JSON.parse(mock.body)).toEqual({ error: "forbidden" });
    });

    it("grants admin role exclusively from server-side allowlists", () => {
      process.env.ADMIN_UIDS = "admin-uid-99";
      process.env.ADMIN_EMAILS = "boss@example.com";

      expect(resolveServerRole("regular-uid", "regular@example.com")).toBe("user");
      expect(resolveServerRole("admin-uid-99", "regular@example.com")).toBe("admin");
      expect(resolveServerRole("other-uid", "BOSS@example.com")).toBe("admin");

      const adminCookie = sealPayload(
        {
          uid: "admin-uid-99",
          email: "boss@example.com",
          name: "Boss",
          picture: null,
          role: "admin",
          refreshToken: "rt-admin",
          issuedAt: Date.now(),
        },
        60_000,
        "session"
      );
      const req = createMockReq({
        headers: { cookie: `${SESSION_COOKIE_NAME}=${encodeURIComponent(adminCookie)}` },
      });
      const mock = createMockRes();

      const session = requireRole(req, mock.res, ["admin"]);
      expect(session?.uid).toBe("admin-uid-99");
      expect(session?.role).toBe("admin");

      // Immediate admin revocation: removing UID/email downgrades existing cookie on next request
      delete process.env.ADMIN_UIDS;
      delete process.env.ADMIN_EMAILS;
      const downgradedRes = createMockRes();
      expect(requireRole(req, downgradedRes.res, ["admin"])).toBeNull();
      expect(downgradedRes.res.statusCode).toBe(403);
    });

    it("enforces absolute session lifetime ceiling regardless of cookie expiry", () => {
      const staleIssuedAt = Date.now() - MAX_ABSOLUTE_SESSION_MS - 10_000;
      const staleCookie = sealPayload(
        {
          uid: "user-old",
          email: "old@example.com",
          name: "Old",
          picture: null,
          role: "user",
          refreshToken: "rt-old",
          issuedAt: staleIssuedAt,
        },
        60_000,
        "session"
      );
      const req = createMockReq({
        headers: { cookie: `${SESSION_COOKIE_NAME}=${encodeURIComponent(staleCookie)}` },
      });
      const mock = createMockRes();
      expect(requireSession(req, mock.res)).toBeNull();
      expect(mock.res.statusCode).toBe(401);
    });

    it("OWASP API1:2023 BOLA/IDOR — denies cross-user object access with 403", () => {
      const session = {
        uid: "attacker-uid",
        email: "attacker@example.com",
        name: null,
        picture: null,
        role: "user" as const,
        refreshToken: "rt",
        issuedAt: Date.now(),
        expiresAt: Date.now() + 60_000,
      };

      const denyRes = createMockRes();
      expect(assertResourceOwner(session, "victim-uid", denyRes.res)).toBe(false);
      expect(denyRes.res.statusCode).toBe(403);
      expect(JSON.parse(denyRes.body)).toEqual({ error: "forbidden_object_access" });

      const allowRes = createMockRes();
      expect(assertResourceOwner(session, "attacker-uid", allowRes.res)).toBe(true);
    });
  });

  describe("OAuth Callback & Token Proxy Hardening (api/auth/callback.ts, api/token.ts)", () => {
    it("rejects OAuth callback when transaction state is missing or mismatched", async () => {
      const tx = sealPayload(
        {
          state: "expected-csrf-state-123",
          nonce: "nonce-123",
          codeVerifier: "verifier-123",
          redirectUri: "https://w.example.com/api/auth/callback",
          mode: "popup",
          returnTo: "/",
        },
        60_000,
        "oauth_tx"
      );

      const req = createMockReq({
        method: "GET",
        url: "/api/auth/callback?code=auth-code&state=forged-state",
        headers: {
          origin: "https://w.example.com",
          cookie: `${OAUTH_TX_COOKIE_NAME}=${encodeURIComponent(tx)}`,
        },
      });
      const mock = createMockRes();

      await callbackHandler(req, mock.res);
      expect(mock.res.statusCode).toBe(302);
      expect(mock.headers["location"]).toBe("/oauth-complete?status=csrf_error");
    });

    it("rejects unauthenticated requests and disallowed grant_type/redirect_uri on /api/token", async () => {
      const unauthReq = createMockReq({
        method: "POST",
        headers: {
          origin: "https://w.example.com",
          "sec-fetch-site": "same-origin",
        },
        body: { grant_type: "authorization_code" },
      });
      const unauthRes = createMockRes();
      await tokenHandler(unauthReq, unauthRes.res);
      expect(unauthRes.res.statusCode).toBe(401);

      const sessionCookie = sealPayload(
        {
          uid: "user-token-test",
          email: "user@example.com",
          name: "User",
          picture: null,
          role: "user",
          refreshToken: "rt-1",
          issuedAt: Date.now(),
        },
        60_000,
        "session"
      );

      const badGrantReq = createMockReq({
        method: "POST",
        headers: {
          origin: "https://w.example.com",
          "sec-fetch-site": "same-origin",
          cookie: `${SESSION_COOKIE_NAME}=${encodeURIComponent(sessionCookie)}`,
        },
        body: { grant_type: "client_credentials" },
      });
      const badGrantRes = createMockRes();
      await tokenHandler(badGrantReq, badGrantRes.res);
      expect(badGrantRes.res.statusCode).toBe(400);
      expect(JSON.parse(badGrantRes.body)).toEqual({ error: "unsupported_grant_type" });

      const badRedirectReq = createMockReq({
        method: "POST",
        headers: {
          origin: "https://w.example.com",
          "sec-fetch-site": "same-origin",
          cookie: `${SESSION_COOKIE_NAME}=${encodeURIComponent(sessionCookie)}`,
        },
        body: {
          grant_type: "authorization_code",
          code: "abc",
          code_verifier: "xyz",
          redirect_uri: "https://evil.attacker.com/steal",
        },
      });
      const badRedirectRes = createMockRes();
      await tokenHandler(badRedirectReq, badRedirectRes.res);
      expect(badRedirectRes.res.statusCode).toBe(403);
      expect(JSON.parse(badRedirectRes.body)).toEqual({ error: "redirect_uri_forbidden" });

      // Ensure forged X-Forwarded-Host is ignored when ALLOWED_ORIGINS does not trust it
      const spoofedHostReq = createMockReq({
        method: "POST",
        headers: {
          host: "w.example.com",
          "x-forwarded-host": "evil.attacker.com",
          origin: "https://evil.attacker.com",
        },
      });
      const spoofedHostRes = createMockRes();
      await tokenHandler(spoofedHostReq, spoofedHostRes.res);
      expect(spoofedHostRes.res.statusCode).toBe(403);
    });

    it("verifyGoogleIdToken validates RSA signature, iss, aud, azp, nbf, exp, and nonce", async () => {
      const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
      const pubJwk = publicKey.export({ format: "jwk" }) as crypto.JsonWebKey & { kid?: string };
      pubJwk.kid = "test-kid-1";

      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ "cache-control": "max-age=300" }),
        json: async () => ({ keys: [pubJwk] }),
      } as unknown as Response);

      const signJwt = (header: Record<string, unknown>, payload: Record<string, unknown>) => {
        const h = Buffer.from(JSON.stringify(header)).toString("base64url");
        const p = Buffer.from(JSON.stringify(payload)).toString("base64url");
        const sig = crypto.sign("RSA-SHA256", Buffer.from(`${h}.${p}`, "utf8"), privateKey).toString("base64url");
        return `${h}.${p}.${sig}`;
      };

      try {
        const nowSec = Math.floor(Date.now() / 1000);
        const validToken = signJwt(
          { alg: "RS256", kid: "test-kid-1" },
          {
            sub: "google-sub-1",
            email: "alice@example.com",
            email_verified: true,
            iss: "https://accounts.google.com",
            aud: "test-client-id.apps.googleusercontent.com",
            azp: "test-client-id.apps.googleusercontent.com",
            nonce: "nonce-ok",
            iat: nowSec - 10,
            nbf: nowSec - 10,
            exp: nowSec + 300,
          }
        );

        const claims = await verifyGoogleIdToken(
          validToken,
          "test-client-id.apps.googleusercontent.com",
          "nonce-ok"
        );
        expect(claims.sub).toBe("google-sub-1");

        const futureNbfToken = signJwt(
          { alg: "RS256", kid: "test-kid-1" },
          {
            sub: "google-sub-1",
            email: "alice@example.com",
            email_verified: true,
            iss: "https://accounts.google.com",
            aud: "test-client-id.apps.googleusercontent.com",
            nonce: "nonce-ok",
            nbf: nowSec + 600,
            exp: nowSec + 900,
          }
        );
        await expect(
          verifyGoogleIdToken(futureNbfToken, "test-client-id.apps.googleusercontent.com", "nonce-ok")
        ).rejects.toThrow("id_token_not_yet_valid");

        const badAzpToken = signJwt(
          { alg: "RS256", kid: "test-kid-1" },
          {
            sub: "google-sub-1",
            email: "alice@example.com",
            email_verified: true,
            iss: "https://accounts.google.com",
            aud: "test-client-id.apps.googleusercontent.com",
            azp: "wrong-client-id",
            nonce: "nonce-ok",
            exp: nowSec + 300,
          }
        );
        await expect(
          verifyGoogleIdToken(badAzpToken, "test-client-id.apps.googleusercontent.com", "nonce-ok")
        ).rejects.toThrow("invalid_id_token_azp");
      } finally {
        fetchSpy.mockRestore();
      }
    });
  });

  describe("Security Logging, Redaction & Anomaly Alerting (OWASP A09 / api/_lib/audit.ts)", () => {
    it("redacts secrets, tokens, query params, and strips newline log injection characters", () => {
      const sanitized = redactLogString(
        "auth failed\r\nFAKE_LOG Bearer secretTok_123 GOCSPX-mySecret gsk_abc eyJhbGciOiJIUzI1NiJ9.a.b /api/auth/callback?code=authcode&state=s1"
      );
      expect(sanitized).not.toContain("\n");
      expect(sanitized).not.toContain("\r");
      expect(sanitized).not.toContain("secretTok_123");
      expect(sanitized).not.toContain("GOCSPX-mySecret");
      expect(sanitized).not.toContain("gsk_abc");
      expect(sanitized).not.toContain("eyJhbGciOiJIUzI1NiJ9");
      expect(sanitized).not.toContain("authcode");
    });

    it("triggers alerts on HIGH findings and escalates repeated WARN anomalies to CRITICAL", () => {
      const alerts: SecurityAuditRecord[] = [];
      setSecurityAlertObserver((rec) => alerts.push(rec));

      const req = createMockReq({
        method: "POST",
        url: "/api/auth/refresh?code=sensitive",
        headers: { origin: "https://w.example.com", "x-forwarded-for": "203.0.113.9" },
      });

      for (let i = 0; i < 4; i++) {
        const rec = logSecurityEvent({
          owasp: "A07",
          event: "ACCESS_DENIED_UNAUTH",
          severity: "WARN",
          req,
        });
        expect(rec.route).toBe("/api/auth/refresh");
        expect(rec.severity).toBe("WARN");
      }
      expect(alerts.length).toBe(0);

      // 5th consecutive failure from same client IP hash triggers CRITICAL spike alert
      const escalated = logSecurityEvent({
        owasp: "A07",
        event: "ACCESS_DENIED_UNAUTH",
        severity: "WARN",
        req,
      });
      expect(escalated.severity).toBe("CRITICAL");
      expect(escalated.thresholdTriggered).toBe(true);
      expect(alerts.length).toBe(1);
    });
  });
});
