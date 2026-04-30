import React, { useEffect, useState } from "react";
import { HabitLog } from "../../habits/types";
import { getLogRange } from "../../habits/services/logService";
import { useAuth } from "../../auth/hooks/useAuth";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
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
  const [isLoading, setIsLoading] = useState(false);

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

      const accountCreatedAt = user?.metadata?.creationTime ? new Date(user.metadata.creationTime) : new Date();
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
          cells.push({ date: `empty-start-${mMonth}-${i}`, rate: -1, isGhost: true, isEmpty: true });
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
            cells.push({ date: `empty-end-${mMonth}-${i}`, rate: -1, isGhost: true, isEmpty: true });
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
      setIsLoading(false);
    }
    load();
  }, [currentViewDate, habitId, user?.metadata?.creationTime]);

  const accountCreatedAt = user?.metadata?.creationTime ? new Date(user.metadata.creationTime) : new Date();
  
  const isLeftDisabled = currentViewDate.getFullYear() === accountCreatedAt.getFullYear() && 
                         currentViewDate.getMonth() === accountCreatedAt.getMonth();
                         
  const today = new Date();
  const isRightDisabled = currentViewDate.getFullYear() === today.getFullYear() && 
                          currentViewDate.getMonth() === today.getMonth();

  const handlePrevMonth = () => {
    if (isLeftDisabled || isLoading) return;
    setCurrentViewDate(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    if (isRightDisabled || isLoading) return;
    setCurrentViewDate(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  };

  const fullMonthNames = ["JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE", "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"];
  const centerMonth = monthsData[2];

  return (
    <div className="activity-heatmap-container">
      <div className="heatmap-global-header">
        {centerMonth && (
          <div className="heatmap-dynamic-title">
            <span className="bracket-text">[</span>
            <span className="accent-text month-name">{fullMonthNames[centerMonth.month]}</span>
            <span className="year-text">{centerMonth.year}</span>
            <span className="bracket-text">]</span>
          </div>
        )}
        <h2 className="t-label">[ ACTIVITY HEATMAP ]</h2>
      </div>

      <div className="heatmap-carousel-wrapper">
        <button onClick={handlePrevMonth} disabled={isLeftDisabled} className="carousel-nav-btn prev">
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
                  initial={{ opacity: 0, scale: 0.8, x: offset > 0 ? 100 : -100 }}
                  animate={{ 
                    opacity: absOffset === 0 ? 1 : absOffset === 1 ? 0.4 : 0.1,
                    scale: absOffset === 0 ? 1 : absOffset === 1 ? 0.85 : 0.7,
                    x: 0,
                    zIndex: 5 - absOffset,
                    filter: absOffset === 0 ? "blur(0px) grayscale(0%)" : `blur(${absOffset * 1}px) grayscale(100%)`
                  }}
                  exit={{ opacity: 0, scale: 0.6, x: offset > 0 ? -100 : 100 }}
                  transition={{ 
                    type: "spring", 
                    stiffness: 260, 
                    damping: 25,
                    layout: { duration: 0.4, ease: "easeInOut" }
                  }}
                >
                  <div className="month-card">
                    <div className="month-card-header">
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
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>

        <button onClick={handleNextMonth} disabled={isRightDisabled} className="carousel-nav-btn next">
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
