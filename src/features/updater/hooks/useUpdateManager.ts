/**
 * useUpdateManager.ts — Evolution Protocol state machine.
 *
 * Guards all logic behind isTauri() so the updater never executes
 * in browser dev mode. Returns a permanent "idle" state when
 * running outside the native shell.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { isTauri } from '../../../shared/utils/tauri';

// ─── State types ─────────────────────────────────────────────────
export type UpdatePhase =
  | 'idle'         // No update / browser mode
  | 'checking'     // Polling endpoint
  | 'available'    // Update found, waiting for user
  | 'downloading'  // Actively downloading
  | 'ready'        // Downloaded + installed, awaiting reboot
  | 'error';       // Something broke

export interface UpdateProgress {
  downloaded: number;
  total: number;
  percent: number;
}

export interface UpdateInfo {
  version: string;
  body: string | null;
}

export interface UpdateManagerState {
  phase: UpdatePhase;
  progress: UpdateProgress | null;
  updateInfo: UpdateInfo | null;
  error: string | null;
  startUpdate: () => void;
  reboot: () => void;
  dismiss: () => void;
}

// ─── Hook ────────────────────────────────────────────────────────
export function useUpdateManager(): UpdateManagerState {
  const [phase, setPhase] = useState<UpdatePhase>('idle');
  const [progress, setProgress] = useState<UpdateProgress | null>(null);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);

  // Hold the Update object from the Tauri plugin
  const updateRef = useRef<any>(null);

  // ── Check for updates on mount (Tauri only) ──────────────────
  useEffect(() => {
    if (!isTauri()) return;

    let cancelled = false;

    const checkForUpdates = async () => {
      try {
        setPhase('checking');

        // Dynamic import — never bundled into browser builds
        const { check } = await import('@tauri-apps/plugin-updater');
        const update = await check();

        if (cancelled) return;

        if (update) {
          updateRef.current = update;
          setUpdateInfo({
            version: update.version,
            body: update.body || null,
          });
          setPhase('available');
        } else {
          setPhase('idle');
        }
      } catch (err) {
        if (cancelled) return;
        console.warn('[Evolution Protocol] Update check failed:', err);
        // Silently return to idle — don't bother the user for check failures
        setPhase('idle');
      }
    };

    // Delay 5 seconds so it doesn't contest with app startup
    const timer = setTimeout(checkForUpdates, 5000);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  // ── Start download + install ─────────────────────────────────
  const startUpdate = useCallback(async () => {
    const update = updateRef.current;
    if (!update || phase !== 'available') return;

    try {
      setPhase('downloading');
      setError(null);

      let downloadedBytes = 0;
      let totalBytes = 0;

      await update.downloadAndInstall((event: any) => {
        switch (event.event) {
          case 'Started':
            totalBytes = event.data.contentLength || 1;
            setProgress({ downloaded: 0, total: totalBytes, percent: 0 });
            break;
          case 'Progress':
            downloadedBytes += event.data.chunkLength;
            const percent = Math.min(
              Math.round((downloadedBytes / totalBytes) * 100),
              100
            );
            setProgress({ downloaded: downloadedBytes, total: totalBytes, percent });
            break;
          case 'Finished':
            setProgress({ downloaded: totalBytes, total: totalBytes, percent: 100 });
            break;
        }
      });

      // Download complete — waiting for user to trigger reboot
      setPhase('ready');
    } catch (err) {
      console.error('[Evolution Protocol] Download failed:', err);
      setError('Update download failed. Try again later.');
      setPhase('error');
      setProgress(null);
    }
  }, [phase]);

  // ── Reboot (relaunch app) ────────────────────────────────────
  const reboot = useCallback(async () => {
    try {
      const { relaunch } = await import('@tauri-apps/plugin-process');
      await relaunch();
    } catch (err) {
      console.error('[Evolution Protocol] Relaunch failed:', err);
      setError('Relaunch failed. Please restart manually.');
      setPhase('error');
    }
  }, []);

  // ── Dismiss until next app launch ────────────────────────────
  const dismiss = useCallback(() => {
    setDismissed(true);
  }, []);

  // If dismissed, report as idle so UI hides
  const effectivePhase = dismissed ? 'idle' : phase;

  return {
    phase: effectivePhase,
    progress,
    updateInfo,
    error,
    startUpdate,
    reboot,
    dismiss,
  };
}
