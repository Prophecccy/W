import { useState, useEffect } from "react";
import { useOutletContext } from "react-router-dom";
import { getLocalNoteHistory } from "../services/localLogService";
import { HabitLog } from "../../habits/types";
import { useAuthContext } from "../../auth/context";
import { getToday } from "../../../shared/utils/dateUtils";
import { Archive, FolderOpen, Lock } from "lucide-react";
import { GDriveLockout } from "../../lockdown/components/GDriveLockout";
import "./LogbookPage.css";

interface GroupedDateEntry {
  formattedDate: string; // e.g. "May 19, Tuesday"
  rawDate: string; // "2026-05-19"
  notes: string;
  sync_pending: boolean;
}

interface GroupedMonthEntry {
  monthYear: string; // e.g. "MAY 2026"
  dates: GroupedDateEntry[];
}

/**
 * Groups and formats the sorted logs by Month/Year and specific dates.
 * Ensures local timezone parsing to prevent off-by-one calendar dates.
 */
// System-generated placeholder patterns that should never appear as user notes
const SYSTEM_NOTE_PATTERNS = [
  /^\[\s*AUTO-FREEZE\s*\]$/i,
  /^\[\s*FROZEN\s*\]$/i,
  /^\[\s*SYSTEM\s*\]$/i,
];

function isSystemPlaceholder(notes: string): boolean {
  const trimmed = notes.trim();
  return SYSTEM_NOTE_PATTERNS.some((pattern) => pattern.test(trimmed));
}

function groupNotesByMonthAndDate(logs: HabitLog[]): GroupedMonthEntry[] {
  // Sort logs in descending order of dates (newest first)
  const sortedLogs = [...logs].sort((a, b) => b.date.localeCompare(a.date));
  const groups: GroupedMonthEntry[] = [];

  for (const log of sortedLogs) {
    if (!log.notes || log.notes.trim() === "") continue;
    // Skip system-generated placeholder entries (e.g. retroactive auto-freeze logs)
    if (isSystemPlaceholder(log.notes)) continue;

    // Parse YYYY-MM-DD safely in user's local timezone
    const [year, monthVal, dayVal] = log.date.split("-").map(Number);
    const dateObj = new Date(year, monthVal - 1, dayVal);

    if (isNaN(dateObj.getTime())) continue;

    // Format Month/Year (e.g., 'MAY 2026')
    const monthName = dateObj.toLocaleString("en-US", { month: "long" }).toUpperCase();
    const monthYearStr = `${monthName} ${year}`;

    // Format Specific Date (e.g., 'May 19, Tuesday')
    const monthShort = dateObj.toLocaleString("en-US", { month: "short" });
    const dayOfWeek = dateObj.toLocaleString("en-US", { weekday: "long" });
    const dateStr = `${monthShort} ${dayVal}, ${dayOfWeek}`;

    let monthGroup = groups.find((g) => g.monthYear === monthYearStr);
    if (!monthGroup) {
      monthGroup = { monthYear: monthYearStr, dates: [] };
      groups.push(monthGroup);
    }

    monthGroup.dates.push({
      formattedDate: dateStr,
      rawDate: log.date,
      notes: log.notes,
      sync_pending: !!(log as any).sync_pending,
    });
  }

  return groups;
}

