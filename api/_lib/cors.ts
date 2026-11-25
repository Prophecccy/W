import { logSecurityEvent } from "./audit.js";
import { ApiRequest, ApiResponse, getHeader, getRequestOrigin, sendJson } from "./http.js";

const DEV_LOCAL_ORIGINS = [
  "http://localhost:5173",
  "http://localhost:1420",
  "http://localhost:3000",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:1420",
  "http://127.0.0.1:3000",
];

function isProductionEnv(): boolean {
  return process.env.NODE_ENV === "production" || process.env.VERCEL === "1";
}

/**
 * Computes the strict set of allowed origins from ALLOWED_ORIGINS,
 * Vercel deployment URLs, and localhost only when not in production.
 */
export function resolveAllowedOrigins(req?: ApiRequest): Set<string> {
  const allowed = new Set<string>();

  const rawList = process.env.ALLOWED_ORIGINS || "";
  for (const entry of rawList.split(",")) {
    const trimmed = entry.trim();
    if (!trimmed) continue;
    try {
      allowed.add(new URL(trimmed).origin);
    } catch {
      // Ignore malformed origin config entries
    }
  }

  for (const hostVar of [process.env.VERCEL_URL, process.env.VERCEL_PROJECT_PRODUCTION_URL]) {
    if (hostVar && !/[\s/@]/.test(hostVar)) {
      const normalized = hostVar.startsWith("http") ? hostVar : `https://${hostVar}`;
      try {
        allowed.add(new URL(normalized).origin);
      } catch {
        // Ignore malformed host
      }
    }
  }

  if (!isProductionEnv()) {
    if (req) {
      const reqOrigin = getRequestOrigin(req);
      if (reqOrigin) {
        allowed.add(reqOrigin);
      }
    }
    for (const devOrigin of DEV_LOCAL_ORIGINS) {
      allowed.add(devOrigin);
    }
  }

  return allowed;
}

export interface CorsCheckOptions {
  /** Allowed HTTP methods for Access-Control-Allow-Methods */
  methods: string[];
  /** Enforce same-origin Sec-Fetch-Site protection on state-changing requests */
  requireSameOriginFetch?: boolean;
}

/**
 * Enforces strict origin validation (no wildcard `*`) and optional CSRF fetch-metadata checks.
 * Returns `false` if the response was already completed (OPTIONS preflight or 403 rejection).
 */
export function enforceCorsAndCsrf(
  req: ApiRequest,
  res: ApiResponse,
  options: CorsCheckOptions
): boolean {
  const origin = getHeader(req, "origin");
  const allowedOrigins = resolveAllowedOrigins(req);

  res.setHeader("Vary", "Origin");

  if (origin) {
    let normalizedOrigin: string | null = null;
    try {
      normalizedOrigin = new URL(origin).origin;
    } catch {
      normalizedOrigin = null;
    }

    if (!normalizedOrigin || !allowedOrigins.has(normalizedOrigin)) {
      logSecurityEvent({
        owasp: "A01",
        event: "ACCESS_DENIED_ORIGIN",
        severity: "WARN",
        req,
        reason: "origin_forbidden",
      });
      sendJson(res, 403, { error: "origin_forbidden" });
      return false;
    }

    res.setHeader("Access-Control-Allow-Origin", normalizedOrigin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Methods", options.methods.join(","));
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  }

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return false;
  }

  if (options.requireSameOriginFetch) {
    const fetchSite = getHeader(req, "sec-fetch-site")?.toLowerCase();
    if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") {
      logSecurityEvent({
        owasp: "A01",
        event: "ACCESS_DENIED_CSRF",
        severity: "HIGH",
        req,
        reason: "cross_site_forbidden",
        details: { fetchSite },
      });
      sendJson(res, 403, { error: "cross_site_forbidden" });
      return false;
    }
  }

  return true;
}
