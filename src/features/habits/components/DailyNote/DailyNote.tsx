import { useState, useEffect, useRef, ChangeEvent } from "react";
import { useNavigate } from "react-router-dom";
import { saveLocalNote, getLocalNoteRecord } from "../../../logs/services/localLogService";
import { getToday } from "../../../../shared/utils/dateUtils";
import { useToast } from "../../../../shared/components/Toast/Toast";
import { useAuthContext } from "../../../auth/context";
import { GDriveLockout } from "../../../lockdown/components/GDriveLockout";
import { GoogleDriveIcon } from "../../../../shared/components/GoogleDriveIcon/GoogleDriveIcon";
import "./DailyNote.css";

interface DailyNoteProps {
  initialNote: string;
}

const MAX_CHARS = 5000;
const DEBOUNCE_MS = 500;

export function DailyNote({ initialNote }: DailyNoteProps) {
  const { isDriveLinked } = useAuthContext();
  const [note, setNote] = useState(initialNote);
  const latestNoteRef = useRef(initialNote);
  const hasUnsavedChangesRef = useRef(false);
  
  // Keep latestNoteRef in sync
  latestNoteRef.current = note;
  const [isSaving, setIsSaving] = useState(false);
  const [syncStatus, setSyncStatus] = useState<"synced" | "pending" | "offline">("synced");
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);
  const { showToast } = useToast();
  const navigate = useNavigate();

  const today = getToday();
  const activeDateRef = useRef(today);

  // Sync initial prop if it changes externally (e.g. initial load)
  useEffect(() => {
    setNote(initialNote);
    latestNoteRef.current = initialNote;
    hasUnsavedChangesRef.current = false;
  }, [initialNote]);

  // Determine initial sync status from IndexedDB record on boot
  useEffect(() => {
    async function checkInitialStatus() {
      try {
        const record = await getLocalNoteRecord(today);
        if (record) {
          if (!navigator.onLine && record.sync_pending) {
            setSyncStatus("offline");
          } else if (record.sync_pending) {
            setSyncStatus("pending");
          } else {
            setSyncStatus("synced");
          }
        } else {
          setSyncStatus("synced");
        }
      } catch (err) {
        console.error("Failed to check note sync status:", err);
      }
    }
    checkInitialStatus();
  }, [today]);

  // Event-driven state updates to match IndexedDB / background worker
  useEffect(() => {
    const handleSaved = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail && customEvent.detail.date === today) {
        if (!navigator.onLine && customEvent.detail.sync_pending) {
          setSyncStatus("offline");
        } else {
          setSyncStatus(customEvent.detail.sync_pending ? "pending" : "synced");
        }
      }
    };

    const handleSynced = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail === today) {
        setSyncStatus("synced");
      }
    };

    const handleOnlineStatus = () => {
      if (!navigator.onLine) {
        setSyncStatus(prev => prev === "pending" ? "offline" : prev);
      } else {
        setSyncStatus(prev => prev === "offline" ? "pending" : prev);
        // Trigger background sync worker instantly on reconnection
        import("../../../../shared/services/googleDriveService")
          .then(m => m.runBackgroundSync())
          .catch(err => console.error("Reconnection sync failed:", err));
      }
    };

    window.addEventListener("w:note-saved", handleSaved);
    window.addEventListener("w:note-synced", handleSynced);
    window.addEventListener("online", handleOnlineStatus);
    window.addEventListener("offline", handleOnlineStatus);

    return () => {
      window.removeEventListener("w:note-saved", handleSaved);
      window.removeEventListener("w:note-synced", handleSynced);
      window.removeEventListener("online", handleOnlineStatus);
      window.removeEventListener("offline", handleOnlineStatus);
    };
  }, [today]);

  // Handle timezone date rollover dynamically in the UI
  useEffect(() => {
    if (activeDateRef.current === today) return;

    const oldDate = activeDateRef.current;
    activeDateRef.current = today;

    async function processRollover() {
      if (hasUnsavedChangesRef.current) {
        if (debounceTimer.current) {
          clearTimeout(debounceTimer.current);
          debounceTimer.current = null;
        }
        try {
          await saveLocalNote(oldDate, latestNoteRef.current);
          hasUnsavedChangesRef.current = false;
        } catch (err) {
          console.error(`Failed to save note for old date ${oldDate} during rollover:`, err);
        }
      }

      try {
        const record = await getLocalNoteRecord(today);
        const newContent = record ? record.notes : "";
        setNote(newContent);
        latestNoteRef.current = newContent;
        hasUnsavedChangesRef.current = false;
        setIsSaving(false);
      } catch (err) {
        console.error("Failed to load note for new date during rollover:", err);
      }
    }

    processRollover();
  }, [today]);

  // Flush unsaved notes on component unmount to prevent data loss on page navigation
  useEffect(() => {
    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
      if (hasUnsavedChangesRef.current) {
        saveLocalNote(activeDateRef.current, latestNoteRef.current).catch(err => {
          console.error("Failed to flush daily note on unmount:", err);
        });
      }
    };
  }, []);

  // Register beforeunload listener to flush unsaved changes before page/window closes
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (hasUnsavedChangesRef.current) {
        saveLocalNote(activeDateRef.current, latestNoteRef.current).catch(err => {
          console.error("Failed to save note on beforeunload:", err);
        });
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, []);

  const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    let newVal = e.target.value;
    if (newVal.length > MAX_CHARS) {
      newVal = newVal.slice(0, MAX_CHARS);
      showToast("[ TEXT TRUNCATED TO 5000 CHARS ]");
    }
    
    setNote(newVal);
    latestNoteRef.current = newVal;
    hasUnsavedChangesRef.current = true;
    setIsSaving(true);

    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }

    debounceTimer.current = setTimeout(() => {
      saveNote(newVal);
      debounceTimer.current = null;
    }, DEBOUNCE_MS);
  };

  const saveNote = async (content: string) => {
    try {
      await saveLocalNote(activeDateRef.current, content);
      hasUnsavedChangesRef.current = false;
    } catch (err) {
      console.error("Failed to save daily note locally:", err);
      showToast("[ ERROR SAVING NOTE LOCALLY ]");
    } finally {
      setIsSaving(false);
    }
  };

  if (!isDriveLinked) {
    return <GDriveLockout mode="card" />;
  }

  const remaining = MAX_CHARS - note.length;

  return (
    <div className="daily-note-container" style={{ position: "relative" }}>
      <div className="daily-note-header">
        <span className="t-label">[ DAILY NOTE ]</span>
        <div className="daily-note-meta">
          <span className="t-meta" style={{ color: isSaving ? 'var(--text-primary)' : 'var(--text-muted)', marginRight: '8px' }}>
            {isSaving ? "SAVING..." : "SAVED"}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginRight: '16px' }}>
            <GoogleDriveIcon
              size={12}
              style={{
                color: syncStatus === "synced" ? "var(--accent)" : syncStatus === "offline" ? "var(--strike-red)" : "var(--accent)",
                opacity: syncStatus === "synced" ? 0.6 : 1,
              }}
            />
            <span 
              className="t-meta" 
              style={{ 
                color: syncStatus === "synced" ? "var(--text-muted)" : syncStatus === "offline" ? "var(--strike-red)" : "var(--accent)",
                opacity: syncStatus === "synced" ? 0.6 : 1,
                fontWeight: syncStatus !== "synced" ? 600 : 'normal'
              }}
            >
              {syncStatus === "synced" ? "[ BACKED UP ]" : syncStatus === "offline" ? "[ OFFLINE (PENDING BACKUP) ]" : "[ SAVED LOCALLY ]"}
            </span>
          </div>
          <span className="t-meta" style={{ color: remaining <= 50 ? 'var(--strike-red)' : 'var(--text-muted)' }}>
            {note.length} / {MAX_CHARS}
          </span>
          <button 
            className="daily-note-archive-btn t-meta"
            onClick={() => navigate("/logbook")}
          >
            [ LOGBOOK ]
          </button>
        </div>
      </div>
      <textarea
        className="daily-note-input t-body"
        placeholder="Thoughts on today..."
        value={note}
        onChange={handleChange}
        onBlur={() => {
          if (debounceTimer.current) {
            clearTimeout(debounceTimer.current);
            debounceTimer.current = null;
            saveNote(latestNoteRef.current);
          }
        }}
      />
    </div>
  );
}

