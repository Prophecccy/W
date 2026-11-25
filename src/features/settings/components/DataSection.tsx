import { useState, useEffect, useContext } from "react";
import { createBackup, getLastBackupDate, restoreBackup } from "../services/backupService";
import { exportJSON, exportCSV } from "../services/exportService";
import { useToast } from "../../../shared/components/Toast/Toast";
import { Download, Database, FileJson, FileSpreadsheet, Trash2, RefreshCcw, Upload, Mic, Cpu, Sparkles } from "lucide-react";
import { resetUserData, deleteUserAccountAndData } from "../../auth/services/userService";
import { useAuthContext } from "../../auth/context";
import { signOut } from "../../auth/services/authService";
import { Settings } from "../../../shared/types";
import { testGroqApiKey } from "../../habits/services/groqTranscription";
import { UserStoreContext } from "../../../shared/stores/userStore";
import { loadLocalGroqKey, saveLocalGroqKey } from "../../../shared/utils/localSecretStorage";

interface DataSectionProps {
  settings?: Settings;
  onUpdate?: (patch: Partial<Settings>) => void;
}

export function DataSection({ settings, onUpdate }: DataSectionProps = {}) {
  const { showToast } = useToast();
  const { user } = useAuthContext();
  const userStore = useContext(UserStoreContext);
  const activeSettings = settings || userStore?.userDoc?.settings;

  const [lastBackup, setLastBackup] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);

  // States for confirmation
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // States for voice settings
  const voiceMode = activeSettings?.voiceTranscriptionMode || "local";
  const [groqKeyInput, setGroqKeyInput] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [isTestingKey, setIsTestingKey] = useState(false);

  useEffect(() => {
    let active = true;
    const uid = user?.uid;
    if (!uid) return;

    loadLocalGroqKey(uid).then(async (encryptedKey) => {
      if (!active) return;
      if (encryptedKey) {
        setGroqKeyInput(encryptedKey);
      } else if (activeSettings?.groqApiKey) {
        // Migrate legacy plaintext groqApiKey into encrypted local vault and purge from userDoc
        const legacy = activeSettings.groqApiKey;
        setGroqKeyInput(legacy);
        await saveLocalGroqKey(uid, legacy).catch(() => {});
        await userStore?.updateSettings({ groqApiKey: "" }).catch(() => {});
        if (onUpdate) onUpdate({ groqApiKey: "" });
      }
    });
    return () => { active = false; };
  }, [user?.uid]);

  const handleSettingsUpdate = (patch: Partial<Settings>) => {
    if (onUpdate) {
      onUpdate(patch);
    } else if (userStore) {
      userStore.updateSettings(patch);
    }
  };

  useEffect(() => {
    getLastBackupDate().then(setLastBackup);
  }, []);

  const handleBackup = async () => {
    setLoading("backup");
    try {
      await createBackup();
      showToast("[ BACKUP CREATED ]");
      const date = await getLastBackupDate();
      setLastBackup(date);
    } catch (err) {
      showToast("[ BACKUP FAILED ]");
      console.error(err);
    } finally {
      setLoading(null);
    }
  };

  const handleImportBackup = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading("import");
    try {
      const reader = new FileReader();
      const filePromise = new Promise<string>((resolve, reject) => {
        reader.onload = (event) => resolve(event.target?.result as string);
        reader.onerror = (err) => reject(err);
      });
      reader.readAsText(file);
      
      const content = await filePromise;
      const parsed = JSON.parse(content);
      
      if (!parsed || typeof parsed !== "object" || (!parsed.habits && !parsed.todos && !parsed.user)) {
        throw new Error("Invalid backup schema");
      }

      if (window.confirm("[ PROCEED TO RESTORE BACKUP? THIS WILL OVERWRITE CURRENT SETTINGS & DATA ]")) {
        await restoreBackup(parsed);
        showToast("[ BACKUP RESTORED SUCCESSFULLY ]");
        setTimeout(() => window.location.reload(), 1500);
      }
    } catch (err) {
      showToast("[ IMPORT FAILED: INVALID BACKUP FILE ]");
      console.error("Backup import failed:", err);
    } finally {
      setLoading(null);
      e.target.value = "";
    }
  };

  const handleExportJSON = async () => {
    setLoading("json");
    try {
      const success = await exportJSON();
      if (success) showToast("[ JSON EXPORTED ]");
    } catch (err) {
      showToast("[ EXPORT FAILED ]");
      console.error(err);
    } finally {
      setLoading(null);
    }
  };

  const handleExportCSV = async () => {
    setLoading("csv");
    try {
      const success = await exportCSV();
      if (success) showToast("[ CSV EXPORTED ]");
    } catch (err) {
      showToast("[ EXPORT FAILED ]");
      console.error(err);
    } finally {
      setLoading(null);
    }
  };

  const formatBackupDate = (dateStr: string): string => {
    const d = new Date(dateStr + "T12:00:00");
    const months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
    return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
  };

  const handleStartFromScratch = async () => {
    if (!user) return;
    if (!confirmReset) {
      setConfirmReset(true);
      setTimeout(() => setConfirmReset(false), 5000); // Reset confirm state after 5 seconds
      return;
    }

    setLoading("reset");
    try {
      await resetUserData(user.uid);
      localStorage.clear();
      try {
        const { clear } = await import("idb-keyval");
        await clear();
      } catch (idbErr) {
        console.warn("Failed to clear IndexedDB wallpapers:", idbErr);
      }
      showToast("[ DATA WIPED - RELOADING ]");
      setTimeout(() => window.location.reload(), 1500); // Reload to trigger onboarding
    } catch (err) {
      console.error(err);
      showToast("[ ERROR WIPING DATA ]");
      setLoading(null);
    }
  };

  const handleDeleteAccount = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      setTimeout(() => setConfirmDelete(false), 5000); // Reset confirm state after 5 seconds
      return;
    }

    setLoading("delete");
    try {
      await deleteUserAccountAndData();
      localStorage.clear();
      try {
        const { clear } = await import("idb-keyval");
        await clear();
      } catch (idbErr) {
        console.warn("Failed to clear IndexedDB wallpapers:", idbErr);
      }
      await signOut();
      showToast("[ ACCOUNT DELETED ]");
      setTimeout(() => window.location.reload(), 1500);
    } catch (err) {
      console.error(err);
      showToast("[ ERROR DELETING ACCOUNT - REAUTHENTICATE FIRST ]");
      setLoading(null);
    }
  };

  return (
    <div className="settings-section" id="settings-data">
      <h2 className="settings-section__header t-label">[ DATA ]</h2>

      <div className="settings-section__content">
        {/* Backup & Restore */}
        <div className="settings-data__group">
          <div className="settings-row">
            <div className="settings-row__label">
              <Database size={14} strokeWidth={1.5} />
              <div>
                <span className="t-body">Backup & Restore</span>
                <p className="t-meta" style={{ marginTop: 2 }}>
                  {lastBackup
                    ? `LAST: ${formatBackupDate(lastBackup)}`
                    : "NO BACKUPS YET"}
                </p>
              </div>
            </div>
            <div style={{ display: "flex", gap: "10px" }}>
              <button
                className="settings-btn"
                onClick={handleBackup}
                disabled={loading === "backup" || loading === "import"}
              >
                <Download size={12} strokeWidth={2} />
                <span>{loading === "backup" ? "..." : "[ BACKUP ]"}</span>
              </button>

              <label 
                className="settings-btn" 
                style={{ cursor: (loading === "backup" || loading === "import") ? "not-allowed" : "pointer", display: "inline-flex", alignItems: "center", gap: "6px" }}
              >
                <Upload size={12} strokeWidth={2} />
                <span>{loading === "import" ? "..." : "[ RESTORE ]"}</span>
                <input 
                  type="file" 
                  accept=".json" 
                  onChange={handleImportBackup} 
                  style={{ display: "none" }} 
                  disabled={loading === "backup" || loading === "import"}
                />
              </label>
            </div>
          </div>
        </div>

        {/* Export */}
        <div className="settings-data__group">
          <div className="settings-data__export-row">
            <button
              className="settings-btn"
              onClick={handleExportJSON}
              disabled={loading === "json"}
            >
              <FileJson size={12} strokeWidth={2} />
              <span>{loading === "json" ? "..." : "[ EXPORT JSON ]"}</span>
            </button>

            <button
              className="settings-btn"
              onClick={handleExportCSV}
              disabled={loading === "csv"}
            >
              <FileSpreadsheet size={12} strokeWidth={2} />
              <span>{loading === "csv" ? "..." : "[ EXPORT CSV ]"}</span>
            </button>
          </div>
        </div>

        {/* Speech-to-Text / Voice Dictation */}
        <div className="settings-data__group">
          <div className="settings-row" style={{ alignItems: "flex-start" }}>
            <div className="settings-row__label">
              <Mic size={14} strokeWidth={1.5} />
              <div>
                <span className="t-body">Daily Note Voice Dictation</span>
                <p className="t-meta" style={{ marginTop: 2 }}>
                  Choose between 100% offline on-device transcription or high-speed Groq Whisper.
                </p>
              </div>
            </div>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              <button
                type="button"
                className="settings-btn"
                style={{
                  backgroundColor: voiceMode === "local" ? "rgba(var(--accent-rgb, 91, 141, 239), 0.15)" : "transparent",
                  borderColor: voiceMode === "local" ? "var(--accent)" : "rgba(255, 255, 255, 0.12)",
                  color: voiceMode === "local" ? "var(--accent)" : "var(--text-secondary)",
                }}
                onClick={() => handleSettingsUpdate({ voiceTranscriptionMode: "local" })}
              >
                <Cpu size={12} strokeWidth={1.5} />
                <span>[ LOCAL (OFFLINE) ]</span>
              </button>
              <button
                type="button"
                className="settings-btn"
                style={{
                  backgroundColor: voiceMode === "groq" ? "rgba(var(--accent-rgb, 91, 141, 239), 0.15)" : "transparent",
                  borderColor: voiceMode === "groq" ? "var(--accent)" : "rgba(255, 255, 255, 0.12)",
                  color: voiceMode === "groq" ? "var(--accent)" : "var(--text-secondary)",
                }}
                onClick={() => handleSettingsUpdate({ voiceTranscriptionMode: "groq" })}
              >
                <Sparkles size={12} strokeWidth={1.5} />
                <span>[ GROQ CLOUD ]</span>
              </button>
            </div>
          </div>

          {voiceMode === "groq" ? (
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid rgba(255,255,255,0.05)" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <label className="t-meta" style={{ color: "var(--text-secondary)" }}>
                    GROQ API KEY (FREE TIER AVAILABLE)
                  </label>
                  <a
                    href="https://console.groq.com/keys"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="t-meta"
                    style={{ color: "var(--accent)", textDecoration: "underline" }}
                  >
                    [ GET FREE KEY ↗ ]
                  </a>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    type={showKey ? "text" : "password"}
                    value={groqKeyInput}
                    onChange={(e) => {
                      const nextKey = e.target.value;
                      setGroqKeyInput(nextKey);
                      if (user?.uid) {
                        saveLocalGroqKey(user.uid, nextKey).catch(() => {});
                      }
                    }}
                    placeholder="gsk_..."
                    style={{
                      flex: 1,
                      fontFamily: "var(--font-mono)",
                      fontSize: "12px",
                      background: "rgba(255, 255, 255, 0.03)",
                      border: "1px solid rgba(255, 255, 255, 0.1)",
                      borderRadius: "6px",
                      padding: "6px 10px",
                      color: "var(--text-primary)",
                    }}
                  />
                  <button
                    type="button"
                    className="settings-btn"
                    onClick={() => setShowKey(!showKey)}
                  >
                    <span>{showKey ? "[ HIDE ]" : "[ SHOW ]"}</span>
                  </button>
                  <button
                    type="button"
                    className="settings-btn"
                    disabled={isTestingKey || !groqKeyInput}
                    onClick={async () => {
                      setIsTestingKey(true);
                      const res = await testGroqApiKey(groqKeyInput);
                      setIsTestingKey(false);
                      if (res.valid) {
                        showToast("[ GROQ API KEY VERIFIED ]");
                      } else {
                        showToast(`[ KEY ERROR: ${res.error || "FAILED"} ]`);
                      }
                    }}
                  >
                    <span>{isTestingKey ? "..." : "[ TEST KEY ]"}</span>
                  </button>
                </div>
                <p className="t-meta" style={{ color: "var(--text-muted)", fontSize: "11px" }}>
                  Groq uses Whisper Large v3. Your key is stored locally in your encrypted profile and never shared.
                </p>
              </div>
            </div>
          ) : (
            <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid rgba(255,255,255,0.05)" }}>
              <p className="t-meta" style={{ color: "var(--text-muted)", fontSize: "11px" }}>
                [ 100% PRIVATE &amp; OFFLINE ]: Audio is processed directly in your browser/app using quantized Whisper Tiny. No audio data ever leaves your device. First run downloads ~40MB model weights into local browser cache.
              </p>
            </div>
          )}
        </div>

        {/* Danger Zone */}
        <div className="settings-section" style={{ marginTop: "40px" }}>
          <h2 className="settings-section__header t-label" style={{ color: "#ef5b5b" }}>[ DANGER ZONE ]</h2>
          
          <div className="settings-data__group" style={{ borderColor: "rgba(239, 91, 91, 0.2)" }}>
            
            <div className="settings-row">
              <div className="settings-row__label">
                <RefreshCcw size={14} strokeWidth={1.5} color="#ef5b5b" />
                <div>
                  <span className="t-body" style={{ color: "#ef5b5b" }}>Start From Scratch</span>
                  <p className="t-meta" style={{ marginTop: 2, opacity: 0.7 }}>Wipes all data and habits. Keeps account.</p>
                </div>
              </div>
              <button
                className="settings-btn"
                style={{ color: confirmReset ? "#08090a" : "#ef5b5b", backgroundColor: confirmReset ? "#ef5b5b" : "transparent", borderColor: "#ef5b5b" }}
                onClick={handleStartFromScratch}
                disabled={loading === "reset" || loading === "delete"}
              >
                <span>{loading === "reset" ? "..." : confirmReset ? "[ ARE YOU SURE? ]" : "[ START FROM SCRATCH ]"}</span>
              </button>
            </div>

            <div className="settings-row" style={{ borderTop: "1px solid rgba(255,255,255,0.05)", paddingTop: "12px", marginTop: "12px" }}>
              <div className="settings-row__label">
                <Trash2 size={14} strokeWidth={1.5} color="#ef5b5b" />
                <div>
                  <span className="t-body" style={{ color: "#ef5b5b" }}>Delete Account</span>
                  <p className="t-meta" style={{ marginTop: 2, opacity: 0.7 }}>Permanently removes your account and all data.</p>
                </div>
              </div>
              <button
                className="settings-btn"
                style={{ color: confirmDelete ? "#08090a" : "#ef5b5b", backgroundColor: confirmDelete ? "#ef5b5b" : "transparent", borderColor: "#ef5b5b" }}
                onClick={handleDeleteAccount}
                disabled={loading === "reset" || loading === "delete"}
              >
                <span>{loading === "delete" ? "..." : confirmDelete ? "[ ARE YOU SURE? ]" : "[ DELETE ACCOUNT ]"}</span>
              </button>
            </div>

          </div>
        </div>

      </div>
    </div>
  );
}
