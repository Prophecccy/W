import { enforceCorsAndCsrf } from "../_lib/cors.js";
import { sendJson, type ApiRequest, type ApiResponse } from "../_lib/http.js";
import { readSessionFromRequest } from "../_lib/rbac.js";

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  if (!enforceCorsAndCsrf(req, res, { methods: ["GET", "OPTIONS"] })) return;

  if (req.method !== "GET") {
    sendJson(res, 405, { error: "method_not_allowed" });
    return;
  }

  try {
    const session = readSessionFromRequest(req);
    if (!session) {
      sendJson(res, 200, { authenticated: false, user: null });
      return;
    }

    sendJson(res, 200, {
      authenticated: true,
      user: {
        uid: session.uid,
        email: session.email,
        displayName: session.name,
        photoURL: session.picture,
        role: session.role,
      },
    });
  } catch {
    sendJson(res, 200, { authenticated: false, user: null });
  }
}
