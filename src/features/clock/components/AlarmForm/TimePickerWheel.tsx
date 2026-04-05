import { useRef, useEffect, UIEvent } from 'react';
import './TimePickerWheel.css';

interface Props {
  items: string[];
  value: string;
  onChange: (val: string) => void;
}

export function TimePickerWheel({ items, value, onChange }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const isScrollingRef = useRef(false);
  const scrollTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    // Scroll to the selected value on mount or if externally changed
    if (!isScrollingRef.current && containerRef.current) {
      const idx = items.indexOf(value);
      if (idx !== -1) {
        const itemHeight = 60; // Has to match CSS item height
        containerRef.current.scrollTop = idx * itemHeight;
      }
    }
  }, [value, items]);

  const handleScroll = (e: UIEvent<HTMLDivElement>) => {
    isScrollingRef.current = true;
    if (scrollTimeoutRef.current) {
      window.clearTimeout(scrollTimeoutRef.current);
    }

    const container = e.currentTarget;
    
    scrollTimeoutRef.current = window.setTimeout(() => {
      isScrollingRef.current = false;
      const itemHeight = 60;
      const idx = Math.round(container.scrollTop / itemHeight);
      
      if (idx >= 0 && idx < items.length) {
        if (items[idx] !== value) {
          onChange(items[idx]);
        }
      }
    }, 150); // Debounce until scrolling stops roughly
  };

  return (
    <div className="wheel-container">
      <div className="wheel-highlight"></div>
      <div 
        className="wheel-scrollview" 
        ref={containerRef} 
        onScroll={handleScroll}
      >
        <div className="wheel-spacer" />
        {items.map((item, i) => (
          <div key={i} className={`wheel-item ${item === value ? 'selected' : ''}`}>
            {item}
          </div>
        ))}
        <div className="wheel-spacer" />
      </div>
    </div>
  );
}
