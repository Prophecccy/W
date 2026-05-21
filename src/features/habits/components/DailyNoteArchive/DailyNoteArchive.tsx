import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { HabitLog } from "../../types";
import { getLocalNoteHistory } from "../../../logs/services/localLogService";
import "./DailyNoteArchive.css";

interface DailyNoteArchiveProps {
  isOpen: boolean;
  onClose: () => void;
}

export function DailyNoteArchive({ isOpen, onClose }: DailyNoteArchiveProps) {
  const [notes, setNotes] = useState<HabitLog[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    const fetchNotes = async () => {
      setIsLoading(true);
      try {
        const history = await getLocalNoteHistory();
        setNotes(history);
      } catch (e) {
        console.error("Failed to fetch note history", e);
      } finally {
        setIsLoading(false);
      }
    };

    fetchNotes();

    const handleSyncUpdate = () => {
      getLocalNoteHistory()
        .then((history) => setNotes(history))
        .catch((err) => console.error("Failed to reload archive on sync event:", err));
    };

    window.addEventListener("w:note-saved", handleSyncUpdate);
    window.addEventListener("w:note-synced", handleSyncUpdate);

    return () => {
      window.removeEventListener("w:note-saved", handleSyncUpdate);
      window.removeEventListener("w:note-synced", handleSyncUpdate);
    };
  }, [isOpen]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="daily-note-archive-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={onClose}
        >
          <motion.div
            className="daily-note-archive-panel"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="daily-note-archive__header">
              <h2 className="t-display">[ ARCHIVE ]</h2>
              <button className="daily-note-archive__close" onClick={onClose}>
                <X size={24} />
              </button>
            </div>

            <div className="daily-note-archive__content">
              {isLoading ? (
                <div className="t-meta" style={{ color: "var(--text-muted)" }}>[ LOADING... ]</div>
              ) : notes.length === 0 ? (
                <div className="t-meta" style={{ color: "var(--text-muted)" }}>[ NO PAST NOTES FOUND ]</div>
              ) : (
                <div className="daily-note-archive__list">
                  {notes.map((log) => {
                    const dateObj = new Date(log.date + "T00:00:00");
                    const dateStr = dateObj.toLocaleDateString("en-US", {
                      month: "short",
                      day: "2-digit",
                      year: "numeric"
                    }).toUpperCase();

                    return (
                      <div key={log.date} className="daily-note-archive__card">
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                          <div className="t-meta daily-note-archive__card-date">[ {dateStr} ]</div>
                          <div className="t-meta" style={{ color: (log as any).sync_pending ? "#e2b13c" : "var(--text-muted)", fontSize: "10px", fontFamily: "var(--font-mono)" }}>
                            {(log as any).sync_pending ? "[ OFFLINE ]" : "[ BACKED UP ]"}
                          </div>
                        </div>
                        <div className="t-body daily-note-archive__card-text">
                          {log.notes}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
