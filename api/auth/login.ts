import { logSecurityEvent } from "../_lib/audit.js";
import { enforceCorsAndCsrf, resolveAllowedOrigins } from "../_lib/cors.js";
import {
  getRequestOrigin,
  getSearchParams,
  sanitizeReturnTo,
  sendJson,
  sendRedirect,
  type ApiRequest,
  type ApiResponse,
} from "../_lib/http.js";
import {
  appendSetCookie,
  generateUrlSafeRandom,
  getServerOAuthConfig,
  OAUTH_TX_COOKIE_NAME,
  sealPayload,
  sha256Base64Url,
  shouldUseSecureCookies,
} from "../_lib/session.js";

const OAUTH_TX_TTL_MS = 10 * 60 * 1000;

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  if (!enforceCorsAndCsrf(req, res, { methods: ["GET", "OPTIONS"] })) return;

  if (req.method !== "GET") {
    sendJson(res, 405, { error: "method_not_allowed" });
    return;
  }

  try {
    const { clientId } = getServerOAuthConfig();
    const requestOrigin = getRequestOrigin(req);
    const allowedOrigins = resolveAllowedOrigins(req);
    if (!requestOrigin || !allowedOrigins.has(requestOrigin)) {
      logSecurityEvent({
        owasp: "A01",
        event: "ACCESS_DENIED_ORIGIN",
        severity: "WARN",
        req,
        reason: "login_origin_forbidden",
      });
      sendJson(res, 403, { error: "origin_forbidden" });
      return;
    }

    const params = getSearchParams(req);
    const mode = params.get("mode") === "redirect" ? "redirect" : "popup";
    const returnTo = sanitizeReturnTo(params.get("returnTo"));

    const state = generateUrlSafeRandom(32);
    const nonce = generateUrlSafeRandom(32);
    const codeVerifier = generateUrlSafeRandom(64);
    const codeChallenge = sha256Base64Url(codeVerifier);
    const redirectUri = `${requestOrigin}/api/auth/callback`;

    const sealedTx = sealPayload(
      {
        state,
        nonce,
        codeVerifier,
        redirectUri,
        mode,
        returnTo,
      },
      OAUTH_TX_TTL_MS,
      "oauth_tx"
    );

    appendSetCookie(res, OAUTH_TX_COOKIE_NAME, sealedTx, {
      path: "/api/auth",
      maxAgeSeconds: 600,
      sameSite: "Lax",
      secure: shouldUseSecureCookies(req),
    });

    const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    authUrl.searchParams.set("client_id", clientId);
    authUrl.searchParams.set("redirect_uri", redirectUri);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("scope", "openid email profile https://www.googleapis.com/auth/drive.file");
    authUrl.searchParams.set("state", state);
    authUrl.searchParams.set("nonce", nonce);
    authUrl.searchParams.set("access_type", "offline");
    authUrl.searchParams.set("prompt", "consent select_account");
    authUrl.searchParams.set("code_challenge", codeChallenge);
    authUrl.searchParams.set("code_challenge_method", "S256");

    logSecurityEvent({
      owasp: "A07",
      event: "AUTH_LOGIN_START",
      severity: "INFO",
      req,
      details: { mode },
    });
    sendRedirect(res, authUrl.toString());
  } catch (err) {
    logSecurityEvent({
      owasp: "A09",
      event: "AUTH_LOGIN_CONFIG_ERROR",
      severity: "HIGH",
      req,
      reason: err instanceof Error ? err.message : "server_configuration_error",
    });
    sendJson(res, 500, { error: "server_configuration_error" });
  }
}
