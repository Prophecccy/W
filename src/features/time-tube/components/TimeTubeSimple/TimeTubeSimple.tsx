import { useTimeLeft } from "../../hooks/useTimeLeft";
import "./TimeTubeSimple.css";

interface TimeTubeSimpleProps {
  wakeUpTime: string;
  bedTime: string;
  accentColor: string;
}

export function TimeTubeSimple({ wakeUpTime, bedTime, accentColor }: TimeTubeSimpleProps) {
  const timeLeft = useTimeLeft({ wakeUpTime, bedTime, lowFrequency: true });

  return (
    <div className="time-tube-simple">
      <div className="time-tube-simple__glass">
        <div
          className="time-tube-simple__fill"
          style={{
            height: `${timeLeft.percentage * 100}%`,
            backgroundColor: accentColor,
          }}
        >
          <div className="time-tube-simple__wave" style={{ backgroundColor: accentColor }} />
        </div>
      </div>
    </div>
  );
}
