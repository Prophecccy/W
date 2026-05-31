// ─── Lockdown Service ────────────────────────────────────────────
// Manages lockdown state in Firestore + bridges to Rust via Tauri invoke.
// NOTE: recordViolation and strike logic have been removed.
// Lockdown now uses a physical block overlay instead of punishment.

import { doc, getDoc, updateDoc } from "firebase/firestore";
import { db, auth } from "../../../shared/config/firebase";
import { LockdownState, DEFAULT_LOCKDOWN_STATE } from "../types";

function uid(): string {
  const u = auth.currentUser;
  if (!u) throw new Error("Not authenticated");
  return u.uid;
}



// ─── Read ────────────────────────────────────────────────────────

export async function getLockdownState(userId?: string): Promise<LockdownState> {
  const activeUid = userId || uid();
  const snap = await getDoc(doc(db, "users", activeUid));
  if (!snap.exists()) throw new Error("User doc not found");
  const data = snap.data();
  return (data.lockdown ?? { ...DEFAULT_LOCKDOWN_STATE }) as LockdownState;
}

// ─── Activate / Deactivate ───────────────────────────────────────

export async function activateLockdown(
  blocklist: string[],
  duration: number | null
): Promise<void> {
  console.log("[lockdown] activateLockdown called", { blocklist, duration });
  const activeUid = uid();
  const state = await getLockdownState(activeUid);

  await updateDoc(doc(db, "users", activeUid), {
    "lockdown.active": true,
    "lockdown.startedAt": Date.now(),
    "lockdown.duration": duration,
    "lockdown.blocklist": blocklist,
    "lockdown.totalSessions": (state.totalSessions || 0) + 1,
    "lockdown.remainingSeconds": duration ? duration * 60 : null,
  });
  console.log("[lockdown] Firestore updated — active: true");

  // Start the Rust-side monitor
  try {
    const { isTauri } = await import("../../../shared/utils/tauri");
    if (!isTauri()) return;

    const { invoke } = await import("@tauri-apps/api/core");
    console.log("[lockdown] Calling start_lockdown_monitor via invoke...");
    await invoke("start_lockdown_monitor", { blocklist });
    console.log("[lockdown] Rust monitor started successfully");
  } catch (err) {
    console.error("[lockdown] FAILED to start Rust monitor:", err);
  }
}

export async function deactivateLockdown(userId?: string): Promise<void> {
  console.log("[lockdown] deactivateLockdown called");
  const activeUid = userId || uid();
  await updateDoc(doc(db, "users", activeUid), {
    "lockdown.active": false,
    "lockdown.startedAt": null,
    "lockdown.duration": null,
    "lockdown.remainingSeconds": null,
  });

  // Stop the Rust-side monitor
  try {
    const { isTauri } = await import("../../../shared/utils/tauri");
    if (!isTauri()) return;

    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("stop_lockdown_monitor");
    console.log("[lockdown] Rust monitor stopped successfully");
  } catch (err) {
    console.error("[lockdown] FAILED to stop Rust monitor:", err);
  }
}

// ─── Blocklist Management ────────────────────────────────────────

export async function updateBlocklist(blocklist: string[]): Promise<void> {
  const activeUid = uid();
  await updateDoc(doc(db, "users", activeUid), {
    "lockdown.blocklist": blocklist,
  });

  // Hot-swap the Rust-side blocklist
  try {
    const { isTauri } = await import("../../../shared/utils/tauri");
    if (!isTauri()) return;

    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("update_lockdown_blocklist", { blocklist });
  } catch {
    // Not in Tauri
  }
}

// ─── Resume Lockdown on App Start ────────────────────────────────

export async function resumeLockdownIfActive(userId?: string): Promise<boolean> {
  try {
    const activeUid = userId || uid();
    const state = await getLockdownState(activeUid);
    console.log("[lockdown] resumeLockdownIfActive — active:", state.active, "blocklist:", state.blocklist?.length);
    if (!state.active || !state.blocklist || state.blocklist.length === 0) return false;

    // Check if duration has expired
    if (state.duration && state.startedAt) {
      const elapsedMs = Date.now() - state.startedAt;
      const elapsed = elapsedMs / 1000 / 60;
      
      // Clock tampering detection on resume (jump backwards or massive jump forwards)
      if (elapsedMs < 0 || elapsed > state.duration + 5) {
        console.warn("[lockdown] Clock tampering detected on resume! Locking down.");
        return true;
      }
      
      if (elapsed >= state.duration) {
        console.log("[lockdown] Duration expired — deactivating");
        await deactivateLockdown(activeUid);
        return false;
      }
    }

    // Resume the Rust monitor
    const { isTauri } = await import("../../../shared/utils/tauri");
    if (!isTauri()) return false;

    const { invoke } = await import("@tauri-apps/api/core");
    console.log("[lockdown] Resuming Rust monitor with blocklist:", state.blocklist);
    await invoke("start_lockdown_monitor", { blocklist: state.blocklist });
    console.log("[lockdown] Rust monitor resumed successfully");
    return true;
  } catch (err) {
    console.error("[lockdown] resumeLockdownIfActive FAILED:", err);
    return false;
  }
}
