import { logSecurityEvent } from "./audit.js";
import { getHeader, sendJson, type ApiRequest, type ApiResponse } from "./http.js";
import { parseCookies, SESSION_COOKIE_NAME, unsealPayload } from "./session.js";

export type Role = "user" | "admin";

export const MAX_ABSOLUTE_SESSION_MS = 30 * 24 * 60 * 60 * 1000;

export interface AuthenticatedSession {
  uid: string;
  email: string;
  name: string | null;
  picture: string | null;
  role: Role;
  refreshToken: string;
  issuedAt: number;
  expiresAt: number;
}

/**
 * Resolves user role strictly on the server from environment allowlists.
 * Never accepts roles from request bodies, headers, query parameters, or UI flags.
 */
export function resolveServerRole(uid: string, email: string | null): Role {
  const adminUids = (process.env.ADMIN_UIDS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (adminUids.includes(uid)) {
    return "admin";
  }

  const adminEmails = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (email && adminEmails.includes(email.toLowerCase())) {
    return "admin";
  }

  return "user";
}

/**
 * Reads and verifies the sealed HttpOnly session cookie without writing an error response.
 */
export function readSessionFromRequest(req: ApiRequest): AuthenticatedSession | null {
  const cookies = parseCookies(getHeader(req, "cookie"));
  const raw = cookies[SESSION_COOKIE_NAME];
  if (!raw) return null;

  const session = unsealPayload<Omit<AuthenticatedSession, "expiresAt"> & { exp: number }>(raw, "session");
  if (
    !session ||
    typeof session.uid !== "string" ||
    !session.uid.trim() ||
    typeof session.email !== "string" ||
    typeof session.refreshToken !== "string" ||
    !session.refreshToken.trim() ||
    typeof session.issuedAt !== "number" ||
    !Number.isFinite(session.issuedAt)
  ) {
    return null;
  }

  const now = Date.now();
  if (session.issuedAt > now + 60_000 || now - session.issuedAt >= MAX_ABSOLUTE_SESSION_MS) {
    return null;
  }

  // Always recompute privileges from server allowlists so admin revocation takes immediate effect
  const role: Role = resolveServerRole(session.uid, session.email);
  return {
    uid: session.uid,
    email: session.email,
    name: session.name ?? null,
    picture: session.picture ?? null,
    role,
    refreshToken: session.refreshToken,
    issuedAt: session.issuedAt,
    expiresAt: session.exp,
  };
}

/**
 * Server-side Authentication Gate (OWASP API2:2023).
 * Fails closed with 401 if no valid server-sealed session cookie is present.
 */
export function requireSession(req: ApiRequest, res: ApiResponse): AuthenticatedSession | null {
  const session = readSessionFromRequest(req);
  if (!session) {
    logSecurityEvent({
      owasp: "A07",
      event: "ACCESS_DENIED_UNAUTH",
      severity: "WARN",
      req,
      reason: "unauthorized",
    });
    sendJson(res, 401, { error: "unauthorized" });
    return null;
  }
  return session;
}

/**
 * Server-side Function-Level Authorization & RBAC Gate (OWASP API5:2023 / A01:2025).
 * Blocks regular users from privileged/admin endpoints with 403 Forbidden.
 */
export function requireRole(
  req: ApiRequest,
  res: ApiResponse,
  allowedRoles: readonly Role[]
): AuthenticatedSession | null {
  const session = requireSession(req, res);
  if (!session) return null;

  if (!allowedRoles.includes(session.role)) {
    logSecurityEvent({
      owasp: "A01",
      event: "ACCESS_DENIED_BFLA",
      severity: "HIGH",
      req,
      uid: session.uid,
      reason: "forbidden",
    });
    sendJson(res, 403, { error: "forbidden" });
    return null;
  }

  return session;
}

/**
 * Server-side Object-Level Authorization Gate (OWASP API1:2023 BOLA / IDOR).
 * Ensures the authenticated user owns the target object before reading or mutating it.
 */
export function assertResourceOwner(
  session: AuthenticatedSession,
  resourceOwnerUid: string,
  res: ApiResponse,
  req?: ApiRequest
): boolean {
  if (!resourceOwnerUid || session.uid !== resourceOwnerUid) {
    logSecurityEvent({
      owasp: "A01",
      event: "ACCESS_DENIED_BOLA",
      severity: "HIGH",
      req,
      uid: session.uid,
      reason: "forbidden_object_access",
    });
    sendJson(res, 403, { error: "forbidden_object_access" });
    return false;
  }
  return true;
}