export function LogbookPage() {
  const { user, isDriveLinked } = useAuthContext();
  const { userDoc } = useOutletContext<{ userDoc: any }>() || {};
  
  const [groupedLogs, setGroupedLogs] = useState<GroupedMonthEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const resetTime = userDoc?.settings?.dailyResetTime || "04:00";

  useEffect(() => {
    let isMounted = true;
    const getLogicalToday = () => getToday(undefined, resetTime);

    async function loadLogs() {
      setIsLoading(true);
      try {
        const history = await getLocalNoteHistory();
        if (!isMounted) return;
        const currentToday = getLogicalToday();
        
        // Strictly exclude the current day's daily note
        const pastLogs = history.filter((log) => log.date !== currentToday);
        
        const grouped = groupNotesByMonthAndDate(pastLogs);
        setGroupedLogs(grouped);
      } catch (err) {
        if (isMounted) console.error("Failed to load logbook history:", err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }
    
    loadLogs();

    const handleSyncUpdate = () => {
      getLocalNoteHistory().then((history) => {
        if (!isMounted) return;
        const currentToday = getLogicalToday();
        const pastLogs = history.filter((log) => log.date !== currentToday);
        const grouped = groupNotesByMonthAndDate(pastLogs);
        setGroupedLogs(grouped);
      }).catch((err) => {
        if (isMounted) console.error("Failed to reload history on sync event:", err);
      });
    };

    window.addEventListener("w:note-saved", handleSyncUpdate);
    window.addEventListener("w:note-synced", handleSyncUpdate);

    return () => {
      isMounted = false;
      window.removeEventListener("w:note-saved", handleSyncUpdate);
      window.removeEventListener("w:note-synced", handleSyncUpdate);
    };
  }, [user, resetTime]);

  if (!isDriveLinked) {
    return <GDriveLockout mode="page" />;
  }

  if (isLoading) {
    return (
      <div className="logbook-loading">
        <span className="t-meta animate-pulse">[ DECRYPTING TACTICAL ARCHIVES... ]</span>
      </div>
    );
  }

  return (
    <div className="logbook-page">
      {/* HEADER SECTION */}
      <header className="logbook-header">
        <div className="logbook-header__title-area">
          <Archive size={20} className="accent-text" />
          <h1 className="t-display">[ LOGBOOK ARCHIVE ]</h1>
        </div>
        <div className="logbook-header__meta t-meta">
          <span>HISTORICAL RECORD DIRECTORY // READ-ONLY</span>
        </div>
      </header>

      {/* TIMELINE FEED */}
      <main className="logbook-timeline-container">
        {groupedLogs.length === 0 ? (
          <div className="logbook-empty-state">
            <FolderOpen size={48} className="logbook-empty-icon" />
            <span className="t-label">[ NO ARCHIVED ENTRIES COMMITTED ]</span>
            <p className="t-body">Past notes will assemble here once current logs are completed and archived.</p>
          </div>
        ) : (
          <div className="logbook-timeline">
            {groupedLogs.map((monthGroup) => (
              <section key={monthGroup.monthYear} className="logbook-month-section">
                {/* STICKY MONTH HEADER */}
                <div className="logbook-month-header t-label">
                  <span className="logbook-month-bracket">[ {monthGroup.monthYear} ]</span>
                  <div className="logbook-month-header__line" />
                </div>

                {/* MONTHLY ENTRIES */}
                <div className="logbook-month-entries">
                  {monthGroup.dates.map((entry) => (
                    <article key={entry.rawDate} className="logbook-entry">
                      <div className="logbook-entry__meta-wrapper">
                        {/* Tree Line Connector */}
                        <div className="logbook-entry__tree-line" />
                        
                        <div className="logbook-entry__header">
                          <span className="logbook-entry__date t-meta">
                            {entry.formattedDate}
                          </span>
                          
                          <div className="logbook-entry__header-badges">
                            <span className="logbook-index-badge t-data" style={{ marginRight: "12px" }}>
                              ID: {entry.rawDate}
                            </span>
                            {entry.sync_pending ? (
                              <span className="logbook-badge-pending t-label" style={{ marginRight: "12px" }}>
                                [ PENDING BACKUP ]
                              </span>
                            ) : (
                              <span className="logbook-badge-synced t-label" style={{ marginRight: "12px" }}>
                                [ BACKED UP ]
                              </span>
                            )}
                            <span className="logbook-locked-badge">
                              <Lock size={10} />
                              <span className="t-label">LOCKED</span>
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* SUBTLE SEPARATOR */}
                      <hr className="logbook-entry__divider" />

                      {/* READ-ONLY NOTE CONTENT */}
                      <div className="logbook-entry__content t-body">
                        {entry.notes}
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
