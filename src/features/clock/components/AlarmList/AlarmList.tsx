import { useState, useEffect } from 'react';
import { Alarm } from '../../types';
import { getAlarms, toggleAlarm, deleteAlarm } from '../../services/alarmService';
import { AlarmForm } from '../AlarmForm/AlarmForm';
import './AlarmList.css';
import { Plus, Settings, Trash2 } from 'lucide-react';

const DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export function AlarmList() {
  const [alarms, setAlarms] = useState<Alarm[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingAlarm, setEditingAlarm] = useState<Alarm | undefined>(undefined);

  const fetchAlarms = async () => {
    const data = await getAlarms();
    setAlarms(data);
  };

  useEffect(() => {
    fetchAlarms();
  }, []);

  const handleToggle = async (id: string) => {
    await toggleAlarm(id);
    fetchAlarms();
  };

  const handleDelete = async (id: string) => {
    await deleteAlarm(id);
    fetchAlarms();
  };

  const handleEdit = (alarm: Alarm) => {
    setEditingAlarm(alarm);
    setShowForm(true);
  };

  const closeForm = () => {
    setEditingAlarm(undefined);
    setShowForm(false);
    fetchAlarms();
  };

  if (showForm) {
    return <AlarmForm initialAlarm={editingAlarm} onClose={closeForm} />;
  }

  return (
    <div className="alarm-list-container">
      {alarms.length === 0 ? (
        <div className="no-alarms">
          <p className="t-meta">NO ALARMS CONFIGURED</p>
        </div>
      ) : (
        <div className="alarm-list">
          {alarms.map((alarm) => (
            <div key={alarm.id} className={`alarm-card ${alarm.enabled ? 'enabled' : 'disabled'}`}>
              <div className="alarm-card-left" onClick={() => handleEdit(alarm)}>
                <h2 className="alarm-time">{alarm.time}</h2>
                <div className="alarm-label">{alarm.label || 'Alarm'}</div>
                <div className="alarm-days">
                  {alarm.daysOfWeek.length === 0 ? (
                    <span className="no-repeat">Once</span>
                  ) : (
                    DAYS.map((d, i) => (
                      <span key={i} className={`day-indicator ${alarm.daysOfWeek.includes(i) ? 'active' : ''}`}>
                        {d}
                      </span>
                    ))
                  )}
                </div>
              </div>
              <div className="alarm-card-right">
                <button 
                  className="icon-btn delete-btn" 
                  onClick={() => handleDelete(alarm.id)}
                  title="Delete"
                >
                  <Trash2 size={16} />
                </button>
                <button 
                  className="icon-btn edit-btn" 
                  onClick={() => handleEdit(alarm)}
                  title="Settings"
                >
                  <Settings size={16} />
                </button>
                <label className="switch">
                  <input 
                    type="checkbox" 
                    checked={alarm.enabled} 
                    onChange={() => handleToggle(alarm.id)} 
                  />
                  <span className="slider"></span>
                </label>
              </div>
            </div>
          ))}
        </div>
      )}
      
      {alarms.length < 6 && (
        <button className="add-alarm-btn" onClick={() => setShowForm(true)}>
          <Plus size={20} />
          <span>[ NEW ALARM ]</span>
        </button>
      )}
    </div>
  );
}
