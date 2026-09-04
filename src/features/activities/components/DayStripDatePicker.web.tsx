'use client';

import { useEffect, useRef } from 'react';

interface DayStripDatePickerProps {
  value: Date;
  minimumDate: Date;
  onChange: (date?: Date) => void;
}

function dateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function DayStripDatePicker({ value, minimumDate, onChange }: DayStripDatePickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;

    const openPicker = () => {
      try {
        input.showPicker?.();
      } catch {
        input.focus();
      }
    };
    const frame = requestAnimationFrame(openPicker);
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <input
      ref={inputRef}
      aria-label="Anderes Datum wählen"
      type="date"
      value={dateInputValue(value)}
      min={dateInputValue(minimumDate)}
      onBlur={() => onChange()}
      onChange={(event) => {
        const next = new Date(`${event.currentTarget.value}T12:00:00`);
        onChange(Number.isNaN(next.getTime()) ? undefined : next);
      }}
      style={{ height: 1, opacity: 0, pointerEvents: 'none', position: 'absolute', width: 1 }}
    />
  );
}
