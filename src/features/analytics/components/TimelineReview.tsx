import React from "react";
import { useUserStore } from "../../../shared/stores/userStore";
import "./TimelineReview.css";

export const TimelineReview: React.FC = () => {
  const { userDoc } = useUserStore();
  
  if (!userDoc || userDoc.settings?.strikeSystemEnabled === false) return null;

  const strikes = userDoc.strikes?.history || [];

  return (
    <div className="timeline-review analytics-card">
      <h2 className="t-label">[ STRIKE TIMELINE ]</h2>
      <div className="timeline-container">
        {strikes.length === 0 ? (
          <div className="t-body text-muted">No strikes on record. Flawless.</div>
        ) : (
          <div className="timeline-track">
            {strikes.map((s: any, i: number) => (
              <div key={i} className="timeline-event">
                <div className="event-dot" />
                <div className="event-content">
                  <div className="t-meta event-date">{s.date}</div>
                  <div className="t-body event-title">{s.habitTitle}</div>
                  <div className="t-meta text-muted">Reason: {s.reason}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
