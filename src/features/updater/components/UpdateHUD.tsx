/**
 * UpdateHUD.tsx — Evolution Protocol tactical overlay.
 *
 * Bottom-right HUD panel showing update state, download progress,
 * and the final reboot trigger. Only renders when the updater has
 * something to report (non-idle phase).
 */
import { useUpdateManager, UpdatePhase } from '../hooks/useUpdateManager';
import { Download, RefreshCw, X, AlertTriangle, Check } from 'lucide-react';
import './UpdateHUD.css';

export function UpdateHUD() {
  const {
    phase,
    progress,
    updateInfo,
    error,
    startUpdate,
    reboot,
    dismiss,
  } = useUpdateManager();

  // Don't render anything for idle or checking states
  if (phase === 'idle' || phase === 'checking') return null;

  return (
    <div className={`update-hud ${phase === 'error' ? 'update-hud--error' : ''}`}>
      {/* Header */}
      <div className="update-hud__header">
        <span className="t-label">[ SYSTEM UPDATE ]</span>
        {phase === 'available' && (
          <button
            className="update-hud__dismiss"
            onClick={dismiss}
            aria-label="Dismiss update"
          >
            <X size={12} />
          </button>
        )}
      </div>

      {/* Body — switches by phase */}
      <div className="update-hud__body">
        {renderPhase(phase, updateInfo, progress, error)}
      </div>

      {/* Actions */}
      <div className="update-hud__actions">
        {phase === 'available' && (
          <button className="update-hud__btn update-hud__btn--primary" onClick={startUpdate}>
            <Download size={12} />
            <span>[ EVOLVE ]</span>
          </button>
        )}

        {phase === 'ready' && (
          <button className="update-hud__btn update-hud__btn--reboot" onClick={reboot}>
            <RefreshCw size={12} />
            <span>[ RECALIBRATE & REBOOT ]</span>
          </button>
        )}

        {phase === 'error' && (
          <button className="update-hud__btn update-hud__btn--primary" onClick={startUpdate}>
            <RefreshCw size={12} />
            <span>[ RETRY ]</span>
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Phase renderer ──────────────────────────────────────────────
function renderPhase(
  phase: UpdatePhase,
  updateInfo: { version: string; body: string | null } | null,
  progress: { downloaded: number; total: number; percent: number } | null,
  error: string | null
) {
  switch (phase) {
    case 'available':
      return (
        <>
          <div className="update-hud__version">
            <span className="t-data" style={{ color: 'var(--text-muted)' }}>
              CURRENT
            </span>
            <span className="t-data">→</span>
            <span className="t-data" style={{ color: 'var(--accent)' }}>
              v{updateInfo?.version}
            </span>
          </div>
          {updateInfo?.body && (
            <div className="update-hud__notes t-meta">
              {updateInfo.body.slice(0, 120)}
              {updateInfo.body.length > 120 ? '...' : ''}
            </div>
          )}
        </>
      );

    case 'downloading':
      return (
        <>
          <div className="update-hud__status">
            <Download size={12} className="update-hud__spin" />
            <span className="t-meta">DOWNLOADING...</span>
            <span className="t-data">{progress?.percent ?? 0}%</span>
          </div>
          <div className="update-hud__bar">
            <div
              className="update-hud__bar-fill"
              style={{ width: `${progress?.percent ?? 0}%` }}
            />
          </div>
          {progress && (
            <div className="update-hud__bytes t-meta">
              {formatBytes(progress.downloaded)} / {formatBytes(progress.total)}
            </div>
          )}
        </>
      );

    case 'ready':
      return (
        <div className="update-hud__status update-hud__status--ready">
          <Check size={14} />
          <span className="t-body">Update installed. Reboot to apply.</span>
        </div>
      );

    case 'error':
      return (
        <div className="update-hud__status update-hud__status--error">
          <AlertTriangle size={14} />
          <span className="t-meta">{error || 'Unknown error'}</span>
        </div>
      );

    default:
      return null;
  }
}

// ─── Byte formatter ──────────────────────────────────────────────
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
