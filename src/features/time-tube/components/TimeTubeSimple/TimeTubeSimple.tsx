import { useTimeLeft } from "../../hooks/useTimeLeft";
import "./TimeTubeSimple.css";

interface TimeTubeSimpleProps {
  wakeUpTime: string;
  bedTime: string;
  accentColor: string;
}

export function TimeTubeSimple({ wakeUpTime, bedTime, accentColor }: TimeTubeSimpleProps) {
  const timeLeft = useTimeLeft({ wakeUpTime, bedTime, lowFrequency: true });

  const pct = Math.round(timeLeft.percentage * 100);

  return (
    <div className="time-tube-simple-wrapper">
      {/* Percentage label */}
      <span className="time-tube-simple__label">{pct}%</span>

      {/* Tube */}
      <div className="time-tube-simple">
        <div className="time-tube-simple__glass">
          {/* Tick marks */}
          <div className="time-tube-simple__ticks">
            <div className="time-tube-simple__tick time-tube-simple__tick--25" />
            <div className="time-tube-simple__tick time-tube-simple__tick--50" />
            <div className="time-tube-simple__tick time-tube-simple__tick--75" />
          </div>

          {/* Liquid fill */}
          <div
            className="time-tube-simple__fill"
            style={{
              height: `${timeLeft.percentage * 100}%`,
              backgroundColor: accentColor,
            }}
          >
            <div className="time-tube-simple__wave" style={{ backgroundColor: accentColor }} />
            <div className="time-tube-simple__bubble time-tube-simple__bubble--1" />
            <div className="time-tube-simple__bubble time-tube-simple__bubble--2" />
            <div className="time-tube-simple__bubble time-tube-simple__bubble--3" />
            <div className="time-tube-simple__bubble time-tube-simple__bubble--4" />
            <div className="time-tube-simple__bubble time-tube-simple__bubble--5" />
            <div className="time-tube-simple__bubble time-tube-simple__bubble--6" />
            <div className="time-tube-simple__bubble time-tube-simple__bubble--7" />
            <div className="time-tube-simple__bubble time-tube-simple__bubble--8" />
            <div className="time-tube-simple__bubble time-tube-simple__bubble--9" />
            <div className="time-tube-simple__bubble time-tube-simple__bubble--10" />
          </div>
          <div className="time-tube-simple__glare" />
        </div>
      </div>
    </div>
  );
}
