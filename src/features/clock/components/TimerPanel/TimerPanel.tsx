import { useState, useEffect } from 'react';
import { Timer } from '../../types';
import { getTimers, createTimer, deleteTimer, startTimer, pauseTimer, resetTimer, saveTimers } from '../../services/timerService';
import { TimerCard } from '../TimerCard/TimerCard';
import { open } from '@tauri-apps/plugin-dialog';
import { Plus, Music } from 'lucide-react';
import './TimerPanel.css';

export function TimerPanel() {
  const [timers, setTimers] = useState<Timer[]>([]);
  
  // Form state
  const [hours, setHours] = useState('0');
  const [minutes, setMinutes] = useState('5');
  const [seconds, setSeconds] = useState('0');
  const [name, setName] = useState('Timer');
  const [audioPath, setAudioPath] = useState<string | null>(null);
  const [useAudioForAll, setUseAudioForAll] = useState(false);

  useEffect(() => {
    loadTimers();
    // Poll to keep stopped/finished sync from background
    const interval = setInterval(loadTimers, 2000);
    return () => clearInterval(interval);
  }, []);

  const loadTimers = async () => {
    const data = await getTimers();
    setTimers(data || []);
  };

  const handleCreate = async () => {
    const h = parseInt(hours) || 0;
    const m = parseInt(minutes) || 0;
    const s = parseInt(seconds) || 0;
    const totalSeconds = h * 3600 + m * 60 + s;
    
    if (totalSeconds <= 0) return;

    if (useAudioForAll && audioPath) {
      const currentTimers = await getTimers();
      const updated = currentTimers.map(t => ({ ...t, audioPath }));
      await saveTimers(updated);
    }

    const newTimer: Timer = {
      id: crypto.randomUUID(),
      name: name || 'Timer',
      durationSeconds: totalSeconds,
      remainingSeconds: totalSeconds,
      status: 'stopped',
      endTimeMs: null,
      audioPath
    };

    const success = await createTimer(newTimer);
    if (!success) {
      alert("Max 6 timers allowed.");
    }
    await loadTimers();
  };

  const handleStart = async (id: string) => {
    await startTimer(id);
    await loadTimers();
  };

  const handlePause = async (id: string) => {
    await pauseTimer(id);
    await loadTimers();
  };

  const handleReset = async (id: string) => {
    await resetTimer(id);
    await loadTimers();
  };

  const handleDelete = async (id: string) => {
    await deleteTimer(id);
    await loadTimers();
  };

  const pickAudio = async () => {
    const selected = await open({
      multiple: false,
      filters: [{ name: 'Audio', extensions: ['mp3', 'wav', 'ogg'] }]
    });
    if (selected && typeof selected === 'string') {
      setAudioPath(selected);
    }
  };

  return (
    <div className="timer-panel">
      <div className="timer-create-section">
        <h3 className="t-strong">CREATE TIMER</h3>
        <div className="timer-form-row">
          <div className="time-inputs">
            <input type="number" min="0" max="99" value={hours} onChange={e => setHours(e.target.value)} placeholder="H" className="time-input" />
            <span className="colon">:</span>
            <input type="number" min="0" max="59" value={minutes} onChange={e => setMinutes(e.target.value)} placeholder="M" className="time-input" />
            <span className="colon">:</span>
            <input type="number" min="0" max="59" value={seconds} onChange={e => setSeconds(e.target.value)} placeholder="S" className="time-input" />
          </div>
          
          <input 
            type="text" 
            value={name} 
            onChange={e => setName(e.target.value)} 
            placeholder="Timer Name" 
            className="timer-name-input"
          />

          <div style={{display: 'flex', flexDirection: 'column', gap: '4px'}}>
            <button className={`bracket-btn ${audioPath ? 'has-audio' : ''}`} onClick={pickAudio} title="Select Audio">
               [ <Music size={14}/> {audioPath ? 'AUDIO SET' : 'AUDIO'} ]
            </button>
            {audioPath && (
              <label style={{display: 'flex', alignItems: 'center', gap: '6px', fontSize: '10px', color: 'var(--text-dim)', cursor: 'pointer'}}>
                <input 
                  type="checkbox" 
                  checked={useAudioForAll}
                  onChange={e => setUseAudioForAll(e.target.checked)}
                  style={{ accentColor: 'var(--accent)', transform: 'scale(0.8)' }}
                />
                Use for all
              </label>
            )}
          </div>

          <button className="bracket-btn confirm" onClick={handleCreate} disabled={timers.length >= 6}>
             [ <Plus size={14}/> ADD ]
          </button>
        </div>
      </div>

      <div className="timers-grid">
        {timers.map(t => (
          <TimerCard
            key={t.id}
            timer={t}
            onStart={handleStart}
            onPause={handlePause}
            onReset={handleReset}
            onDelete={handleDelete}
          />
        ))}
      </div>
    </div>
  );
}
