import { useEffect, useState, useRef } from 'react';
import { Trash2, Play, Pause, RotateCcw } from 'lucide-react';
import { Timer } from '../../types';
import './TimerCard.css';

interface TimerCardProps {
  timer: Timer;
  onStart: (id: string) => void;
  onPause: (id: string) => void;
  onReset: (id: string) => void;
  onDelete: (id: string) => void;
}

export function TimerCard({ timer, onStart, onPause, onReset, onDelete }: TimerCardProps) {
  // Use RAF for perfectly smooth progress if running
  const [displaySeconds, setDisplaySeconds] = useState(timer.remainingSeconds);
  const requestRef = useRef<number>(null);

  useEffect(() => {
    if (timer.status !== 'running' || !timer.endTimeMs) {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
      setDisplaySeconds(timer.remainingSeconds);
      return;
    }

    const updateTimer = () => {
      const now = Date.now();
      const remainingMs = timer.endTimeMs! - now;
      if (remainingMs <= 0) {
        setDisplaySeconds(0);
        return;
      }
      setDisplaySeconds(Math.ceil(remainingMs / 1000));
      requestRef.current = requestAnimationFrame(updateTimer);
    };
    
    requestRef.current = requestAnimationFrame(updateTimer);
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [timer]);

  const progress = Math.max(0, Math.min(1, displaySeconds / timer.durationSeconds));
  
  // Format hours:minutes:seconds
  const h = Math.floor(displaySeconds / 3600);
  const m = Math.floor((displaySeconds % 3600) / 60);
  const s = displaySeconds % 60;
  const timeString = h > 0 
    ? `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
    : `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;

  return (
    <div className={`timer-card ${timer.status === 'running' ? 'is-running' : ''}`}>
      <button className="timer-delete-btn" onClick={() => onDelete(timer.id)}>
        <Trash2 size={16} />
      </button>

      <div className="timer-ring-container">
        <svg className="timer-ring" viewBox="0 0 100 100">
          <circle className="timer-ring-bg" cx="50" cy="50" r="45" />
          <circle 
            className="timer-ring-fill" 
            cx="50" 
            cy="50" 
            r="45" 
            style={{ 
              strokeDasharray: 282.74, 
              strokeDashoffset: 282.74 * (1 - progress) 
            }} 
          />
        </svg>
        <div className="timer-time-display t-display">{timeString}</div>
      </div>

      <div className="timer-name t-strong">{timer.name}</div>

      <div className="timer-controls">
        {timer.status === 'running' ? (
          <button className="bracket-btn" onClick={() => onPause(timer.id)}>
             [ <Pause size={14}/> PAUSE ]
          </button>
        ) : (
          <button className="bracket-btn" onClick={() => onStart(timer.id)}>
             [ <Play size={14}/> START ]
          </button>
        )}
        <button className="bracket-btn" onClick={() => onReset(timer.id)}>
           [ <RotateCcw size={14}/> RESET ]
        </button>
      </div>
    </div>
  );
}
