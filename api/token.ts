import { logSecurityEvent } from "./_lib/audit.js";
import { enforceCorsAndCsrf, resolveAllowedOrigins } from "./_lib/cors.js";
import { readJsonBody, sendJson, type ApiRequest, type ApiResponse } from "./_lib/http.js";
import { requireSession } from "./_lib/rbac.js";
import { getServerOAuthConfig } from "./_lib/session.js";

function isAllowedRedirectUri(uri: string, req: ApiRequest): boolean {
  try {
    const parsed = new URL(uri);
    const allowedOrigins = resolveAllowedOrigins(req);
    return allowedOrigins.has(parsed.origin);
  } catch {
    return false;
  }
}

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  if (!enforceCorsAndCsrf(req, res, { methods: ["POST", "OPTIONS"], requireSameOriginFetch: true })) {
    return;
  }

  if (req.method !== "POST") {
    sendJson(res, 405, { error: "method_not_allowed" });
    return;
  }

  // OWASP A01:2025 — Require an authenticated BFF session before exercising server credentials
  const session = requireSession(req, res);
  if (!session) return;

  try {
    const body = await readJsonBody(req);
    const grantType = typeof body.grant_type === "string" ? body.grant_type : "";

    if (grantType !== "authorization_code" && grantType !== "refresh_token") {
      logSecurityEvent({
        owasp: "A05",
        event: "TOKEN_PROXY_UNSUPPORTED_GRANT",
        severity: "WARN",
        req,
        uid: session.uid,
        reason: grantType || "empty",
      });
      sendJson(res, 400, { error: "unsupported_grant_type" });
      return;
    }

    const { clientId, clientSecret } = getServerOAuthConfig();

    const params: Record<string, string> = {
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: grantType,
    };

    if (grantType === "refresh_token") {
      const refreshToken = typeof body.refresh_token === "string" ? body.refresh_token.trim() : "";
      if (!refreshToken) {
        sendJson(res, 400, { error: "missing_refresh_token" });
        return;
      }
      params.refresh_token = refreshToken;
    } else {
      const code = typeof body.code === "string" ? body.code.trim() : "";
      const codeVerifier = typeof body.code_verifier === "string" ? body.code_verifier.trim() : "";
      const redirectUri = typeof body.redirect_uri === "string" ? body.redirect_uri.trim() : "";

      if (!code || !codeVerifier || !redirectUri) {
        sendJson(res, 400, { error: "invalid_request" });
        return;
      }

      if (!isAllowedRedirectUri(redirectUri, req)) {
        logSecurityEvent({
          owasp: "A01",
          event: "TOKEN_PROXY_FORBIDDEN_REDIRECT",
          severity: "HIGH",
          req,
          uid: session.uid,
          reason: "redirect_uri_forbidden",
        });
        sendJson(res, 403, { error: "redirect_uri_forbidden" });
        return;
      }

      params.code = code;
      params.code_verifier = codeVerifier;
      params.redirect_uri = redirectUri;
    }

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(params),
    });

    const data = await tokenRes.json().catch(() => ({ error: "upstream_invalid_json" }));
    sendJson(res, tokenRes.status, data);
  } catch (err) {
    console.error("[api/token] Token proxy execution error:", err);
    sendJson(res, 500, { error: "internal_error" });
  }
}
