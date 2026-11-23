import { useState, useEffect, useRef, useContext, ChangeEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Mic, Square, Loader2, Sparkles, Cpu } from "lucide-react";
import { saveLocalNote, getLocalNoteRecord } from "../../../logs/services/localLogService";
import { getToday } from "../../../../shared/utils/dateUtils";
import { useToast } from "../../../../shared/components/Toast/Toast";
import { useAuthContext } from "../../../auth/context";
import { UserStoreContext } from "../../../../shared/stores/userStore";
import { GDriveLockout } from "../../../lockdown/components/GDriveLockout";
import { GoogleDriveIcon } from "../../../../shared/components/GoogleDriveIcon/GoogleDriveIcon";
import { useSpotlightBorder } from "../../../../shared/hooks/useSpotlightBorder";
import { useAudioRecorder } from "../../hooks/useAudioRecorder";
import { transcribeAudio, formatTranscribedText, TranscriptionMode } from "../../services/transcriptionService";
import "./DailyNote.css";

interface DailyNoteProps {
  initialNote: string;
  dailyResetTime?: string;
  date?: string;
}

const MAX_CHARS = 20000;
const DEBOUNCE_MS = 500;

export function DailyNote({ initialNote, dailyResetTime, date }: DailyNoteProps) {
  const { isDriveLinked } = useAuthContext();
  const today = date || getToday(undefined, dailyResetTime);
  const activeDateRef = useRef(today);

  const [note, setNote] = useState(initialNote);
  const latestNoteRef = useRef(initialNote);
  const hasUnsavedChangesRef = useRef(false);
  const isLoadedRef = useRef(false);
  const isFocusedRef = useRef(false);
  const lastLocalEditTimeRef = useRef(0);
  
  // Keep latestNoteRef in sync
  latestNoteRef.current = note;
  const [isSaving, setIsSaving] = useState(false);
  const [syncStatus, setSyncStatus] = useState<"synced" | "pending" | "offline">("synced");
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { showToast } = useToast();
  const navigate = useNavigate();
  const spotlight = useSpotlightBorder<HTMLDivElement>();

  // Voice dictation state
  const userStore = useContext(UserStoreContext);
  const preferredVoiceMode: TranscriptionMode = userStore?.userDoc?.settings?.voiceTranscriptionMode || "local";
  const groqApiKey = userStore?.userDoc?.settings?.groqApiKey || "";

  const [activeVoiceMode, setActiveVoiceMode] = useState<TranscriptionMode>(preferredVoiceMode);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcriptionStatus, setTranscriptionStatus] = useState("");

  useEffect(() => {
    if (userStore?.userDoc?.settings?.voiceTranscriptionMode) {
      setActiveVoiceMode(userStore.userDoc.settings.voiceTranscriptionMode);
    }
  }, [userStore?.userDoc?.settings?.voiceTranscriptionMode]);

  const {
    isRecording,
    durationSec,
    startRecording,
    stopRecording,
    cancelRecording,
    isSupported: isMicSupported,
  } = useAudioRecorder();

  const handleToggleDictation = async () => {
    if (isTranscribing) return;

    if (isRecording) {
      const audioBlob = await stopRecording();
      if (!audioBlob || durationSec < 1) {
        showToast("[ AUDIO TOO SHORT ]");
        return;
      }

      setIsTranscribing(true);
      setTranscriptionStatus("TRANSCRIBING...");

      try {
        const result = await transcribeAudio({
          audioBlob,
          mode: activeVoiceMode,
          groqApiKey,
          onProgress: (p) => {
            if (p.message) {
              setTranscriptionStatus(p.message.toUpperCase());
            }
          },
        });

        if (result.text && result.text.trim()) {
          const formatted = formatTranscribedText(result.text, latestNoteRef.current.length, MAX_CHARS);
          const currentText = latestNoteRef.current;
          let updatedText = currentText;
          if (currentText && currentText.trim()) {
            updatedText = currentText.endsWith("\n") || currentText.endsWith(" ")
              ? `${currentText}${formatted}`
              : `${currentText}\n${formatted}`;
          } else {
            updatedText = formatted;
          }

          if (updatedText.length > MAX_CHARS) {
            updatedText = updatedText.slice(0, MAX_CHARS);
          }

          lastLocalEditTimeRef.current = Date.now();
          setNote(updatedText);
          latestNoteRef.current = updatedText;
          hasUnsavedChangesRef.current = true;
          saveNote(updatedText);
          showToast(`[ DICTATION APPENDED (${result.source.toUpperCase()}) ]`);
        } else {
          showToast("[ NO SPEECH DETECTED ]");
        }
      } catch (err: unknown) {
        console.error("Dictation error:", err);
        const errMsg = err instanceof Error ? err.message : String(err);
        showToast(`[ DICTATION ERROR: ${errMsg} ]`);
      } finally {
        setIsTranscribing(false);
        setTranscriptionStatus("");
      }
    } else {
      if (!isMicSupported) {
        showToast("[ MICROPHONE NOT SUPPORTED ]");
        return;
      }
      if (activeVoiceMode === "groq" && !groqApiKey.trim()) {
        showToast("[ CONFIGURE GROQ API KEY IN SETTINGS ]");
        return;
      }
      const success = await startRecording();
      if (success) {
        showToast("[ RECORDING: SPEAK YOUR THOUGHTS ]");
      }
    }
  };

  const handleToggleVoiceMode = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isRecording || isTranscribing) return;
    const nextMode: TranscriptionMode = activeVoiceMode === "local" ? "groq" : "local";
    setActiveVoiceMode(nextMode);
    if (userStore?.updateSettings) {
      userStore.updateSettings({ voiceTranscriptionMode: nextMode }).catch(() => {});
    }
    showToast(`[ DICTATION MODE: ${nextMode.toUpperCase()} ]`);
  };

  // Load note directly from IndexedDB on boot/date change to avoid relying on stale props
  useEffect(() => {
    let active = true;
    async function loadActiveNote() {
      try {
        const record = await getLocalNoteRecord(today);
        if (!active) return;
        if (record && typeof record.notes === "string") {
          setNote(record.notes);
          latestNoteRef.current = record.notes;
          isLoadedRef.current = true;
        } else if (initialNote && !isLoadedRef.current) {
          setNote(initialNote);
          latestNoteRef.current = initialNote;
        }
      } catch (e) {
        if (initialNote && !isLoadedRef.current) {
          setNote(initialNote);
          latestNoteRef.current = initialNote;
        }
      }
    }
    loadActiveNote();
    return () => { active = false; };
  }, [today]);

  // Sync initial prop only if user has not typed and local record was empty
  useEffect(() => {
    if (!hasUnsavedChangesRef.current && initialNote && initialNote !== latestNoteRef.current && !isLoadedRef.current) {
      setNote(initialNote);
      latestNoteRef.current = initialNote;
    }
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

    const handleSynced = async (e: Event) => {
      const customEvent = e as CustomEvent;
      const detail = customEvent.detail;
      const syncedDate = typeof detail === "string" ? detail : detail?.date;
      const source = typeof detail === "object" ? detail?.source : undefined;

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
        }
      } catch (err) {
        console.error("[DailyNote] Failed to check status in handleSynced:", err);
      }

      // If this was an upload triggered by this device, do not reload editor content
      if (source === "upload") return;

      // Only proceed with remote note reload if the event applies to today
      if (syncedDate && syncedDate !== today) return;

      // Guard: Never overwrite if user is focused, has unsaved edits, active debounce, or recently edited
      if (
        isFocusedRef.current ||
        hasUnsavedChangesRef.current ||
        debounceTimer.current !== null ||
        Date.now() - lastLocalEditTimeRef.current < 5000
      ) {
        return;
      }

      try {
        const record = await getLocalNoteRecord(today);
        // If local record has unsynced changes, never overwrite with remote
        if (record?.sync_pending) return;

        if (record && typeof record.notes === "string" && record.notes !== latestNoteRef.current) {
          setNote(record.notes);
          latestNoteRef.current = record.notes;
        }
      } catch (err) {
        console.error("[DailyNote] Failed to refresh synced note:", err);
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
      showToast(`[ TEXT TRUNCATED TO ${MAX_CHARS} CHARS ]`);
    }
    
    lastLocalEditTimeRef.current = Date.now();
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
      // Only clear unsaved flag if user hasn't continued typing while async save was in-flight
      if (latestNoteRef.current === content) {
        hasUnsavedChangesRef.current = false;
      }
      
      // Auto-trigger GDrive background sync worker instantly to back up the note
      import("../../../../shared/services/googleDriveService")
        .then((m) => m.runBackgroundSync())
        .catch((err) => console.error("[DailyNote] Instant background sync failed:", err));
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
    <div 
      className="daily-note-container" 
      style={{ position: "relative" }}
      onPointerEnter={spotlight.onPointerEnter}
      onPointerMove={spotlight.onPointerMove}
      onPointerLeave={spotlight.onPointerLeave}
    >
      <div className="daily-note-header">
        <div className="daily-note-header__title-row">
          <span className="t-label daily-note-title">[ DAILY NOTE ]</span>
          <button 
            type="button"
            className="daily-note-archive-btn daily-note-archive-btn--mobile t-meta"
            onClick={() => navigate("/logbook")}
          >
            [ LOGBOOK ]
          </button>
        </div>
        <div className="daily-note-meta">
          {/* Voice Dictation Hub */}
          <div className="daily-note-dictation">
            <button
              type="button"
              className={`daily-note-dictate-btn ${isRecording ? "daily-note-dictate-btn--recording" : ""} ${isTranscribing ? "daily-note-dictate-btn--transcribing" : ""}`}
              onClick={handleToggleDictation}
              disabled={isTranscribing}
              title={isRecording ? "Click to stop and transcribe" : "Click to dictate note"}
            >
              {isRecording ? (
                <>
                  <Square size={10} className="pulse-icon" fill="currentColor" />
                  <span className="t-meta" style={{ color: "var(--strike-red)", fontWeight: 700 }}>
                    [ STOP {Math.floor(durationSec / 60)}:{String(durationSec % 60).padStart(2, "0")} ]
                  </span>
                </>
              ) : isTranscribing ? (
                <>
                  <Loader2 size={11} className="spin-icon" />
                  <span className="t-meta" style={{ color: "var(--accent)" }}>
                    [ {transcriptionStatus || "TRANSCRIBING..."} ]
                  </span>
                </>
              ) : (
                <>
                  <Mic size={11} />
                  <span className="t-meta">[ DICTATE ]</span>
                </>
              )}
            </button>

            {!isRecording && !isTranscribing && (
              <button
                type="button"
                className="daily-note-mode-btn t-meta"
                onClick={handleToggleVoiceMode}
                title={`Click to switch mode (Current: ${activeVoiceMode.toUpperCase()})`}
              >
                {activeVoiceMode === "local" ? (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: "3px" }}>
                    <Cpu size={10} /> [ LOCAL ]
                  </span>
                ) : (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: "3px", color: "var(--accent)" }}>
                    <Sparkles size={10} /> [ GROQ ]
                  </span>
                )}
              </button>
            )}

            {isRecording && (
              <button
                type="button"
                className="daily-note-cancel-btn t-meta"
                onClick={cancelRecording}
                title="Cancel recording"
              >
                [ ✕ ]
              </button>
            )}
          </div>

          <span className="t-meta daily-note-saving" style={{ color: isSaving ? 'var(--text-primary)' : 'var(--text-muted)' }}>
            {isSaving ? "SAVING..." : "SAVED"}
          </span>
          <div className="daily-note-sync" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
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
              {syncStatus === "synced" ? "[ BACKED UP ]" : syncStatus === "offline" ? "[ OFFLINE ]" : "[ SAVED LOCALLY ]"}
            </span>
          </div>
          <span className="t-meta daily-note-count" style={{ color: remaining <= 50 ? 'var(--strike-red)' : 'var(--text-muted)' }}>
            {note.length} / {MAX_CHARS}
          </span>
          <button 
            type="button"
            className="daily-note-archive-btn daily-note-archive-btn--desktop t-meta"
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
        onFocus={() => {
          isFocusedRef.current = true;
        }}
        onBlur={() => {
          isFocusedRef.current = false;
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

