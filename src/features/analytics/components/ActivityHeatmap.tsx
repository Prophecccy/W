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
  isEmpty: boolean;
}

interface MonthData {
  year: number;
  month: number;
  cells: Cell[];
  efficiency: number;
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

        // Monday = 0, Sunday = 6
        const firstDayOfMonth = new Date(mYear, mMonth, 1).getDay();
        const startOffsetDays = (firstDayOfMonth + 6) % 7;

        for (let i = 0; i < startOffsetDays; i++) {
          cells.push({ date: `empty-start-${i}`, rate: -1, isGhost: true, isEmpty: true });
        }

        let totalCompleted = 0;
        let totalScheduled = 0;

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
                totalScheduled += 1;
                if (entry.completed) totalCompleted += 1;
              }
            } else {
              const hKeys = Object.keys(log.habits);
              const scheduled = hKeys.length;
              const completed = hKeys.filter(k => log.habits[k].completed).length;
              
              totalScheduled += scheduled;
              totalCompleted += completed;

              rate = scheduled === 0 ? 0 : Math.round((completed / scheduled) * 100);
            }
          }

          cells.push({ 
            date: dateStr, 
            rate,
            isGhost: dateStr < accountCreatedStr || dateStr > todayStr,
            isEmpty: false
          });
        }

        const totalCells = cells.length;
        const remainder = totalCells % 7;
        if (remainder !== 0) {
          const trailingEmpty = 7 - remainder;
          for (let i = 0; i < trailingEmpty; i++) {
            cells.push({ date: `empty-end-${i}`, rate: -1, isGhost: true, isEmpty: true });
          }
        }

        const efficiency = totalScheduled === 0 ? 0 : Math.round((totalCompleted / totalScheduled) * 100);

        return {
          year: mYear,
          month: mMonth,
          cells,
          efficiency
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

  const fullMonthNames = ["JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE", "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"];

  return (
    <div className="activity-heatmap-container">
      <div className="heatmap-carousel-wrapper">
        <button onClick={handlePrevMonth} disabled={isLeftDisabled} className="carousel-nav-btn">
          <ChevronLeft size={24} />
        </button>
        
        <div className="heatmap-carousel">
          {monthsData.map((mData, index) => {
            const offset = Math.abs(index - 2);
            return (
              <div key={`${mData.year}-${mData.month}`} className={`month-block offset-${offset}`}>
                <div className="month-card">
                  <div className="month-card-header">
                    <div className="month-card-title">
                      <div className="title-row">
                        <span className="bracket-text">[</span>
                        <span className="accent-text month-name">{fullMonthNames[mData.month]}</span>
                      </div>
                      <div className="title-row year-row">
                        <span className="year-text">{mData.year}</span>
                        <span className="bracket-text">]</span>
                      </div>
                    </div>
                    <div className="month-card-efficiency">
                      <div className="efficiency-label">EFFICIENCY:</div>
                      <div className="efficiency-value">{mData.efficiency}%</div>
                    </div>
                  </div>
                  
                  <div className="month-card-weekdays">
                    <span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span><span>S</span>
                  </div>

                  <div className="activity-heatmap">
                    {mData.cells.map(c => {
                      let level = 0;
                      if (c.rate > 0) level = 1;
                      if (c.rate >= 33) level = 2;
                      if (c.rate >= 66) level = 3;
                      if (c.rate >= 100) level = 4;

                      if (c.isEmpty) {
                        return <div key={c.date} className="heatmap-cell empty" />;
                      }

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
              </div>
            );
          })}
        </div>

        <button onClick={handleNextMonth} disabled={isRightDisabled} className="carousel-nav-btn">
          <ChevronRight size={24} />
        </button>
      </div>

      <div className="heatmap-legend">
        <span>LEGEND:</span>
        <div className="legend-items-container">
          <div className="legend-item"><div className="heatmap-cell level-1"></div><span>LOW</span></div>
          <div className="legend-item"><div className="heatmap-cell level-2"></div><span>MED</span></div>
          <div className="legend-item"><div className="heatmap-cell level-4"></div><span>HIGH</span></div>
        </div>
      </div>
    </div>
  );
};
