import { useState, useEffect } from "react";
import { createBackup, getLastBackupDate } from "../services/backupService";
import { exportJSON, exportCSV } from "../services/exportService";
import { useToast } from "../../../shared/components/Toast/Toast";
import { Download, Database, FileJson, FileSpreadsheet, Trash2, RefreshCcw } from "lucide-react";
import { resetUserData, deleteUserAccountAndData } from "../../auth/services/userService";
import { useAuthContext } from "../../auth/context";
import { signOut } from "../../auth/services/authService";

export function DataSection() {
  const { showToast } = useToast();
  const { user } = useAuthContext();
  const [lastBackup, setLastBackup] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);

  // States for confirmation
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

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
        {/* Backup */}
        <div className="settings-data__group">
          <div className="settings-row">
            <div className="settings-row__label">
              <Database size={14} strokeWidth={1.5} />
              <div>
                <span className="t-body">Backup</span>
                <p className="t-meta" style={{ marginTop: 2 }}>
                  {lastBackup
                    ? `LAST: ${formatBackupDate(lastBackup)}`
                    : "NO BACKUPS YET"}
                </p>
              </div>
            </div>
            <button
              className="settings-btn"
              onClick={handleBackup}
              disabled={loading === "backup"}
            >
              <Download size={12} strokeWidth={2} />
              <span>{loading === "backup" ? "..." : "[ CREATE BACKUP NOW ]"}</span>
            </button>
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
