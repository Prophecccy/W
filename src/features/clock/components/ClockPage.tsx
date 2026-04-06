import { useState } from 'react';
import './ClockPage.css';
import { AlarmList } from './AlarmList/AlarmList';
import { TimerPanel } from './TimerPanel/TimerPanel';
import { StopwatchPanel } from './StopwatchPanel/StopwatchPanel';

type Tab = 'ALARMS' | 'TIMER' | 'STOPWATCH';

export function ClockPage() {
  const [activeTab, setActiveTab] = useState<Tab>('ALARMS');

  return (
    <div className="clock-page">
      <header className="clock-header">
        <nav className="clock-tabs">
          <button 
            className={`tab-btn ${activeTab === 'ALARMS' ? 'active' : ''}`}
            onClick={() => setActiveTab('ALARMS')}
          >
            ALARMS
          </button>
          <button 
            className={`tab-btn ${activeTab === 'TIMER' ? 'active' : ''}`}
            onClick={() => setActiveTab('TIMER')}
          >
            TIMER
          </button>
          <button 
            className={`tab-btn ${activeTab === 'STOPWATCH' ? 'active' : ''}`}
            onClick={() => setActiveTab('STOPWATCH')}
          >
            STOPWATCH
          </button>
        </nav>
      </header>

      <div className="clock-content">
        {activeTab === 'ALARMS' && <AlarmList />}
        {activeTab === 'TIMER' && <TimerPanel />}
        {activeTab === 'STOPWATCH' && <StopwatchPanel />}
      </div>
    </div>
  );
}
