import React, { useEffect, useState } from "react";
import { HabitLog } from "../../habits/types";
import { getLogRange } from "../../habits/services/logService";
import "./ActivityHeatmap.css";

interface Props {
  endDate: string;
  daysCount: number; // usually 90
  habitId?: string; // If passed, show heatmap for specific habit
}

interface Cell {
  date: string;
  rate: number;
}

export const ActivityHeatmap: React.FC<Props> = ({ endDate, daysCount, habitId }) => {
  const [cells, setCells] = useState<Cell[]>([]);

  useEffect(() => {
    async function load() {
      const endD = new Date(endDate + "T00:00:00");
      const startD = new Date(endD);
      startD.setDate(startD.getDate() - daysCount + 1);

      const logs = await getLogRange(
        startD.toISOString().split("T")[0], 
        endD.toISOString().split("T")[0]
      );

      // Build a map for O(1) lookup
      const logMap: Record<string, HabitLog> = {};
      for (const log of logs) logMap[log.date] = log;

      const generatedCells: Cell[] = [];
      const d = new Date(startD);

      for (let i = 0; i < daysCount; i++) {
        const dateStr = d.toISOString().split("T")[0];
        const log = logMap[dateStr];
        let rate = 0;

        if (log) {
          if (habitId) {
            const entry = log.habits[habitId];
            if (entry) {
              rate = entry.completed ? 100 : 0; // Or partial for metrics?
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

        generatedCells.push({ date: dateStr, rate });
        d.setDate(d.getDate() + 1);
      }

      setCells(generatedCells);
    }
    load();
  }, [endDate, daysCount, habitId]);

  // Render a GitHub style calendar. We want columns to be weeks.
  // We'll just let CSS Grid handle the mapping by putting it in 7 rows.
  // Wait, to get it to flow column by column we need grid-auto-flow: column.

  return (
    <div className="activity-heatmap-container">
      <div className="activity-heatmap">
        {cells.map(c => {
          // Map rate to opacity/intensity
          // 0 = base surface
          // 1-25 = level 1
          // ...
          let level = 0;
          if (c.rate > 0) level = 1;
          if (c.rate >= 33) level = 2;
          if (c.rate >= 66) level = 3;
          if (c.rate >= 100) level = 4;

          return (
            <div 
              key={c.date} 
              className={`heatmap-cell level-${level}`}
              title={`${c.date}: ${c.rate}% completed`}
            />
          );
        })}
      </div>
    </div>
  );
};
