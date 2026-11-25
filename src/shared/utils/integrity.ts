/**
 * OWASP A08: Canonical SHA-256 payload integrity and bounds normalization utilities.
 */

function canonicalizeValue(val: unknown): unknown {
  if (val === null || typeof val !== "object") {
    return val;
  }
  if (Array.isArray(val)) {
    return val.map(canonicalizeValue);
  }
  const obj = val as Record<string, unknown>;
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(obj).sort()) {
    const v = obj[key];
    if (v !== undefined) {
      sorted[key] = canonicalizeValue(v);
    }
  }
  return sorted;
}

export function stableStringify(payload: unknown): string {
  return JSON.stringify(canonicalizeValue(payload));
}

/**
 * Computes a lowercase hex SHA-256 digest over a canonicalized JSON payload.
 */
export async function computePayloadSha256(payload: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(stableStringify(payload));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Constant-time verification of a canonical SHA-256 hex digest.
 */
export async function verifyPayloadSha256(
  payload: unknown,
  expectedHex: string
): Promise<boolean> {
  if (typeof expectedHex !== "string" || !/^[a-f0-9]{64}$/i.test(expectedHex)) {
    return false;
  }
  const actualHex = await computePayloadSha256(payload);
  const target = expectedHex.toLowerCase();
  if (actualHex.length !== target.length) return false;
  let diff = 0;
  for (let i = 0; i < actualHex.length; i++) {
    diff |= actualHex.charCodeAt(i) ^ target.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Normalizes and bounds `strikes` state imported from untrusted JSON backups or cloud envelopes.
 */
export function sanitizeStrikesShape(raw: unknown): Record<string, unknown> | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const obj = raw as Record<string, unknown>;
  const rawCurrent = typeof obj.current === "number" && Number.isFinite(obj.current)
    ? Math.trunc(obj.current)
    : 0;
  const clampedCurrent = Math.min(Math.max(rawCurrent, 0), 5);
  const history = Array.isArray(obj.history) ? obj.history.slice(0, 500) : [];
  return {
    ...obj,
    current: clampedCurrent,
    history,
  };
}
