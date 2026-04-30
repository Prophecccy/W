import React, { useEffect, useState } from "react";
import { HabitLog } from "../../habits/types";
import { getLogRange } from "../../habits/services/logService";
import { useAuth } from "../../auth/hooks/useAuth";
import { ChevronLeft, ChevronRight } from "lucide-react";
import "./ActivityHeatmap.css";

interface Props {
  habitId?: string; // If passed, show heatmap for specific habit
}

interface Cell {
  date: string;
  rate: number;
  isGhost: boolean;
}

interface MonthData {
  year: number;
  month: number;
  cells: Cell[];
}

export const ActivityHeatmap: React.FC<Props> = ({ habitId }) => {
  const { user } = useAuth();
  const [monthsData, setMonthsData] = useState<MonthData[]>([]);
  const [currentViewDate, setCurrentViewDate] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  useEffect(() => {
    async function load() {
      const year = currentViewDate.getFullYear();
      const month = currentViewDate.getMonth();
      
      const months = [];
      for (let i = -2; i <= 2; i++) {
        months.push(new Date(year, month + i, 1));
      }

      const startD = months[0];
      const lastMonth = months[months.length - 1];
      const daysInLastMonth = new Date(lastMonth.getFullYear(), lastMonth.getMonth() + 1, 0).getDate();
      const endD = new Date(lastMonth.getFullYear(), lastMonth.getMonth(), daysInLastMonth);
      
      const startOffset = new Date(startD.getTime() - startD.getTimezoneOffset() * 60000);
      const endOffset = new Date(endD.getTime() - endD.getTimezoneOffset() * 60000);
      
      const logs = await getLogRange(
        startOffset.toISOString().split("T")[0], 
        endOffset.toISOString().split("T")[0]
      );

      const logMap: Record<string, HabitLog> = {};
      for (const log of logs) logMap[log.date] = log;

      const accountCreatedAt = user?.createdAt ? new Date(user.createdAt) : new Date();
      const accountCreatedOffset = new Date(accountCreatedAt.getTime() - accountCreatedAt.getTimezoneOffset() * 60000);
      const accountCreatedStr = accountCreatedOffset.toISOString().split("T")[0];

      const today = new Date();
      const todayOffset = new Date(today.getTime() - today.getTimezoneOffset() * 60000);
      const todayStr = todayOffset.toISOString().split("T")[0];

      const generatedMonths: MonthData[] = months.map(m => {
        const mYear = m.getFullYear();
        const mMonth = m.getMonth();
        const daysInMonth = new Date(mYear, mMonth + 1, 0).getDate();
        const cells: Cell[] = [];

        for (let i = 1; i <= daysInMonth; i++) {
          const d = new Date(mYear, mMonth, i);
          const dOffset = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
          const dateStr = dOffset.toISOString().split("T")[0];
          
          const log = logMap[dateStr];
          let rate = 0;

          if (log) {
            if (habitId) {
              const entry = log.habits[habitId];
              if (entry) {
                rate = entry.completed ? 100 : 0;
              }
            } else {
              let scheduled = 0;
              let completed = 0;
              const hKeys = Object.keys(log.habits);
              scheduled = hKeys.length;
              completed = hKeys.filter(k => log.habits[k].completed).length;
              rate = scheduled === 0 ? 0 : Math.round((completed / scheduled) * 100);
            }
          }

          cells.push({ 
            date: dateStr, 
            rate,
            isGhost: dateStr < accountCreatedStr || dateStr > todayStr
          });
        }

        return {
          year: mYear,
          month: mMonth,
          cells
        };
      });

      setMonthsData(generatedMonths);
    }
    load();
  }, [currentViewDate, habitId, user?.createdAt]);

  const accountCreatedAt = user?.createdAt ? new Date(user.createdAt) : new Date();
  
  const isLeftDisabled = currentViewDate.getFullYear() === accountCreatedAt.getFullYear() && 
                         currentViewDate.getMonth() === accountCreatedAt.getMonth();
                         
  const today = new Date();
  const isRightDisabled = currentViewDate.getFullYear() === today.getFullYear() && 
                          currentViewDate.getMonth() === today.getMonth();

  const handlePrevMonth = () => {
    if (isLeftDisabled) return;
    setCurrentViewDate(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    if (isRightDisabled) return;
    setCurrentViewDate(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  };

  const monthNames = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
  const fullMonthNames = ["JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE", "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"];
  const currentMonthLabel = `${fullMonthNames[currentViewDate.getMonth()]} ${currentViewDate.getFullYear()}`;

  return (
    <div className="activity-heatmap-container">
      <div className="heatmap-header">
        <button onClick={handlePrevMonth} disabled={isLeftDisabled} className="heatmap-nav-btn">
          <ChevronLeft size={16} />
        </button>
        <span className="t-label heatmap-month-label">{currentMonthLabel}</span>
        <button onClick={handleNextMonth} disabled={isRightDisabled} className="heatmap-nav-btn">
          <ChevronRight size={16} />
        </button>
      </div>
      
      <div className="heatmap-carousel">
        {monthsData.map((mData, index) => {
          const isCenter = index === 2;
          return (
            <div key={`${mData.year}-${mData.month}`} className={`month-block ${isCenter ? 'center-month' : 'side-month'}`}>
              <div className="month-label-mini">
                {monthNames[mData.month]} {mData.year}
              </div>
              <div className="activity-heatmap">
                {mData.cells.map(c => {
                  let level = 0;
                  if (c.rate > 0) level = 1;
                  if (c.rate >= 33) level = 2;
                  if (c.rate >= 66) level = 3;
                  if (c.rate >= 100) level = 4;

                  return (
                    <div 
                      key={c.date} 
                      className={`heatmap-cell level-${level} ${c.isGhost ? 'ghost' : ''}`}
                      title={`${c.date}: ${c.rate}% completed`}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
