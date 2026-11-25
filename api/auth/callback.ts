import { logSecurityEvent } from "../_lib/audit.js";
import { enforceCorsAndCsrf } from "../_lib/cors.js";
import {
  getHeader,
  getSearchParams,
  sanitizeReturnTo,
  sendJson,
  sendRedirect,
  type ApiRequest,
  type ApiResponse,
} from "../_lib/http.js";
import { readSessionFromRequest, resolveServerRole } from "../_lib/rbac.js";
import {
  appendSetCookie,
  clearCookie,
  getServerOAuthConfig,
  OAUTH_TX_COOKIE_NAME,
  parseCookies,
  sealPayload,
  SESSION_COOKIE_NAME,
  shouldUseSecureCookies,
  timingSafeEqualStrings,
  unsealPayload,
  verifyGoogleIdToken,
} from "../_lib/session.js";

interface OAuthTxPayload {
  state: string;
  nonce: string;
  codeVerifier: string;
  redirectUri: string;
  mode: "popup" | "redirect";
  returnTo: string;
}

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  if (!enforceCorsAndCsrf(req, res, { methods: ["GET", "OPTIONS"] })) return;

  if (req.method !== "GET") {
    sendJson(res, 405, { error: "method_not_allowed" });
    return;
  }

  const cookies = parseCookies(getHeader(req, "cookie"));
  const tx = unsealPayload<OAuthTxPayload>(cookies[OAUTH_TX_COOKIE_NAME], "oauth_tx");

  // Single-use transaction cookie — always clear immediately on callback
  clearCookie(res, req, OAUTH_TX_COOKIE_NAME, "/api/auth");

  const params = getSearchParams(req);
  const oauthError = params.get("error");
  if (oauthError) {
    logSecurityEvent({
      owasp: "A07",
      event: "AUTH_PROVIDER_ERROR",
      severity: "WARN",
      req,
      reason: oauthError,
    });
    const dest = tx?.mode === "popup" ? "/oauth-complete?status=error" : "/login?auth_error=oauth_denied";
    sendRedirect(res, dest);
    return;
  }

  const code = params.get("code");
  const returnedState = params.get("state");

  if (!tx || !code || !returnedState || !timingSafeEqualStrings(returnedState, tx.state)) {
    logSecurityEvent({
      owasp: "A07",
      event: "AUTH_CSRF_STATE_MISMATCH",
      severity: "HIGH",
      req,
      reason: !tx ? "missing_tx_cookie" : "state_mismatch",
    });
    const dest = tx?.mode === "popup" ? "/oauth-complete?status=csrf_error" : "/login?auth_error=invalid_state";
    sendRedirect(res, dest);
    return;
  }

  try {
    const { clientId, clientSecret } = getServerOAuthConfig();

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        code_verifier: tx.codeVerifier,
        redirect_uri: tx.redirectUri,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenRes.ok) {
      console.error("[api/auth/callback] Google token exchange failed:", tokenRes.status);
      const dest = tx.mode === "popup" ? "/oauth-complete?status=token_error" : "/login?auth_error=token_exchange";
      sendRedirect(res, dest);
      return;
    }

    const tokenData = (await tokenRes.json()) as {
      access_token?: string;
      refresh_token?: string;
      id_token?: string;
    };

    if (!tokenData.id_token) {
      const dest = tx.mode === "popup" ? "/oauth-complete?status=missing_id_token" : "/login?auth_error=missing_id_token";
      sendRedirect(res, dest);
      return;
    }

    const claims = await verifyGoogleIdToken(tokenData.id_token, clientId, tx.nonce);

    // Only reuse an existing refresh_token if it belongs to the exact same verified subject
    const existingSession = readSessionFromRequest(req);
    const sameSubjectRefresh =
      existingSession && existingSession.uid === claims.sub ? existingSession.refreshToken : "";
    const refreshToken = tokenData.refresh_token || sameSubjectRefresh;

    if (!refreshToken) {
      const dest = tx.mode === "popup" ? "/oauth-complete?status=missing_refresh" : "/login?auth_error=missing_refresh";
      sendRedirect(res, dest);
      return;
    }

    const sealedSession = sealPayload(
      {
        uid: claims.sub,
        email: claims.email,
        name: claims.name ?? null,
        picture: claims.picture ?? null,
        role: resolveServerRole(claims.sub, claims.email),
        refreshToken,
        issuedAt: Date.now(),
      },
      SESSION_TTL_MS,
      "session"
    );

    appendSetCookie(res, SESSION_COOKIE_NAME, sealedSession, {
      path: "/api",
      maxAgeSeconds: Math.floor(SESSION_TTL_MS / 1000),
      sameSite: "Lax",
      secure: shouldUseSecureCookies(req),
    });

    logSecurityEvent({
      owasp: "A07",
      event: "AUTH_SUCCESS",
      severity: "INFO",
      req,
      uid: claims.sub,
    });

    if (tx.mode === "popup") {
      sendRedirect(res, "/oauth-complete?status=ok");
    } else {
      sendRedirect(res, sanitizeReturnTo(tx.returnTo));
    }
  } catch (err) {
    logSecurityEvent({
      owasp: "A07",
      event: "AUTH_CALLBACK_VERIFICATION_FAILED",
      severity: "HIGH",
      req,
      reason: err instanceof Error ? err.message : "verification_failed",
    });
    const dest = tx.mode === "popup" ? "/oauth-complete?status=error" : "/login?auth_error=verification_failed";
    sendRedirect(res, dest);
  }
}
