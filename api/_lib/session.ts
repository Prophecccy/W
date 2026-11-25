import crypto from "node:crypto";
import type { ApiRequest, ApiResponse } from "./http.js";
import { getHeader } from "./http.js";

export const SESSION_COOKIE_NAME = "w_bff_session";
export const OAUTH_TX_COOKIE_NAME = "w_oauth_tx";

const SESSION_HKDF_SALT = Buffer.from("w-bff-hkdf-salt-v2", "utf8");
const GOOGLE_JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";

export type SealedPurpose = "session" | "oauth_tx" | "generic";

interface CachedJwks {
  keys: crypto.JsonWebKey[];
  expiresAt: number;
}

let jwksCache: CachedJwks | null = null;

function derivePurposeKey(purpose: SealedPurpose): Buffer {
  const secret = process.env.BFF_SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("BFF_SESSION_SECRET is missing or shorter than 32 characters.");
  }
  const derived = crypto.hkdfSync(
    "sha256",
    Buffer.from(secret, "utf8"),
    SESSION_HKDF_SALT,
    Buffer.from(`w-bff:${purpose}`, "utf8"),
    32
  );
  return Buffer.from(derived);
}

/**
 * Encrypts and authenticates a JSON payload using HKDF-SHA256 derived keys and AES-256-GCM
 * with context-bound Additional Authenticated Data (AAD) and an embedded expiry.
 */
export function sealPayload(
  payload: Record<string, unknown>,
  ttlMs: number,
  purpose: SealedPurpose = "generic"
): string {
  const key = derivePurposeKey(purpose);
  const iv = crypto.randomBytes(12);
  const exp = Date.now() + ttlMs;
  const body = JSON.stringify({ ...payload, exp });
  const aad = Buffer.from(`w-bff:${purpose}`, "utf8");

  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(aad);
  const ciphertext = Buffer.concat([cipher.update(body, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [
    "v2",
    iv.toString("base64url"),
    tag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}

/**
 * Decrypts and verifies a context-bound AES-256-GCM sealed payload; returns null on tamper,
 * wrong context purpose, or expiry.
 */
export function unsealPayload<T extends object>(
  token: string | undefined,
  purpose: SealedPurpose = "generic"
): (T & { exp: number }) | null {
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 4 || parts[0] !== "v2") return null;

  try {
    const key = derivePurposeKey(purpose);
    const iv = Buffer.from(parts[1], "base64url");
    const tag = Buffer.from(parts[2], "base64url");
    const ciphertext = Buffer.from(parts[3], "base64url");

    if (iv.length !== 12 || tag.length !== 16 || ciphertext.length === 0) {
      return null;
    }

    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAAD(Buffer.from(`w-bff:${purpose}`, "utf8"));
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
    const parsed = JSON.parse(plain) as T & { exp?: unknown };

    if (typeof parsed.exp !== "number" || Date.now() >= parsed.exp) {
      return null;
    }
    return parsed as T & { exp: number };
  } catch {
    return null;
  }
}

/**
 * Parses Cookie header safely without throwing on malformed values.
 */
export function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!cookieHeader) return out;

  for (const part of cookieHeader.split(";")) {
    const eqIdx = part.indexOf("=");
    if (eqIdx <= 0) continue;
    const key = part.slice(0, eqIdx).trim();
    const rawVal = part.slice(eqIdx + 1).trim();
    if (!key) continue;
    try {
      out[key] = decodeURIComponent(rawVal);
    } catch {
      out[key] = rawVal;
    }
  }
  return out;
}

export function shouldUseSecureCookies(req?: ApiRequest): boolean {
  if (process.env.NODE_ENV === "production" || process.env.VERCEL === "1") {
    return true;
  }
  if (req) {
    const proto = getHeader(req, "x-forwarded-proto");
    if (proto === "https") return true;
  }
  return false;
}

export interface CookieOptions {
  path?: string;
  maxAgeSeconds?: number;
  sameSite?: "Lax" | "Strict";
  secure?: boolean;
}

/**
 * Appends a Set-Cookie header cleanly while preserving any existing Set-Cookie headers.
 */
export function appendSetCookie(res: ApiResponse, name: string, value: string, opts: CookieOptions): void {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    `Path=${opts.path || "/api"}`,
    "HttpOnly",
    `SameSite=${opts.sameSite || "Lax"}`,
  ];
  if (typeof opts.maxAgeSeconds === "number") {
    parts.push(`Max-Age=${Math.max(0, Math.floor(opts.maxAgeSeconds))}`);
  }
  if (opts.secure) {
    parts.push("Secure");
  }

  const serialized = parts.join("; ");
  const existing = res.getHeader("Set-Cookie");
  if (!existing) {
    res.setHeader("Set-Cookie", serialized);
  } else if (Array.isArray(existing)) {
    res.setHeader("Set-Cookie", [...existing, serialized]);
  } else {
    res.setHeader("Set-Cookie", [String(existing), serialized]);
  }
}

export function clearCookie(res: ApiResponse, req: ApiRequest, name: string, path = "/api"): void {
  appendSetCookie(res, name, "", {
    path,
    maxAgeSeconds: 0,
    sameSite: "Lax",
    secure: shouldUseSecureCookies(req),
  });
}

export function generateUrlSafeRandom(byteLength = 32): string {
  return crypto.randomBytes(byteLength).toString("base64url");
}

