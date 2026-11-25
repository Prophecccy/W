import { logSecurityEvent } from "../_lib/audit.js";
import { enforceCorsAndCsrf } from "../_lib/cors.js";
import { sendJson, type ApiRequest, type ApiResponse } from "../_lib/http.js";
import { MAX_ABSOLUTE_SESSION_MS, requireSession, resolveServerRole } from "../_lib/rbac.js";
import {
  appendSetCookie,
  clearCookie,
  getServerOAuthConfig,
  sealPayload,
  SESSION_COOKIE_NAME,
  shouldUseSecureCookies,
} from "../_lib/session.js";

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  if (!enforceCorsAndCsrf(req, res, { methods: ["POST", "OPTIONS"], requireSameOriginFetch: true })) {
    return;
  }

  if (req.method !== "POST") {
    sendJson(res, 405, { error: "method_not_allowed" });
    return;
  }

  const session = requireSession(req, res);
  if (!session) return;

  try {
    const { clientId, clientSecret } = getServerOAuthConfig();

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: session.refreshToken,
        grant_type: "refresh_token",
      }),
    });

    const data = (await tokenRes.json().catch(() => ({}))) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      error?: string;
    };

    if (!tokenRes.ok || !data.access_token) {
      if (data.error === "invalid_grant") {
        logSecurityEvent({
          owasp: "A07",
          event: "AUTH_SESSION_EXPIRED",
          severity: "WARN",
          req,
          uid: session.uid,
          reason: "invalid_grant",
        });
        clearCookie(res, req, SESSION_COOKIE_NAME, "/api");
        sendJson(res, 401, { error: "session_expired" });
        return;
      }
      logSecurityEvent({
        owasp: "A09",
        event: "AUTH_REFRESH_UPSTREAM_FAILED",
        severity: "WARN",
        req,
        uid: session.uid,
        reason: data.error || `http_${tokenRes.status}`,
      });
      sendJson(res, 502, { error: "upstream_token_refresh_failed" });
      return;
    }

    if (data.refresh_token && data.refresh_token !== session.refreshToken) {
      const remainingMs = Math.max(0, MAX_ABSOLUTE_SESSION_MS - (Date.now() - session.issuedAt));
      if (remainingMs <= 0) {
        logSecurityEvent({
          owasp: "A07",
          event: "AUTH_SESSION_ABSOLUTE_EXPIRY",
          severity: "WARN",
          req,
          uid: session.uid,
          reason: "max_session_age_exceeded",
        });
        clearCookie(res, req, SESSION_COOKIE_NAME, "/api");
        sendJson(res, 401, { error: "session_expired" });
        return;
      }
      const nextTtlMs = Math.min(SESSION_TTL_MS, remainingMs);
      const updatedCookie = sealPayload(
        {
          uid: session.uid,
          email: session.email,
          name: session.name,
          picture: session.picture,
          role: resolveServerRole(session.uid, session.email),
          refreshToken: data.refresh_token,
          issuedAt: session.issuedAt,
        },
        nextTtlMs,
        "session"
      );
      appendSetCookie(res, SESSION_COOKIE_NAME, updatedCookie, {
        path: "/api",
        maxAgeSeconds: Math.floor(nextTtlMs / 1000),
        sameSite: "Lax",
        secure: shouldUseSecureCookies(req),
      });
    }

    sendJson(res, 200, {
      user: {
        uid: session.uid,
        email: session.email,
        displayName: session.name,
        photoURL: session.picture,
        role: session.role,
      },
      accessToken: data.access_token,
      expiresIn: typeof data.expires_in === "number" ? data.expires_in : 3600,
    });
  } catch (err) {
    console.error("[api/auth/refresh] Execution error:", err);
    sendJson(res, 500, { error: "internal_error" });
  }
}
