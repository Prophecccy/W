import { useTimeLeft } from '../hooks/useTimeLeft';
import { useUserStore } from '../../../shared/stores/userStore';

export function SleepTube() {
  const { userDoc } = useUserStore();
  const settings = userDoc?.settings;
  const { percent, phase, minutesPassed, totalMinutes } = useTimeLeft(
    settings?.wakeUpTime, 
    settings?.bedTime
  );

  const isSleeping = phase === 'sleeping';
  const MARKERS = [100, 75, 50, 25, 0];

  return (
    <div 
      className="sleep-tube" 
      title={`Waking Fuel: ${Math.round(percent)}% (${Math.round(minutesPassed)}/${totalMinutes}m)`}
    >
      <div className="sleep-tube__label t-meta">[ FUEL ]</div>
      <div className="sleep-tube__track">
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
      </div>
    </div>
  );
}
