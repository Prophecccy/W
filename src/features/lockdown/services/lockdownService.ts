// ─── Lockdown Service ────────────────────────────────────────────
// Manages lockdown state in Firestore + bridges to Rust via Tauri invoke.

import { doc, getDoc, updateDoc, arrayUnion } from "firebase/firestore";
import { db, auth } from "../../../shared/config/firebase";
import { LockdownState, LockdownViolation, DEFAULT_LOCKDOWN_STATE } from "../types";
import { getToday } from "../../../shared/utils/dateUtils";

function uid(): string {
  const u = auth.currentUser;
  if (!u) throw new Error("Not authenticated");
  return u.uid;
}

function userRef() {
  return doc(db, "users", uid());
}

// ─── Read ────────────────────────────────────────────────────────

export async function getLockdownState(): Promise<LockdownState> {
  const snap = await getDoc(userRef());
  if (!snap.exists()) throw new Error("User doc not found");
  const data = snap.data();
  return (data.lockdown ?? { ...DEFAULT_LOCKDOWN_STATE }) as LockdownState;
}

// ─── Activate / Deactivate ───────────────────────────────────────

export async function activateLockdown(
  blocklist: string[],
  duration: number | null
): Promise<void> {
  const state = await getLockdownState();

  await updateDoc(userRef(), {
    "lockdown.active": true,
    "lockdown.startedAt": Date.now(),
    "lockdown.duration": duration,
    "lockdown.blocklist": blocklist,
    "lockdown.totalSessions": (state.totalSessions || 0) + 1,
  });

  // Start the Rust-side monitor
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("start_lockdown_monitor", { blocklist });
  } catch {
    // Not in Tauri (browser dev mode) — lockdown won't actually monitor
    console.warn("Lockdown monitor: Not in Tauri environment");
  }
}

export async function deactivateLockdown(): Promise<void> {
  await updateDoc(userRef(), {
    "lockdown.active": false,
    "lockdown.startedAt": null,
    "lockdown.duration": null,
  });

  // Stop the Rust-side monitor
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("stop_lockdown_monitor");
  } catch {
    // Not in Tauri
  }
}

// ─── Blocklist Management ────────────────────────────────────────

export async function updateBlocklist(blocklist: string[]): Promise<void> {
  await updateDoc(userRef(), {
    "lockdown.blocklist": blocklist,
  });

  // Hot-swap the Rust-side blocklist
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("update_lockdown_blocklist", { blocklist });
  } catch {
    // Not in Tauri
  }
}

// ─── Record Violation ────────────────────────────────────────────

export async function recordViolation(
  appName: string,
  matchedRule: string
): Promise<LockdownViolation> {
  const violation: LockdownViolation = {
    appName,
    matchedRule,
    timestamp: Date.now(),
    date: getToday(),
    strikeIssued: true,
  };

  const state = await getLockdownState();

  await updateDoc(userRef(), {
    "lockdown.violations": arrayUnion(violation),
    "lockdown.totalViolations": (state.totalViolations || 0) + 1,
  });

  return violation;
}

// ─── Resume Lockdown on App Start ────────────────────────────────
// If the app was closed while lockdown was active, resume monitoring.

export async function resumeLockdownIfActive(): Promise<boolean> {
  try {
    const state = await getLockdownState();
    if (!state.active || state.blocklist.length === 0) return false;

    // Check if duration has expired
    if (state.duration && state.startedAt) {
      const elapsed = (Date.now() - state.startedAt) / 1000 / 60; // minutes
      if (elapsed >= state.duration) {
        await deactivateLockdown();
        return false;
      }
    }

    // Resume the Rust monitor
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("start_lockdown_monitor", { blocklist: state.blocklist });
    return true;
  } catch {
    return false;
  }
}