export function sha256Base64Url(input: string): string {
  return crypto.createHash("sha256").update(input, "utf8").digest("base64url");
}

export function timingSafeEqualStrings(a: string | undefined | null, b: string | undefined | null): boolean {
  if (!a || !b) return false;
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Resolves Google OAuth server configuration strictly from server environment variables.
 * Never falls back to VITE_GOOGLE_CLIENT_SECRET or hardcoded client IDs.
 */
export function getServerOAuthConfig(): { clientId: string; clientSecret: string } {
  const clientId = (process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID || "").trim();
  const clientSecret = (process.env.GOOGLE_CLIENT_SECRET || "").trim();

  if (!clientId || !clientSecret) {
    throw new Error("Server OAuth configuration missing (GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET).");
  }
  return { clientId, clientSecret };
}

export interface VerifiedGoogleClaims {
  sub: string;
  email: string;
  email_verified: boolean;
  name?: string;
  picture?: string;
  nonce?: string;
  azp?: string;
  aud: string;
  iss: string;
  iat?: number;
  nbf?: number;
  exp: number;
}

async function fetchGoogleJwks(): Promise<crypto.JsonWebKey[]> {
  if (jwksCache && Date.now() < jwksCache.expiresAt) {
    return jwksCache.keys;
  }

  const res = await fetch(GOOGLE_JWKS_URL);
  if (!res.ok) {
    throw new Error(`Failed to fetch Google JWKS (${res.status})`);
  }

  const cacheControl = res.headers.get("cache-control") || "";
  const maxAgeMatch = cacheControl.match(/max-age=(\d+)/i);
  const ttlMs = maxAgeMatch ? Math.min(parseInt(maxAgeMatch[1], 10) * 1000, 3_600_000) : 300_000;

  const data = (await res.json()) as { keys?: (crypto.JsonWebKey & { kid?: string; alg?: string })[] };
  if (!Array.isArray(data.keys) || data.keys.length === 0) {
    throw new Error("Empty JWKS returned from Google.");
  }

  jwksCache = {
    keys: data.keys,
    expiresAt: Date.now() + ttlMs,
  };
  return data.keys;
}

/**
 * Verifies a Google OIDC id_token (RS256 signature via Google JWKS + issuer, audience, expiry, and nonce).
 */
export async function verifyGoogleIdToken(
  idToken: string,
  expectedClientId: string,
  expectedNonce: string
): Promise<VerifiedGoogleClaims> {
  const segments = idToken.split(".");
  if (segments.length !== 3) {
    throw new Error("invalid_id_token_format");
  }

  const [headerB64, payloadB64, sigB64] = segments;
  const header = JSON.parse(Buffer.from(headerB64, "base64url").toString("utf8")) as {
    alg?: string;
    kid?: string;
  };
  if (header.alg !== "RS256" || !header.kid) {
    throw new Error("unsupported_id_token_alg");
  }

  const keys = await fetchGoogleJwks();
  const jwk = keys.find((k) => (k as { kid?: string }).kid === header.kid);
  if (!jwk) {
    // Force cache refresh once in case of key rotation
    jwksCache = null;
    const freshKeys = await fetchGoogleJwks();
    const freshJwk = freshKeys.find((k) => (k as { kid?: string }).kid === header.kid);
    if (!freshJwk) {
      throw new Error("unknown_id_token_kid");
    }
    verifyJwtSignature(headerB64, payloadB64, sigB64, freshJwk);
  } else {
    verifyJwtSignature(headerB64, payloadB64, sigB64, jwk);
  }

  const claims = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8")) as VerifiedGoogleClaims;
  const nowMs = Date.now();
  if (claims.iss !== "https://accounts.google.com" && claims.iss !== "accounts.google.com") {
    throw new Error("invalid_id_token_issuer");
  }
  if (claims.aud !== expectedClientId) {
    throw new Error("invalid_id_token_audience");
  }
  if (typeof claims.azp === "string" && claims.azp !== expectedClientId) {
    throw new Error("invalid_id_token_azp");
  }
  if (typeof claims.exp !== "number" || claims.exp * 1000 <= nowMs) {
    throw new Error("expired_id_token");
  }
  if (typeof claims.nbf === "number" && claims.nbf * 1000 > nowMs + 60_000) {
    throw new Error("id_token_not_yet_valid");
  }
  if (typeof claims.iat === "number" && claims.iat * 1000 > nowMs + 60_000) {
    throw new Error("id_token_invalid_iat");
  }
  if (!timingSafeEqualStrings(claims.nonce, expectedNonce)) {
    throw new Error("invalid_id_token_nonce");
  }
  if (
    typeof claims.sub !== "string" ||
    !claims.sub.trim() ||
    typeof claims.email !== "string" ||
    !claims.email.includes("@") ||
    claims.email_verified !== true
  ) {
    throw new Error("unverified_google_account");
  }

  return claims;
}

function verifyJwtSignature(
  headerB64: string,
  payloadB64: string,
  sigB64: string,
  jwk: crypto.JsonWebKey
): void {
  const pubKey = crypto.createPublicKey({ key: jwk, format: "jwk" });
  const signingInput = Buffer.from(`${headerB64}.${payloadB64}`, "utf8");
  const signature = Buffer.from(sigB64, "base64url");
  const ok = crypto.verify("RSA-SHA256", signingInput, pubKey, signature);
  if (!ok) {
    throw new Error("invalid_id_token_signature");
  }
}
