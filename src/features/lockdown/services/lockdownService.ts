// ─── Lockdown Service ────────────────────────────────────────────
// Manages lockdown state in Firestore + bridges to Rust via Tauri invoke.
// NOTE: recordViolation and strike logic have been removed.
// Lockdown now uses a physical block overlay instead of punishment.

import { db, auth, doc, getDoc, updateDoc } from "../../../shared/config/firebase";
import { LockdownState, DEFAULT_LOCKDOWN_STATE, LockdownSchedule } from "../types";

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
    await invoke("start_lockdown_monitor", { 
      blocklist,
      remainingSecs: duration ? duration * 60 : null 
    });
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
      
      if (elapsed >= state.duration) {
        console.log("[lockdown] Duration expired — deactivating");
        await deactivateLockdown(activeUid);
        return false;
      }

      // Clock tampering detection on resume (jump backwards or massive jump forwards)
      if (elapsedMs < 0 || elapsed > state.duration + 5) {
        console.warn("[lockdown] Clock tampering detected on resume! Locking down.");
        return true;
      }
    }

    // Resume the Rust monitor
    const { isTauri } = await import("../../../shared/utils/tauri");
    if (!isTauri()) return false;

    const { invoke } = await import("@tauri-apps/api/core");
    console.log("[lockdown] Resuming Rust monitor with blocklist:", state.blocklist);
    
    let remainingSecs: number | null = null;
    if (state.duration && state.startedAt) {
      const elapsedMs = Date.now() - state.startedAt;
      const elapsedSecs = Math.floor(elapsedMs / 1000);
      remainingSecs = Math.max(0, (state.duration * 60) - elapsedSecs);
    }

    await invoke("start_lockdown_monitor", { 
      blocklist: state.blocklist,
      remainingSecs
    });
    console.log("[lockdown] Rust monitor resumed successfully");
    return true;
  } catch (err) {
    console.error("[lockdown] resumeLockdownIfActive FAILED:", err);
    return false;
  }
}

// ─── Scheduled Lockdown Management ───────────────────────────────

export async function updateSchedules(schedules: LockdownSchedule[]): Promise<void> {
  const activeUid = uid();
  await updateDoc(doc(db, "users", activeUid), {
    "lockdown.schedules": schedules,
  });
}

// Keep track of the last blocklist in memory to avoid redundant tauri calls
let lastAppliedBlocklistJson = "";
let wasBlocking = false;

export async function syncActiveLockdownState(userId?: string): Promise<void> {
  try {
    const activeUid = userId || uid();
    const state = await getLockdownState(activeUid);

    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const currentDay = now.getDay(); // 0 = Sunday, 1 = Monday, etc.

    // 1. Determine active schedules
    const activeSchedules = (state.schedules ?? []).filter((s) => {
      if (!s.enabled) return false;
      if (!s.days.includes(currentDay)) return false;

      const [startH, startM] = s.startTime.split(":").map(Number);
      const [endH, endM] = s.endTime.split(":").map(Number);
      const startMin = startH * 60 + startM;
      const endMin = endH * 60 + endM;

      if (startMin <= endMin) {
        return currentMinutes >= startMin && currentMinutes < endMin;
      } else {
        // Overnight schedule
        return currentMinutes >= startMin || currentMinutes < endMin;
      }
    });

    // 2. Determine manual lockdown state
    let manualActive = false;
    if (state.active) {
      if (state.duration && state.startedAt) {
        const elapsedMs = Date.now() - state.startedAt;
        const elapsedMins = elapsedMs / 1000 / 60;
        if (elapsedMins < state.duration) {
          manualActive = true;
        } else {
          // Duration expired — auto de-activate manual state
          console.log("[lockdown] Manual duration expired — deactivating in Firestore");
          await deactivateLockdown(activeUid);
        }
      } else {
        // Infinite manual session
        manualActive = true;
      }
    }

    // 3. Combine targets
    const scheduleBlocklist = activeSchedules.flatMap((s) => s.blocklist);
    const manualBlocklist = manualActive ? (state.blocklist ?? []) : [];
    const combined = Array.from(new Set([...scheduleBlocklist, ...manualBlocklist]));

    // 4. Update Rust monitor
    const shouldBeBlocking = combined.length > 0;
    const combinedJson = JSON.stringify(combined.sort());

    const { isTauri } = await import("../../../shared/utils/tauri");
    if (!isTauri()) return;

    const { invoke } = await import("@tauri-apps/api/core");

    if (shouldBeBlocking) {
      if (!wasBlocking || combinedJson !== lastAppliedBlocklistJson) {
        console.log("[lockdown] Syncing blocklist to Rust:", combined);
        await invoke("start_lockdown_monitor", {
          blocklist: combined,
          remainingSecs: null, // Schedules run continuously without fixed countdowns
        });
        wasBlocking = true;
        lastAppliedBlocklistJson = combinedJson;
      }
    } else {
      if (wasBlocking) {
        console.log("[lockdown] Syncing to inactive — stopping Rust monitor");
        await invoke("stop_lockdown_monitor");
        wasBlocking = false;
        lastAppliedBlocklistJson = "";
        
        // Hide the block overlay if active
        try {
          const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
          const overlay = await WebviewWindow.getByLabel("block-overlay");
          if (overlay) {
            await overlay.hide();
          }
        } catch {}
      }
    }
  } catch (err) {
    console.error("[lockdown] syncActiveLockdownState failed:", err);
  }
}
