import crypto from "node:crypto";
import { getHeader, type ApiRequest } from "./http.js";

export type SecuritySeverity = "INFO" | "WARN" | "HIGH" | "CRITICAL";
export type OwaspCategory = "A01" | "A04" | "A05" | "A07" | "A08" | "A09";

export interface SecurityAuditInput {
  owasp: OwaspCategory;
  event: string;
  severity: SecuritySeverity;
  req?: ApiRequest;
  uid?: string | null;
  reason?: string;
  details?: Record<string, unknown>;
}

export interface SecurityAuditRecord {
  ts: string;
  owasp: OwaspCategory;
  event: string;
  severity: SecuritySeverity;
  route: string;
  method: string;
  ipHash: string;
  origin: string | null;
  uid: string | null;
  reason?: string;
  thresholdTriggered?: boolean;
  details?: Record<string, unknown>;
}

const SENSITIVE_KEY_PATTERN = /(token|secret|password|cookie|authorization|verifier|code|nonce|email|apikey|api_key)/i;
const SPIKE_WINDOW_MS = 5 * 60 * 1000;
const SPIKE_THRESHOLD = 5;
const MAX_SPIKE_BUCKETS = 1000;

interface SpikeBucket {
  count: number;
  resetAt: number;
}

const failureSpikeBuckets = new Map<string, SpikeBucket>();
let alertObserverForTests: ((record: SecurityAuditRecord) => void) | null = null;

export function setSecurityAlertObserver(observer: ((record: SecurityAuditRecord) => void) | null): void {
  alertObserverForTests = observer;
}

export function resetSecurityAuditStateForTests(): void {
  failureSpikeBuckets.clear();
  alertObserverForTests = null;
}

/**
 * Masks or strips sensitive tokens, credentials, and raw emails from log values.
 */
export function redactLogString(raw: string): string {
  return raw
    .replace(/[\r\n\u0000-\u001F\u007F]/g, " ")
    .replace(/Bearer\s+[A-Za-z0-9\-_.~+/=]+/gi, "Bearer [REDACTED]")
    .replace(/GOCSPX-[A-Za-z0-9_-]+/g, "[REDACTED_OAUTH_SECRET]")
    .replace(/gsk_[A-Za-z0-9_-]+/g, "[REDACTED_API_KEY]")
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*/g, "[REDACTED_JWT]")
    .replace(/([?&](?:code|state|access_token|refresh_token|id_token|token)=)[^&\s]+/gi, "$1[REDACTED]")
    .slice(0, 200);
}

function sanitizeDetails(details: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!details) return undefined;
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(details)) {
    if (SENSITIVE_KEY_PATTERN.test(k)) {
      clean[k] = "[REDACTED]";
      continue;
    }
    if (typeof v === "string") {
      clean[k] = redactLogString(v);
    } else if (typeof v === "number" || typeof v === "boolean") {
      clean[k] = v;
    }
  }
  return Object.keys(clean).length > 0 ? clean : undefined;
}

function extractClientIp(req?: ApiRequest): string {
  if (!req) return "unknown";
  const xff = getHeader(req, "x-forwarded-for");
  if (xff) {
    return xff.split(",")[0].trim() || "unknown";
  }
  const realIp = getHeader(req, "x-real-ip");
  if (realIp) return realIp.trim();
  const remoteAddr = req.socket?.remoteAddress;
  return remoteAddr || "unknown";
}

function hashClientIp(ip: string): string {
  const salt = process.env.BFF_SESSION_SECRET?.slice(0, 16) || "w-audit-salt";
  return crypto.createHash("sha256").update(`${salt}:${ip}`, "utf8").digest("hex").slice(0, 12);
}

function sanitizeRoute(rawUrl: string | undefined): string {
  if (!rawUrl) return "/";
  const pathOnly = rawUrl.split("?")[0] || "/";
  return redactLogString(pathOnly).slice(0, 128);
}

function trackAnomalySpike(key: string, severity: SecuritySeverity): boolean {
  if (severity === "INFO") return false;

  const now = Date.now();
  if (failureSpikeBuckets.size >= MAX_SPIKE_BUCKETS) {
    for (const [k, bucket] of failureSpikeBuckets.entries()) {
      if (bucket.resetAt <= now) {
        failureSpikeBuckets.delete(k);
      }
    }
    if (failureSpikeBuckets.size >= MAX_SPIKE_BUCKETS) {
      failureSpikeBuckets.clear();
    }
  }

  const existing = failureSpikeBuckets.get(key);
  if (!existing || existing.resetAt <= now) {
    failureSpikeBuckets.set(key, { count: 1, resetAt: now + SPIKE_WINDOW_MS });
    return false;
  }

  existing.count += 1;
  return existing.count >= SPIKE_THRESHOLD;
}

async function dispatchWebhookAlert(record: SecurityAuditRecord): Promise<void> {
  const webhookUrl = (process.env.SECURITY_ALERT_WEBHOOK_URL || "").trim();
  if (!webhookUrl) return;

  try {
    const parsed = new URL(webhookUrl);
    if (parsed.protocol !== "https:") return;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    await fetch(parsed.toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source: "w-command-center-api",
        alert: record,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
  } catch {
    // Alert delivery must never break API request handling
  }
}

/**
 * Emits a structured, secret-redacted OWASP A09 security event and triggers alerting
 * on HIGH/CRITICAL findings or repeated anomaly spikes.
 */
export function logSecurityEvent(input: SecurityAuditInput): SecurityAuditRecord {
  const ipHash = hashClientIp(extractClientIp(input.req));
  const rawOrigin = input.req ? getHeader(input.req, "origin") : undefined;
  const route = sanitizeRoute(input.req?.url);
  const thresholdTriggered = trackAnomalySpike(`${ipHash}:${input.event}`, input.severity);

  const effectiveSeverity: SecuritySeverity =
    thresholdTriggered && input.severity !== "CRITICAL" ? "CRITICAL" : input.severity;

  const record: SecurityAuditRecord = {
    ts: new Date().toISOString(),
    owasp: input.owasp,
    event: input.event,
    severity: effectiveSeverity,
    route,
    method: input.req?.method || "UNKNOWN",
    ipHash,
    origin: rawOrigin ? redactLogString(rawOrigin).slice(0, 128) : null,
    uid: input.uid ? redactLogString(input.uid).slice(0, 48) : null,
    ...(input.reason ? { reason: redactLogString(input.reason) } : {}),
    ...(thresholdTriggered ? { thresholdTriggered: true } : {}),
    ...(input.details ? { details: sanitizeDetails(input.details) } : {}),
  };

  if (effectiveSeverity === "HIGH" || effectiveSeverity === "CRITICAL") {
    console.error("[SECURITY_ALERT]", JSON.stringify(record));
    alertObserverForTests?.(record);
    void dispatchWebhookAlert(record);
  } else if (effectiveSeverity === "WARN") {
    console.warn("[SECURITY_AUDIT]", JSON.stringify(record));
  } else {
    console.info("[SECURITY_AUDIT]", JSON.stringify(record));
  }

  return record;
}
