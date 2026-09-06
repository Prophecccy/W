import React, { useEffect, useState, useMemo } from "react";
import { Habit, HabitLog } from "../../habits/types";
import { getLogRange } from "../../habits/services/logService";
import { getHabits } from "../../habits/services/habitService";
import { isHabitScheduledToday } from "../../habits/utils/scheduleEngine";
import { useAuth } from "../../auth/hooks/useAuth";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { getToday, formatDate } from "../../../shared/utils/dateUtils";
import { useUserStore } from "../../../shared/stores/userStore";
import { getCompletionRate } from "../services/analyticsService";
import "./ActivityHeatmap.css";

interface Props {
  habitId?: string; // If passed, show heatmap for specific habit
  habit?: Habit;    // If passed, use habit object directly
}

interface Cell {
  date: string;
  rate: number;
  completedCount: number;
  scheduledCount: number;
  isGhost: boolean;
  isEmpty: boolean;
}

interface MonthData {
  year: number;
  month: number;
  cells: Cell[];
  efficiency: number;
}

export const ActivityHeatmap: React.FC<Props> = ({ habitId: propHabitId, habit }) => {
  const habitId = habit?.id || propHabitId;
  const { user } = useAuth();
  const { userDoc } = useUserStore();
  const [monthsData, setMonthsData] = useState<MonthData[]>([]);
  const [currentViewDate, setCurrentViewDate] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [isLoading, setIsLoading] = useState(false);
  const [oldestDate, setOldestDate] = useState<string>(getToday());

  const maxCompletions = useMemo(() => {
    if (habitId) return 1;
    let maxVal = 1;
    for (const mData of monthsData) {
      for (const cell of mData.cells) {
        if (!cell.isGhost && !cell.isEmpty) {
          if (cell.completedCount > maxVal) {
            maxVal = cell.completedCount;
          }
        }
      }
    }
    return maxVal;
  }, [monthsData, habitId]);

  useEffect(() => {
    async function load() {
      setIsLoading(true);
      const year = currentViewDate.getFullYear();
      const month = currentViewDate.getMonth();

      const months = [];
      for (let i = -2; i <= 2; i++) {
        months.push(new Date(year, month + i, 1));
      }

      const startD = months[0];
      const lastMonth = months[months.length - 1];
      const daysInLastMonth = new Date(
        lastMonth.getFullYear(),
        lastMonth.getMonth() + 1,
        0,
      ).getDate();
      const endD = new Date(
        lastMonth.getFullYear(),
        lastMonth.getMonth(),
        daysInLastMonth,
      );

      const startOffset = formatDate(startD);
      const endOffset = formatDate(endD);

      const [logs, habits] = await Promise.all([
        getLogRange(startOffset, endOffset),
        getHabits(),
      ]);

      const logMap: Record<string, HabitLog> = {};
      for (const log of logs) logMap[log.date] = log;

      const todayStr = getToday();

      const targetHabit = habit || (habitId ? habits.find((h) => h.id === habitId) : null);

      let oldestHabitDateStr = todayStr;
      if (targetHabit) {
        let habitStart = targetHabit.startDate || formatDate(new Date(targetHabit.createdAt));
        for (const log of logs) {
          const entry = log.habits?.[targetHabit.id];
          if (entry && (entry.completed || (entry.completions?.length ?? 0) > 0 || (entry.value ?? 0) > 0)) {
            if (log.date < habitStart) habitStart = log.date;
          }
        }
        oldestHabitDateStr = habitStart;
      } else if (habits.length > 0) {
        oldestHabitDateStr = habits.reduce((min, h) => {
          const d = h.startDate || formatDate(new Date(h.createdAt));
          return d < min ? d : min;
        }, todayStr);
      }
      setOldestDate(oldestHabitDateStr);

      const generatedMonths: MonthData[] = months.map((m) => {
        const mYear = m.getFullYear();
        const mMonth = m.getMonth();
        const daysInMonth = new Date(mYear, mMonth + 1, 0).getDate();
        const cells: Cell[] = [];

        // Monday = 0, Sunday = 6
        const firstDayOfMonth = new Date(mYear, mMonth, 1).getDay();
        const startOffsetDays = (firstDayOfMonth + 6) % 7;

        for (let i = 0; i < startOffsetDays; i++) {
          cells.push({
            date: `empty-start-${mMonth}-${i}`,
            rate: -1,
            completedCount: 0,
            scheduledCount: 0,
            isGhost: true,
            isEmpty: true,
          });
        }

        let totalCompleted = 0;
        let totalScheduled = 0;
        const weeklyResetDay = userDoc?.settings?.weeklyResetDay ?? 1;

        for (let i = 1; i <= daysInMonth; i++) {
          const d = new Date(mYear, mMonth, i);
          const dateStr = formatDate(d);

          // Determine scheduled vs completed
          const scheduledHabits = habitId
            ? habits.filter(
                (h) => h.id === habitId && isHabitScheduledToday(h, dateStr, weeklyResetDay),
              )
            : habits.filter((h) => isHabitScheduledToday(h, dateStr, weeklyResetDay));

          let scheduled = scheduledHabits.length;
          let completed = 0;

          const log = logMap[dateStr];
          if (log) {
            if (habitId) {
              const entry = log.habits?.[habitId];
              const hasActivity = Boolean(
                entry && (entry.completed || (entry.completions?.length ?? 0) > 0 || (entry.value ?? 0) > 0)
              );
              if (hasActivity) {
                completed = 1;
              }
            } else {
              completed = habits.filter((h) => {
                const entry = log.habits?.[h.id];
                if (!entry) return false;
                if (entry.completed) return true;
                if (h.period === "weekly" || h.period === "monthly") {
                  return (entry.value ?? 0) > 0 || ((entry.completions?.length ?? 0) > 0);
                }
                return false;
              }).length;
            }
          }

          // If completed on an otherwise unscheduled day (e.g. flexible weekly workout),
          // adjust scheduled to at least match completed so rate evaluates to 100%
          if (completed > scheduled) {
            scheduled = completed;
          }

          totalScheduled += scheduled;
          totalCompleted += completed;

          let rate = 0;
          if (dateStr > todayStr || dateStr < oldestHabitDateStr) {
            // Ghost day: ignore in efficiency calculation
            rate = 0;
            totalScheduled -= scheduled;
            totalCompleted -= completed;
          } else {
            rate =
              scheduled === 0 ? 0 : Math.round((completed / scheduled) * 100);
          }

          cells.push({
            date: dateStr,
            rate,
            completedCount: completed,
            scheduledCount: scheduled,
            isGhost: dateStr < oldestHabitDateStr || dateStr > todayStr,
            isEmpty: false,
          });
        }

        const totalCells = cells.length;
        const remainder = totalCells % 7;
        if (remainder !== 0) {
          const trailingEmpty = 7 - remainder;
          for (let i = 0; i < trailingEmpty; i++) {
            cells.push({
              date: `empty-end-${mMonth}-${i}`,
              rate: -1,
              completedCount: 0,
              scheduledCount: 0,
              isGhost: true,
              isEmpty: true,
            });
          }
        }

        const monthStartStr = formatDate(new Date(mYear, mMonth, 1));
        const monthEndStr = formatDate(new Date(mYear, mMonth, daysInMonth));

        const efficiency = targetHabit?.period === "weekly"
          ? getCompletionRate(logs, [targetHabit], monthStartStr, monthEndStr, targetHabit.id, weeklyResetDay)
          : totalScheduled === 0
            ? 0
            : Math.round((totalCompleted / totalScheduled) * 100);

        return {
          year: mYear,
          month: mMonth,
          cells,
          efficiency,
        };
      });

      setMonthsData(generatedMonths);
      setIsLoading(false);
    }
    load();
  }, [currentViewDate, habitId, user?.metadata?.creationTime]);

  // Find the earliest year and month
  const [oldestYear, oldestMonth] = oldestDate.split('-').map(Number);
  
  const isLeftDisabled =
    currentViewDate.getFullYear() < oldestYear ||
    (currentViewDate.getFullYear() === oldestYear &&
     currentViewDate.getMonth() <= oldestMonth - 1); // -1 because JS months are 0-11

  const today = new Date();
  const isRightDisabled =
    currentViewDate.getFullYear() > today.getFullYear() ||
    (currentViewDate.getFullYear() === today.getFullYear() &&
     currentViewDate.getMonth() >= today.getMonth());

  const handlePrevMonth = () => {
    if (isLeftDisabled || isLoading) return;
    setCurrentViewDate(
      (prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1),
    );
  };

  const handleNextMonth = () => {
    if (isRightDisabled || isLoading) return;
    setCurrentViewDate(
      (prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1),
    );
  };

  const fullMonthNames = [
    "JANUARY",
    "FEBRUARY",
    "MARCH",
    "APRIL",
    "MAY",
    "JUNE",
    "JULY",
    "AUGUST",
    "SEPTEMBER",
    "OCTOBER",
    "NOVEMBER",
    "DECEMBER",
  ];
  const centerMonth = monthsData[2];

  return (
    <div className="activity-heatmap-container">
      <div className="heatmap-global-header">
        {centerMonth && (
          <div className="heatmap-dynamic-title">
            <span className="bracket-text">[</span>
            <span className="accent-text month-name">
              {fullMonthNames[centerMonth.month]}
            </span>
            <span className="year-text">{centerMonth.year}</span>
            <span className="bracket-text">]</span>
          </div>
        )}
        <h2 className="t-label">[ ACTIVITY HEATMAP ]</h2>
      </div>

      <div className="heatmap-carousel-wrapper">
        <button
          onClick={handlePrevMonth}
          disabled={isLeftDisabled}
          className="carousel-nav-btn prev"
        >
          <ChevronLeft size={28} />
        </button>

        <div className="heatmap-carousel">
          <AnimatePresence initial={false} mode="popLayout">
            {monthsData.map((mData, index) => {
              const offset = index - 2;
              const absOffset = Math.abs(offset);
              return (
                <motion.div
                  key={`${mData.year}-${mData.month}`}
                  className={`month-block offset-${absOffset}`}
                  layout
                  initial={{ opacity: 0, scale: 0.8, x: offset > 0 ? 60 : -60 }}
                  animate={{
                    opacity: absOffset === 0 ? 1 : absOffset === 1 ? 0.4 : 0.1,
                    scale: absOffset === 0 ? 1 : absOffset === 1 ? 0.85 : 0.7,
                    x: 0,
                    zIndex: 5 - absOffset,
                    filter:
                      absOffset === 0
                        ? "blur(0px) grayscale(0%)"
                        : `blur(${absOffset * 1.5}px) grayscale(100%)`,
                  }}
                  exit={{ opacity: 0, scale: 0.6, x: offset > 0 ? -60 : 60 }}
                  transition={{
                    layout: {
                      type: "spring",
                      stiffness: 90,
                      damping: 20,
                      mass: 0.8,
                    },
                    opacity: { duration: 0.6, ease: [0.16, 1, 0.3, 1] },
                    scale: {
                      type: "spring",
                      stiffness: 90,
                      damping: 20,
                      mass: 0.8,
                    },
                    filter: { duration: 0.6, ease: [0.16, 1, 0.3, 1] },
                    x: {
                      type: "spring",
                      stiffness: 90,
                      damping: 20,
                      mass: 0.8,
                    },
                  }}
                >
                  <div className="month-card">
                    <div className="month-card-header">
                      <div className="month-card-efficiency">
                        <div className="efficiency-label">EFFICIENCY:</div>
                        <div className="efficiency-value">
                          {mData.efficiency}%
                        </div>
                      </div>
                    </div>

                    <div className="month-card-weekdays">
                      <span>M</span>
                      <span>T</span>
                      <span>W</span>
                      <span>T</span>
                      <span>F</span>
                      <span>S</span>
                      <span>S</span>
                    </div>

                    <div className="activity-heatmap">
                      {mData.cells.map((c) => {
                        if (c.isEmpty) {
                          return (
                            <div key={c.date} className="heatmap-cell empty" />
                          );
                        }

                        let level = 0;
                        if (habitId) {
                          // Single habit heatmap: based on completion percentage or active unit
                          if (c.completedCount > 0 || c.rate > 0) {
                            if (c.rate >= 100 || c.completedCount > 0) level = 4;
                            else if (c.rate >= 66) level = 3;
                            else if (c.rate >= 33) level = 2;
                            else level = 1;
                          }
                        } else {
                          // Global heatmap: based on absolute completed count relative to maxCompletions
                          if (c.completedCount > 0) {
                            level = Math.max(
                              1,
                              Math.min(
                                4,
                                Math.ceil((c.completedCount / maxCompletions) * 4)
                              )
                            );
                          }
                        }

                        const dayNum = parseInt(c.date.split("-")[2], 10);
                        const tooltipText = habitId
                          ? c.completedCount > 0
                            ? `${c.date}: Completed`
                            : `${c.date}: ${c.rate}% completed`
                          : `${c.date}: ${c.completedCount} habit(s) completed`;

                        return (
                          <div
                            key={c.date}
                            className={`heatmap-cell level-${level} ${c.isGhost ? "ghost" : ""}`}
                            title={tooltipText}
                          >
                            <span className="cell-date">{dayNum}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>

        <button
          onClick={handleNextMonth}
          disabled={isRightDisabled}
          className="carousel-nav-btn next"
        >
          <ChevronRight size={28} />
        </button>
      </div>

      <div className="heatmap-legend">
        <span className="legend-label">LESS</span>
        <div className="legend-items-container">
          <div className="heatmap-cell level-0"></div>
          <div className="heatmap-cell level-1"></div>
          <div className="heatmap-cell level-2"></div>
          <div className="heatmap-cell level-3"></div>
          <div className="heatmap-cell level-4"></div>
        </div>
        <span className="legend-label">MORE</span>
      </div>
    </div>
  );
};
