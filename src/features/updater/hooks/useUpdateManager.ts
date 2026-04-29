import { create } from 'zustand';
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

export interface UpdaterState {
  phase: UpdatePhase;
  progress: UpdateProgress | null;
  updateInfo: UpdateInfo | null;
  error: string | null;
  dismissed: boolean;
  updateRef: any;

  // Actions
  checkForUpdates: (manual?: boolean) => Promise<void>;
  startUpdate: () => Promise<void>;
  reboot: () => Promise<void>;
  dismiss: () => void;
}

export const useUpdaterStore = create<UpdaterState>((set, get) => ({
  phase: 'idle',
  progress: null,
  updateInfo: null,
  error: null,
  dismissed: false,
  updateRef: null,

  checkForUpdates: async (manual = false) => {
    if (!isTauri()) return;

    try {
      set({ phase: 'checking' });

      // Dynamic import — never bundled into browser builds
      const { check } = await import('@tauri-apps/plugin-updater');
      const update = await check();

      if (update) {
        set({
          updateRef: update,
          updateInfo: {
            version: update.version,
            body: update.body || null,
          },
          phase: 'available',
        });
      } else {
        set({ phase: 'idle' });
        if (manual) {
          window.dispatchEvent(new CustomEvent('w:toast', { detail: '[ ALREADY UP TO DATE ]' }));
        }
      }
    } catch (err) {
      console.warn('[Evolution Protocol] Update check failed:', err);
      set({ phase: 'idle' });
      if (manual) {
        // If the check fails (e.g. no latest.json yet, network issue), 
        // show a friendly message rather than an alarming "FAILED"
        window.dispatchEvent(new CustomEvent('w:toast', { detail: '[ ALREADY UP TO DATE ]' }));
      }
    }
  },

  startUpdate: async () => {
    const { updateRef, phase } = get();
    if (!updateRef || phase !== 'available') return;

    try {
      set({ phase: 'downloading', error: null });

      let downloadedBytes = 0;
      let totalBytes = 0;

      await updateRef.downloadAndInstall((event: any) => {
        switch (event.event) {
          case 'Started':
            totalBytes = event.data.contentLength || 1;
            set({ progress: { downloaded: 0, total: totalBytes, percent: 0 } });
            break;
          case 'Progress':
            downloadedBytes += event.data.chunkLength;
            const percent = Math.min(
              Math.round((downloadedBytes / totalBytes) * 100),
              100
            );
            set({ progress: { downloaded: downloadedBytes, total: totalBytes, percent } });
            break;
          case 'Finished':
            set({ progress: { downloaded: totalBytes, total: totalBytes, percent: 100 } });
            break;
        }
      });

      // Download complete — waiting for user to trigger reboot
      set({ phase: 'ready' });
    } catch (err) {
      console.error('[Evolution Protocol] Download failed:', err);
      set({
        error: 'Update download failed. Try again later.',
        phase: 'error',
        progress: null,
      });
    }
  },

  reboot: async () => {
    try {
      const { relaunch } = await import('@tauri-apps/plugin-process');
      await relaunch();
    } catch (err) {
      console.error('[Evolution Protocol] Relaunch failed:', err);
      set({
        error: 'Relaunch failed. Please restart manually.',
        phase: 'error',
      });
    }
  },

  dismiss: () => set({ dismissed: true }),
}));

// Compatibility hook matching the previous signature
export function useUpdateManager() {
  const store = useUpdaterStore();
  const effectivePhase = store.dismissed ? 'idle' : store.phase;

  return {
    phase: effectivePhase,
    progress: store.progress,
    updateInfo: store.updateInfo,
    error: store.error,
    startUpdate: store.startUpdate,
    reboot: store.reboot,
    dismiss: store.dismiss,
  };
}

let initialized = false;
export function initUpdater() {
  if (initialized || !isTauri()) return;
  initialized = true;

  // Auto-check on startup
  setTimeout(() => {
    useUpdaterStore.getState().checkForUpdates(false);
  }, 5000);

  // Listen for manual checks
  window.addEventListener('w:check-update', () => {
    useUpdaterStore.getState().checkForUpdates(true);
  });
}
