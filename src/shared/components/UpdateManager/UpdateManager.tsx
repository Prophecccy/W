import React, { useEffect, useState } from 'react';
import { check, Update } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import './UpdateManager.css';

export const UpdateManager: React.FC = () => {
  const [updateAvailable, setUpdateAvailable] = useState<Update | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [progress, setProgress] = useState<{ downloaded: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const checkForUpdates = async () => {
      try {
        const update = await check();
        if (update) {
          setUpdateAvailable(update);
        }
      } catch (err) {
        console.error('Failed to check for updates:', err);
      }
    };

    // Delay the update check slightly so it doesn't block app startup
    setTimeout(checkForUpdates, 3000);
  }, []);

  const handleUpdate = async () => {
    if (!updateAvailable) return;

    try {
      setIsUpdating(true);
      setError(null);
      let downloadedBytes = 0;
      let totalBytes = 0;

      await updateAvailable.downloadAndInstall((event) => {
        switch (event.event) {
          case 'Started':
            totalBytes = event.data.contentLength || 1;
            setProgress({ downloaded: 0, total: totalBytes });
            break;
          case 'Progress':
            downloadedBytes += event.data.chunkLength;
            setProgress({ downloaded: downloadedBytes, total: totalBytes });
            break;
          case 'Finished':
            setProgress(null);
            break;
        }
      });

      await relaunch();
    } catch (err) {
      console.error('Update failed:', err);
      setError('Failed to install update. Please try again later.');
      setIsUpdating(false);
      setProgress(null);
    }
  };

  if (!updateAvailable) return null;

  return (
    <div className="update-manager-overlay">
      <div className="update-manager-modal glass-panel">
        <h2 className="update-title">Update Available</h2>
        <p className="update-subtitle">
          Version {updateAvailable.version} is ready to install.
        </p>
        
        {updateAvailable.body && (
          <div className="update-notes">
            <pre>{updateAvailable.body}</pre>
          </div>
        )}

        {error && <div className="update-error">{error}</div>}

        <div className="update-actions">
          {!isUpdating ? (
            <>
              <button 
                className="btn-secondary" 
                onClick={() => setUpdateAvailable(null)}
              >
                Later
              </button>
              <button 
                className="btn-primary update-btn" 
                onClick={handleUpdate}
              >
                Install & Relaunch
              </button>
            </>
          ) : (
            <div className="update-progress-container">
              <div className="update-progress-text">
                Downloading update...
                {progress && (
                  <span> {Math.round((progress.downloaded / progress.total) * 100)}%</span>
                )}
              </div>
              <div className="update-progress-bar">
                <div 
                  className="update-progress-fill" 
                  style={{ width: `${progress ? (progress.downloaded / progress.total) * 100 : 0}%` }} 
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
