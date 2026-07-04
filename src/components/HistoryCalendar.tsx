import { useMemo, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { cn } from '@/lib/utils';
import type { Message } from '@/types';

/**
 * Month-grid view of the transfer history (第二阶段: 日历视图). Days with
 * records show a count badge; clicking a day filters the record list below
 * (clicking it again clears the filter). Pure date math, no dependency.
 */

/** Local-timezone day key, e.g. "2026-07-04". */
export function dayKeyOf(epochMs: number): string {
  const d = new Date(epochMs);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

interface HistoryCalendarProps {
  records: Message[];
  selectedDay: string | null;
  onSelectDay: (day: string | null) => void;
}

export function HistoryCalendar({
  records,
  selectedDay,
  onSelectDay,
}: HistoryCalendarProps) {
  const [monthStart, setMonthStart] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const countsByDay = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of records) {
      const key = dayKeyOf(r.createdAt);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }, [records]);

  const year = monthStart.getFullYear();
  const month = monthStart.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const leadingBlanks = monthStart.getDay();
  const monthLabel = monthStart.toLocaleString([], { month: 'long', year: 'numeric' });
  const todayKey = dayKeyOf(Date.now());

  const shiftMonth = (delta: number) =>
    setMonthStart(new Date(year, month + delta, 1));

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <button
          onClick={() => shiftMonth(-1)}
          className="rounded-lg px-2 py-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
          aria-label="Previous month"
        >
          ‹
        </button>
        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          {monthLabel}
        </p>
        <button
          onClick={() => shiftMonth(1)}
          className="rounded-lg px-2 py-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
          aria-label="Next month"
        >
          ›
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center">
        {WEEKDAYS.map((wd) => (
          <span key={wd} className="text-[10px] font-medium uppercase text-slate-400">
            {wd}
          </span>
        ))}
        {Array.from({ length: leadingBlanks }, (_, i) => (
          <span key={`blank-${i}`} />
        ))}
        {Array.from({ length: daysInMonth }, (_, i) => {
          const day = i + 1;
          const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const count = countsByDay.get(key) ?? 0;
          const selected = selectedDay === key;
          return (
            <button
              key={key}
              onClick={() => onSelectDay(selected ? null : key)}
              aria-label={`Day ${key}${count > 0 ? `, ${count} records` : ''}`}
              className={cn(
                'relative flex h-10 flex-col items-center justify-center rounded-lg text-sm transition-colors',
                selected
                  ? 'bg-brand-600 text-white'
                  : count > 0
                    ? 'bg-brand-50 text-brand-700 hover:bg-brand-100 dark:bg-brand-900/30 dark:text-brand-300'
                    : 'text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800',
                key === todayKey && !selected && 'ring-1 ring-brand-400',
              )}
            >
              {day}
              {count > 0 && (
                <span
                  className={cn(
                    'text-[9px] leading-none',
                    selected ? 'text-brand-100' : 'text-brand-500 dark:text-brand-300',
                  )}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </Card>
  );
}
