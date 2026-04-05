import React from "react";
import { useAuth } from "../../auth/hooks/useAuth";
import { User } from "../../../shared/types";
import "./TimelineReview.css";

export const TimelineReview: React.FC = () => {
  const { user } = useAuth();
  
  if (!user) return null;

  const strikes = (user as unknown as User)?.strikes?.history || [];

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
