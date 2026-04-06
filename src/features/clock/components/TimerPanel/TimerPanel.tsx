import { useState, useEffect } from 'react';
import { Timer } from '../../types';
import { getTimers, createTimer, deleteTimer, startTimer, pauseTimer, resetTimer, saveTimers } from '../../services/timerService';
import { TimerCard } from '../TimerCard/TimerCard';
import { TimePickerWheel } from '../AlarmForm/TimePickerWheel';
import { open } from '@tauri-apps/plugin-dialog';
import { Plus, Music } from 'lucide-react';
import './TimerPanel.css';

const HOURS_OPTIONS = Array.from({ length: 100 }, (_, i) => i.toString().padStart(2, '0'));
const MIN_SEC_OPTIONS = Array.from({ length: 60 }, (_, i) => i.toString().padStart(2, '0'));

export function TimerPanel() {
  const [timers, setTimers] = useState<Timer[]>([]);
  
  // Form state
  const [hours, setHours] = useState('00');
  const [minutes, setMinutes] = useState('05');
  const [seconds, setSeconds] = useState('00');
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
    const h = parseInt(hours, 10) || 0;
    const m = parseInt(minutes, 10) || 0;
    const s = parseInt(seconds, 10) || 0;
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
    try {
      const selected = await open({
        multiple: false,
        directory: false,
        filters: [{
          name: 'Audio',
          extensions: ['mp3', 'wav', 'ogg', 'flac']
        }]
      });
      if (selected && typeof selected === 'string') {
        setAudioPath(selected);
      }
    } catch (err) {
      console.error("Failed to open dialog:", err);
    }
  };

  return (
    <div className="timer-panel">
      <div className="timer-create-section">
        <h3 className="t-label">NEW TIMER</h3>
        <div className="timer-form-row">
          <div className="timer-picker-wrapper">
            <TimePickerWheel items={HOURS_OPTIONS} value={hours} onChange={setHours} />
            <span className="time-colon">:</span>
            <TimePickerWheel items={MIN_SEC_OPTIONS} value={minutes} onChange={setMinutes} />
            <span className="time-colon">:</span>
            <TimePickerWheel items={MIN_SEC_OPTIONS} value={seconds} onChange={setSeconds} />
          </div>
          
          <div className="timer-form-controls">
            <input 
              type="text" 
              value={name} 
              onChange={e => setName(e.target.value)} 
              placeholder="Timer Name" 
              className="w-input t-meta timer-name-input"
            />

            <div className="timer-audio-section">
              <button className={`w-btn btn-glass ${audioPath ? 'has-audio' : ''}`} onClick={pickAudio} title="Select Audio">
                 <Music size={14}/> 
                 <span className="t-meta">{audioPath ? 'AUDIO SET' : 'AUDIO'}</span>
              </button>
              {audioPath && (
                <label className="audio-for-all-label t-meta">
                  <input 
                    type="checkbox" 
                    checked={useAudioForAll}
                    onChange={e => setUseAudioForAll(e.target.checked)}
                  />
                  APPLY TO ALL
                </label>
              )}
            </div>

            <button className="w-btn btn-ghost add-timer-btn" onClick={handleCreate} disabled={timers.length >= 6}>
               <Plus size={16}/> 
               <span className="t-strong">ADD</span>
            </button>
          </div>
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
