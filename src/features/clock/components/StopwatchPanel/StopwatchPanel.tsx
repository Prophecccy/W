import { useState, useEffect, useRef } from 'react';
import { getStopwatchState, saveStopwatchState } from '../../services/stopwatchService';
import { StopwatchState, StopwatchLap } from '../../types';
import { Play, Pause, RotateCcw, Flag } from 'lucide-react';
import './StopwatchPanel.css';

export function StopwatchPanel() {
  const [state, setState] = useState<StopwatchState>({
    running: false,
    startTimeMs: null,
    accumulatedMs: 0,
    elapsedMs: 0,
    laps: []
  });
  
  const [displayMs, setDisplayMs] = useState(0);
  const requestRef = useRef<number>(null);

  useEffect(() => {
    loadState();
  }, []);

  const loadState = async () => {
    const data = await getStopwatchState();
    setState(data);
    setDisplayMs(data.elapsedMs);
  };

  useEffect(() => {
    if (!state.running || !state.startTimeMs) {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
      setDisplayMs(state.elapsedMs);
      return;
    }

    const updateTime = () => {
      const now = Date.now();
      const currentElapsed = state.accumulatedMs + (now - state.startTimeMs!);
      setDisplayMs(currentElapsed);
      requestRef.current = requestAnimationFrame(updateTime);
    };
    
    requestRef.current = requestAnimationFrame(updateTime);
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [state]);

  const handleStart = async () => {
    if (state.running) return;
    const newState: StopwatchState = {
      ...state,
      running: true,
      startTimeMs: Date.now()
    };
    setState(newState);
    await saveStopwatchState(newState);
  };

  const handlePause = async () => {
    if (!state.running || !state.startTimeMs) return;
    const now = Date.now();
    const newAccumulated = state.accumulatedMs + (now - state.startTimeMs);
    const newState: StopwatchState = {
      ...state,
      running: false,
      startTimeMs: null,
      accumulatedMs: newAccumulated,
      elapsedMs: newAccumulated
    };
    setState(newState);
    await saveStopwatchState(newState);
  };

  const handleReset = async () => {
    const newState: StopwatchState = {
      running: false,
      startTimeMs: null,
      accumulatedMs: 0,
      elapsedMs: 0,
      laps: []
    };
    setState(newState);
    await saveStopwatchState(newState);
  };

  const handleLap = async () => {
    if (!state.running || !state.startTimeMs) return;
    const now = Date.now();
    const currentElapsed = state.accumulatedMs + (now - state.startTimeMs);
    
    const previousTotal = state.laps.length > 0 ? state.laps[0].totalTimeMs : 0;
    const lapTime = currentElapsed - previousTotal;

    const newLap: StopwatchLap = {
      id: crypto.randomUUID(),
      lapNumber: state.laps.length + 1,
      lapTimeMs: lapTime,
      totalTimeMs: currentElapsed
    };

    const newState: StopwatchState = {
      ...state,
      laps: [newLap, ...state.laps]
    };
    
    setState(newState);
    await saveStopwatchState(newState);
  };

  // Format MM:SS.ms or HH:MM:SS.ms
  const formatTime = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    const milli = Math.floor((ms % 1000) / 10); // 2 digits

    const mmss = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${milli.toString().padStart(2, '0')}`;
    return h > 0 ? `${h.toString().padStart(2, '0')}:${mmss}` : mmss;
  };

  return (
    <div className="stopwatch-panel">
      <div className="stopwatch-display-container">
        <div className="stopwatch-display t-display">
          {formatTime(displayMs)}
        </div>
      </div>

      <div className="stopwatch-controls">
        {state.running ? (
          <button className="bracket-btn is-active" onClick={handlePause}>
             [ <Pause size={18}/> PAUSE ]
          </button>
        ) : (
          <button className="bracket-btn" onClick={handleStart}>
             [ <Play size={18}/> START ]
          </button>
        )}
        <button className="bracket-btn" onClick={handleLap} disabled={!state.running}>
           [ <Flag size={18}/> LAP ]
        </button>
        <button className="bracket-btn" onClick={handleReset}>
           [ <RotateCcw size={18}/> RESET ]
        </button>
      </div>

      {state.laps.length > 0 && (
        <div className="laps-container">
          <table className="laps-table">
            <thead>
              <tr>
                <th>LAP</th>
                <th>LAP TIME</th>
                <th>TOTAL TIME</th>
              </tr>
            </thead>
            <tbody>
              {state.laps.map(lap => (
                <tr key={lap.id}>
                  <td>{lap.lapNumber.toString().padStart(2, '0')}</td>
                  <td>{formatTime(lap.lapTimeMs)}</td>
                  <td>{formatTime(lap.totalTimeMs)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
