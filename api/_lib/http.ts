import type { IncomingMessage, ServerResponse } from "node:http";

export interface ApiRequest extends IncomingMessage {
  query?: Record<string, string | string[] | undefined>;
  body?: unknown;
}

export interface ApiResponse extends ServerResponse {
  status?: (code: number) => ApiResponse;
  json?: (payload: unknown) => void;
}

/**
 * Normalizes a request header lookup to a single lowercase-keyed string.
 */
export function getHeader(req: ApiRequest, name: string): string | undefined {
  const raw = req.headers[name.toLowerCase()];
  if (Array.isArray(raw)) return raw[0];
  return typeof raw === "string" ? raw : undefined;
}

/**
 * Sets standard security headers for API responses.
 */
export function setNoStoreHeaders(res: ApiResponse): void {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("X-Content-Type-Options", "nosniff");
}

/**
 * Sends a JSON payload cleanly across both Vercel runtime and standard Node HTTP servers.
 */
export function sendJson(res: ApiResponse, statusCode: number, payload: unknown): void {
  setNoStoreHeaders(res);
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

/**
 * Sends an HTTP redirect cleanly with no-store headers.
 */
export function sendRedirect(res: ApiResponse, location: string, statusCode = 302): void {
  setNoStoreHeaders(res);
  res.statusCode = statusCode;
  res.setHeader("Location", location);
  res.end();
}

/**
 * Parses URL search parameters from the request URL safely.
 */
export function getSearchParams(req: ApiRequest): URLSearchParams {
  const url = req.url || "/";
  const queryIdx = url.indexOf("?");
  return new URLSearchParams(queryIdx >= 0 ? url.slice(queryIdx + 1) : "");
}

/**
 * Reads and parses a JSON request body with strict size limits (64 KB max).
 */
export async function readJsonBody(req: ApiRequest, maxBytes = 65_536): Promise<Record<string, unknown>> {
  if (req.body !== undefined) {
    if (typeof req.body === "string") {
      if (Buffer.byteLength(req.body, "utf8") > maxBytes) {
        throw new Error("payload_too_large");
      }
      const parsed = JSON.parse(req.body || "{}");
      return isPlainObject(parsed) ? parsed : {};
    }
    return isPlainObject(req.body) ? req.body : {};
  }

  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buf.length;
    if (total > maxBytes) {
      throw new Error("payload_too_large");
    }
    chunks.push(buf);
  }

  if (chunks.length === 0) return {};
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return {};
  const parsed = JSON.parse(raw);
  return isPlainObject(parsed) ? parsed : {};
}

function isPlainObject(val: unknown): val is Record<string, unknown> {
  return typeof val === "object" && val !== null && !Array.isArray(val);
}

const SAFE_HOST_HEADER_REGEX = /^[A-Za-z0-9](?:[A-Za-z0-9.-]{0,251}[A-Za-z0-9])?(?::\d{1,5})?$/;

/**
 * Infers the request origin (protocol + host) safely without trusting spoofable forwarded hosts
 * outside verified Vercel edge deployments.
 */
export function getRequestOrigin(req: ApiRequest): string | null {
  const directHost = getHeader(req, "host")?.trim();
  const forwardedHost = process.env.VERCEL === "1" ? getHeader(req, "x-forwarded-host")?.trim() : undefined;
  const host = forwardedHost || directHost;
  if (!host || host.includes("..") || !SAFE_HOST_HEADER_REGEX.test(host)) {
    return null;
  }

  const protoHeader = getHeader(req, "x-forwarded-proto");
  const isLocalHost = host.startsWith("localhost") || host.startsWith("127.0.0.1");
  const proto = protoHeader === "http" && isLocalHost ? "http" : "https";

  try {
    const parsed = new URL(`${proto}://${host}`);
    return parsed.origin;
  } catch {
    return null;
  }
}

/**
 * Prevents open redirects by allowing only relative paths starting with a single '/'.
 */
export function sanitizeReturnTo(input: string | null | undefined): string {
  if (!input || typeof input !== "string") return "/";
  const trimmed = input.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//") || trimmed.startsWith("/\\")) {
    return "/";
  }
  if (/[\r\n\0]/.test(trimmed)) return "/";
  return trimmed;
}
