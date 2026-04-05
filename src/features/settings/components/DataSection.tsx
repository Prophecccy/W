import { useState, useEffect } from "react";
import { createBackup, getLastBackupDate } from "../services/backupService";
import { exportJSON, exportCSV } from "../services/exportService";
import { useToast } from "../../../shared/components/Toast/Toast";
import { Download, Database, FileJson, FileSpreadsheet } from "lucide-react";

export function DataSection() {
  const { showToast } = useToast();
  const [lastBackup, setLastBackup] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);

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
      await exportJSON();
      showToast("[ JSON EXPORTED ]");
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
      await exportCSV();
      showToast("[ CSV EXPORTED ]");
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
      </div>
    </div>
  );
}
