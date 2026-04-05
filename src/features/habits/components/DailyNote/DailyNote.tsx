import { useState, useEffect, useRef } from "react";
import { updateNote } from "../../services/logService";
import { useToast } from "../../../../shared/components/Toast/Toast";
import "./DailyNote.css";

interface DailyNoteProps {
  initialNote: string;
}

const MAX_CHARS = 5000;
const DEBOUNCE_MS = 500;

export function DailyNote({ initialNote }: DailyNoteProps) {
  const [note, setNote] = useState(initialNote);
  const [isSaving, setIsSaving] = useState(false);
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);
  const { showToast } = useToast();

  // Sync initial prop if it changes externally (e.g. initial load)
  useEffect(() => {
    setNote(initialNote);
  }, [initialNote]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newVal = e.target.value;
    if (newVal.length > MAX_CHARS) return;
    
    setNote(newVal);
    setIsSaving(true);

    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }

    debounceTimer.current = setTimeout(() => {
      saveNote(newVal);
    }, DEBOUNCE_MS);
  };

  const saveNote = async (content: string) => {
    try {
      await updateNote(content);
    } catch (err) {
      console.error("Failed to save daily note:", err);
      showToast("[ ERROR SAVING NOTE ]");
    } finally {
      setIsSaving(false);
    }
  };

  const remaining = MAX_CHARS - note.length;

  return (
    <div className="daily-note-container">
      <div className="daily-note-header">
        <span className="t-label">[ DAILY NOTE ]</span>
        <div className="daily-note-meta">
          <span className="t-meta" style={{ color: isSaving ? 'var(--text-primary)' : 'var(--text-muted)' }}>
            {isSaving ? "SAVING..." : "SAVED"}
          </span>
          <span className="t-meta" style={{ color: remaining <= 50 ? 'var(--strike-red)' : 'var(--text-muted)' }}>
            {note.length} / {MAX_CHARS}
          </span>
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
            saveNote(note);
          }
        }}
      />
    </div>
  );
}
