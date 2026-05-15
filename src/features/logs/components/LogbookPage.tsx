import { useState, useEffect, useRef } from "react";
import { getNoteHistory } from "../../habits/services/logService";
import { HabitLog } from "../../habits/types";
import { useAuthContext } from "../../auth/context";
import { BookOpen } from "lucide-react";
import "./LogbookPage.css";

// Formats a date string like "2026-05-08" to "08 MAY 2026"
function formatDate(dateStr: string): string {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T00:00:00");
  if (isNaN(d.getTime())) return dateStr;
  
  const day = d.getDate().toString().padStart(2, "0");
  const month = d.toLocaleString("en-US", { month: "short" }).toUpperCase();
  const year = d.getFullYear();
  
  return `${day} ${month} ${year}`;
}

export function LogbookPage() {
  const { user } = useAuthContext();
  const [logs, setLogs] = useState<HabitLog[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);
  const [isLoading, setIsLoading] = useState(true);
  
  // Refs for auto-scrolling
  const listRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    async function loadLogs() {
      if (!user) return;
      setIsLoading(true);
      try {
        const history = await getNoteHistory(user.uid);
        setLogs(history);
        if (history.length > 0) {
          setSelectedIndex(0);
        }
      } catch (err) {
        console.error("Failed to load logbook history:", err);
      } finally {
        setIsLoading(false);
      }
    }
    loadLogs();
  }, [user]);

  // Arrow key navigation
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Ignore if typing in an input
      if (
        document.activeElement?.tagName === "INPUT" ||
        document.activeElement?.tagName === "TEXTAREA" ||
        document.activeElement?.closest(".command-palette")
      ) {
        return;
      }

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev < logs.length - 1 ? prev + 1 : prev));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : prev));
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [logs.length]);

  // Auto-scroll selected item into view
  useEffect(() => {
    if (selectedIndex >= 0 && itemRefs.current[selectedIndex]) {
      itemRefs.current[selectedIndex]?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    }
  }, [selectedIndex]);

  if (isLoading) {
    return (
      <div className="logbook-loading">
        <span className="t-meta">[ LOADING LOGBOOK... ]</span>
      </div>
    );
  }

  const selectedLog = selectedIndex >= 0 ? logs[selectedIndex] : null;

  return (
    <div className="logbook-page">
      {/* LEFT COLUMN: INDEX */}
      <aside className="logbook-index" ref={listRef}>
        <div className="logbook-index__header">
          <BookOpen size={16} strokeWidth={1.5} />
          <h2 className="t-display">[ LOGBOOK INDEX ]</h2>
        </div>
        
        <div className="logbook-index__list">
          {logs.length === 0 ? (
            <div className="logbook-index__empty t-body">[ NO LOGS FOUND ]</div>
          ) : (
            logs.map((log, idx) => (
              <div
                key={log.date}
                ref={(el) => { itemRefs.current[idx] = el; }}
                className={`logbook-index__item ${
                  idx === selectedIndex ? "logbook-index__item--active" : ""
                }`}
                onClick={() => setSelectedIndex(idx)}
              >
                <div className="logbook-index__item-date t-meta">
                  {formatDate(log.date)}
                </div>
                <div className="logbook-index__item-preview t-body">
                  {log.notes}
                </div>
              </div>
            ))
          )}
        </div>
      </aside>

      {/* RIGHT COLUMN: READING PANE */}
      <section className="logbook-reading-pane">
        {selectedLog ? (
          <article className="logbook-entry">
            <header className="logbook-entry__header">
              <h1 className="t-display">[ {formatDate(selectedLog.date)} ]</h1>
            </header>
            <div className="logbook-entry__content t-body">
              {selectedLog.notes}
            </div>
          </article>
        ) : (
          <div className="logbook-empty-prompt">
            <span className="t-meta">[ SELECT AN ENTRY TO READ ]</span>
          </div>
        )}
      </section>
    </div>
  );
}
