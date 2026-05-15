import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getAlarms, saveAlarms } from '../../services/alarmService';
import { playAudio, stopAudio } from '../../services/audioService';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { Alarm } from '../../types';
import './AlarmPopup.css';

export function AlarmPopup() {
  const [searchParams] = useSearchParams();
  const alarmId = searchParams.get('id');
  const [alarm, setAlarm] = useState<Alarm | null>(null);
  const [currentTime, setCurrentTime] = useState('');

  useEffect(() => {
    // Clock tick
    const iv = setInterval(() => {
      const now = new Date();
      let h = now.getHours();
      const m = now.getMinutes().toString().padStart(2, '0');
      const ampm = h >= 12 ? 'PM' : 'AM';
      h = h % 12;
      if (h === 0) h = 12;
      setCurrentTime(`${h.toString().padStart(2, '0')}:${m} ${ampm}`);
    }, 1000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    async function load() {
      if (!alarmId) return;
      const alarms = await getAlarms();
      const a = alarms.find(x => x.id === alarmId);
      if (a) {
        setAlarm(a);
        if (a.audioPath) {
          playAudio(a.audioPath, true);
        }
        
        // Auto-stop after 5 minutes
        setTimeout(() => {
          stopAudio();
        }, 5 * 60 * 1000);
      }
    }
    load();
    
    // Safety cleanup if window is forced closed
    return () => stopAudio();
  }, [alarmId]);

  const handleStop = async () => {
    stopAudio();
    // Re-check alarms config, if it's not repeating it should be disabled
    // Let the main scheduler handle disabling it, all we do is close the popup
    const win = getCurrentWindow();
    await win.close();
  };

  const handleSnooze = async () => {
    if (!alarm) return;
    
    stopAudio();
    const alarms = await getAlarms();
    const idx = alarms.findIndex(a => a.id === alarm.id);
    if (idx !== -1) {
      const target = alarms[idx];
      if (target.currentSnoozes < target.snoozeCount) {
        target.currentSnoozes += 1;
        const nextTime = new Date().getTime() + (target.snoozeGapMinutes * 60 * 1000);
        target.nextTriggerTimeMs = nextTime;
        await saveAlarms(alarms);
      }
    }
    const win = getCurrentWindow();
    await win.close();
  };

  if (!alarm) return null;

  return (
    <div className="alarm-popup-overlay">
      <div className="alarm-popup-content">
        <h1 className="popup-time">{currentTime}</h1>
        <p className="popup-label">{alarm.label}</p>
        {alarm.wakeUpMessage && (
          <p className="popup-message">{alarm.wakeUpMessage}</p>
        )}
        
        <div className="popup-actions">
          {alarm.currentSnoozes < alarm.snoozeCount && (
            <button className="popup-btn snooze" onClick={handleSnooze}>
              [ SNOOZE ] ({alarm.snoozeCount - alarm.currentSnoozes} left)
            </button>
          )}
          <button className="popup-btn stop" onClick={handleStop}>
            [ STOP ]
          </button>
        </div>
      </div>
    </div>
  );
}
