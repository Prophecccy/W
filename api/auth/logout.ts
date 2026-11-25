import { logSecurityEvent } from "../_lib/audit.js";
import { enforceCorsAndCsrf } from "../_lib/cors.js";
import { sendJson, type ApiRequest, type ApiResponse } from "../_lib/http.js";
import { readSessionFromRequest } from "../_lib/rbac.js";
import { clearCookie, OAUTH_TX_COOKIE_NAME, SESSION_COOKIE_NAME } from "../_lib/session.js";

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  if (!enforceCorsAndCsrf(req, res, { methods: ["POST", "OPTIONS"], requireSameOriginFetch: true })) {
    return;
  }

  if (req.method !== "POST") {
    sendJson(res, 405, { error: "method_not_allowed" });
    return;
  }

  let sessionUid: string | null = null;
  try {
    const session = readSessionFromRequest(req);
    sessionUid = session?.uid ?? null;
    if (session?.refreshToken) {
      await fetch("https://oauth2.googleapis.com/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token: session.refreshToken }),
      }).catch(() => {});
    }
  } catch {
    // Always proceed to clear local cookies even if upstream revocation fails
  }

  clearCookie(res, req, SESSION_COOKIE_NAME, "/api");
  clearCookie(res, req, OAUTH_TX_COOKIE_NAME, "/api/auth");
  logSecurityEvent({
    owasp: "A07",
    event: "AUTH_LOGOUT",
    severity: "INFO",
    req,
    uid: sessionUid,
  });
  sendJson(res, 200, { ok: true });
}
