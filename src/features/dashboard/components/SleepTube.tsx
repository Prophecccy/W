import { useContext } from 'react';
import { useTimeLeft } from '../hooks/useTimeLeft';
import { UserStoreContext } from '../../../shared/stores/userStore';
import { isTauri } from '../../../shared/utils/tauri';
import './SleepTube.css';

interface SleepTubeProps {
  settings?: {
    wakeUpTime: string;
    bedTime: string;
    emptyTubeText?: string;
  };
  isWidget?: boolean;
}

export function SleepTube({ settings: propsSettings, isWidget }: SleepTubeProps) {
  const isDesktop = isTauri();
  const store = useContext(UserStoreContext);
  const userStoreDoc = store?.userDoc ?? null;

  const settings = propsSettings || userStoreDoc?.settings;
  const { percent, phase, minutesPassed, totalMinutes } = useTimeLeft(
    settings?.wakeUpTime, 
    settings?.bedTime
  );

  const isSleeping = phase === 'sleeping';
  const isEmpty = percent <= 0;
  const emptyText = settings?.emptyTubeText || 'DEPLETED';
  const MARKERS = [100, 75, 50, 25, 0];

  return (
    <div 
      className={`sleep-tube ${isWidget ? 'sleep-tube--widget' : ''}`}
      title={`Waking Fuel: ${Math.round(percent)}% (${Math.round(minutesPassed)}/${totalMinutes}m)`}
      style={isDesktop && !isWidget ? { height: '100%', maxHeight: 'none', minHeight: '400px' } : undefined}
    >
      <div className="sleep-tube__label t-meta">{isWidget ? '[ FUEL ]' : '[ WAKING FUEL ]'}</div>
      <div className={`sleep-tube__track ${isEmpty ? 'is-empty' : ''}`}>
        {MARKERS.map(m => (
          <div 
            key={m} 
            className="sleep-tube__marker" 
            style={{ top: `${100 - m}%` }}
          >
            <div 
              className="sleep-tube__tick" 
              style={{ opacity: (m === 100 || m === 0) ? 0 : 1 }} 
            />
            <span className="t-meta">{m}</span>
          </div>
        ))}
        <div 
          className={`sleep-tube__fill ${isSleeping ? 'is-sleeping' : ''}`}
          style={{ height: `${percent}%` }}
        />
        {isEmpty && !isWidget && (
          <div className="sleep-tube__empty-text t-data">
            {emptyText}
          </div>
        )}
      </div>
    </div>
  );
}
