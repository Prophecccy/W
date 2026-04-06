import { useState, useEffect } from 'react';
import { Alarm } from '../../types';
import { createAlarm, updateAlarm } from '../../services/alarmService';
import { TimePickerWheel } from './TimePickerWheel';
import { open } from '@tauri-apps/plugin-dialog';
import { ChevronLeft, Save } from 'lucide-react';
import './AlarmForm.css';

interface Props {
  initialAlarm?: Alarm;
  onClose: () => void;
}

const HOURS = Array.from({ length: 12 }, (_, i) => (i === 0 ? 12 : i).toString().padStart(2, '0'));
const MINUTES = Array.from({ length: 60 }, (_, i) => i.toString().padStart(2, '0'));
const AMPM = ['AM', 'PM'];
const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

function parse24to12(time: string) {
  const [hStr, mStr] = time.split(':');
  let h = parseInt(hStr, 10);
  const m = mStr;
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12;
  if (h === 0) h = 12;
  return { h: h.toString().padStart(2, '0'), m, ampm };
}

function convert12to24(h: string, m: string, ampm: string): string {
  let hNum = parseInt(h, 10);
  if (ampm === 'PM' && hNum < 12) hNum += 12;
  if (ampm === 'AM' && hNum === 12) hNum = 0;
  return `${hNum.toString().padStart(2, '0')}:${m}`;
}

export function AlarmForm({ initialAlarm, onClose }: Props) {
  const isEditing = !!initialAlarm;

  const [hour, setHour] = useState('06');
  const [minute, setMinute] = useState('00');
  const [amPm, setAmPm] = useState('AM');
  
  const [label, setLabel] = useState('');
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>([]);
  const [audioPath, setAudioPath] = useState<string | null>(null);
  const [snoozeCount, setSnoozeCount] = useState(3);
  const [snoozeGapMinutes, setSnoozeGapMinutes] = useState(5);
  const [wakeUpMessage, setWakeUpMessage] = useState('');

  useEffect(() => {
    if (initialAlarm) {
      const { h, m, ampm } = parse24to12(initialAlarm.time);
      setHour(h);
      setMinute(m);
      setAmPm(ampm);
      setLabel(initialAlarm.label);
      setDaysOfWeek(initialAlarm.daysOfWeek);
      setAudioPath(initialAlarm.audioPath);
      setSnoozeCount(initialAlarm.snoozeCount);
      setSnoozeGapMinutes(initialAlarm.snoozeGapMinutes);
      setWakeUpMessage(initialAlarm.wakeUpMessage);
    }
  }, [initialAlarm]);

  const toggleDay = (dayIndex: number) => {
    setDaysOfWeek(prev => 
      prev.includes(dayIndex) 
        ? prev.filter(d => d !== dayIndex)
        : [...prev, dayIndex].sort()
    );
  };

  const handlePickAudio = async () => {
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

  const handleSave = async () => {
    const time24 = convert12to24(hour, minute, amPm);
    
    // Auto-enable when creating or fully editing
    const alarmData: Alarm = {
      id: initialAlarm?.id || crypto.randomUUID(),
      time: time24,
      label,
      audioPath,
      daysOfWeek,
      repeatDaily: daysOfWeek.length > 0,
      snoozeCount,
      snoozeGapMinutes,
      wakeUpMessage,
      enabled: true,
      currentSnoozes: 0,
      nextTriggerTimeMs: null
    };

    if (isEditing) {
      await updateAlarm(alarmData.id, alarmData);
    } else {
      const success = await createAlarm(alarmData);
      if (!success) {
        alert("Maximum alarms (6) reached.");
        return;
      }
    }
    onClose();
  };

  return (
    <div className="alarm-form">
      <header className="alarm-form-header">
        <button className="icon-btn" onClick={onClose}>
          <ChevronLeft size={24} />
        </button>
        <span className="t-meta">{isEditing ? 'EDIT ALARM' : 'NEW ALARM'}</span>
        <button className="icon-btn save-btn" onClick={handleSave}>
          <Save size={20} />
        </button>
      </header>

      <div className="alarm-form-content">
        <section className="form-section center-section">
          <div className="time-picker-wrapper">
            <TimePickerWheel items={HOURS} value={hour} onChange={setHour} />
            <span className="time-colon">:</span>
            <TimePickerWheel items={MINUTES} value={minute} onChange={setMinute} />
            <div className="spacer-sm" />
            <TimePickerWheel items={AMPM} value={amPm} onChange={setAmPm} />
          </div>
        </section>

        <section className="form-section">
          <label className="t-label">LABEL</label>
          <input 
            type="text" 
            className="w-input t-meta" 
            placeholder="E.G. WAKE UP" 
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            maxLength={20}
          />
        </section>

        <section className="form-section">
          <label className="t-label">REPEAT ON</label>
          <div className="days-selector">
            {DAYS.map((d, i) => (
              <button 
                key={i}
                className={`day-btn ${daysOfWeek.includes(i) ? 'active' : ''}`}
                onClick={() => toggleDay(i)}
              >
                {d}
              </button>
            ))}
          </div>
        </section>

        <section className="form-section">
          <label className="t-label">SETTINGS</label>
          <div className="settings-panel">
            <div className="setting-row">
              <div className="setting-label">SOUND</div>
              <button className="w-btn btn-glass audio-btn" onClick={handlePickAudio}>
                <span className="t-meta audio-path-text">
                  {audioPath ? audioPath.split('\\').pop()?.split('/').pop() : 'DEFAULT'}
                </span>
              </button>
            </div>

            <div className="setting-row">
              <div className="setting-label">SNOOZE ALLOWED</div>
              <div className="stepper">
                <button onClick={() => setSnoozeCount(Math.max(0, snoozeCount - 1))}>-</button>
                <span>{snoozeCount}x</span>
                <button onClick={() => setSnoozeCount(snoozeCount + 1)}>+</button>
              </div>
            </div>

            <div className="setting-row">
              <div className="setting-label">SNOOZE GAP (MIN)</div>
              <div className="stepper">
                <button onClick={() => setSnoozeGapMinutes(Math.max(1, snoozeGapMinutes - 1))}>-</button>
                <span>{snoozeGapMinutes}m</span>
                <button onClick={() => setSnoozeGapMinutes(snoozeGapMinutes + 1)}>+</button>
              </div>
            </div>
          </div>
        </section>

        <section className="form-section">
          <label className="t-label">POPUP MESSAGE</label>
          <textarea
            className="w-input message-input t-meta"
            placeholder="Displays when alarm fires..."
            value={wakeUpMessage}
            onChange={(e) => setWakeUpMessage(e.target.value)}
            maxLength={100}
            rows={2}
          />
        </section>
      </div>
    </div>
  );
}
