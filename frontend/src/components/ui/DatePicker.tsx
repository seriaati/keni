import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react';
import './DatePicker.css';

interface DatePickerProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  id?: string;
}

interface PopupPos {
  top: number;
  left: number;
  openUp: boolean;
}

const POPUP_HEIGHT = 300;
const POPUP_WIDTH = 272;
const POPUP_MARGIN = 4;

const DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function parseLocal(dateStr: string): Date | null {
  if (!dateStr) return null;
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

function toLocalISO(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatDisplay(dateStr: string): string {
  const d = parseLocal(dateStr);
  if (!d) return '';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfWeek(year: number, month: number): number {
  return new Date(year, month, 1).getDay();
}

export function DatePicker({ value, onChange, disabled = false, id }: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<PopupPos | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);

  const today = new Date();
  const selected = parseLocal(value);

  const [viewYear, setViewYear] = useState(selected?.getFullYear() ?? today.getFullYear());
  const [viewMonth, setViewMonth] = useState(selected?.getMonth() ?? today.getMonth());

  const measure = () => {
    if (!triggerRef.current) return;
    const r = triggerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - r.bottom;
    const spaceAbove = r.top;
    const openUp = spaceBelow < POPUP_HEIGHT + POPUP_MARGIN && spaceAbove > spaceBelow;
    // Clamp horizontally so the popup never extends past the viewport edge
    const maxLeft = window.innerWidth - POPUP_WIDTH - POPUP_MARGIN;
    const left = Math.max(POPUP_MARGIN, Math.min(r.left, maxLeft)) + window.scrollX;
    setPos({
      top: openUp ? r.top + window.scrollY - POPUP_MARGIN : r.bottom + window.scrollY + POPUP_MARGIN,
      left,
      openUp,
    });
  };

  useLayoutEffect(() => {
    if (open) {
      measure();
      if (selected) {
        setViewYear(selected.getFullYear());
        setViewMonth(selected.getMonth());
      }
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (
        !triggerRef.current?.contains(e.target as Node) &&
        !popupRef.current?.contains(e.target as Node)
      ) setOpen(false);
    };
    const reposition = () => measure();
    document.addEventListener('mousedown', close);
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    return () => {
      document.removeEventListener('mousedown', close);
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
    };
  }, [open]);

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear((y) => y - 1); }
    else setViewMonth((m) => m - 1);
  };

  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear((y) => y + 1); }
    else setViewMonth((m) => m + 1);
  };

  const selectDay = (day: number) => {
    onChange(toLocalISO(new Date(viewYear, viewMonth, day)));
    setOpen(false);
  };

  const daysInMonth = getDaysInMonth(viewYear, viewMonth);
  const firstDay = getFirstDayOfWeek(viewYear, viewMonth);
  const cells: (number | null)[] = [...Array(firstDay).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  while (cells.length % 7 !== 0) cells.push(null);

  const isToday = (day: number) =>
    day === today.getDate() && viewMonth === today.getMonth() && viewYear === today.getFullYear();

  const isSelected = (day: number) =>
    selected !== null &&
    day === selected.getDate() &&
    viewMonth === selected.getMonth() &&
    viewYear === selected.getFullYear();

  const popup = open && pos ? createPortal(
    <div
      ref={popupRef}
      className={`dp-popup${pos.openUp ? ' dp-popup-up' : ''}`}
      style={{
        position: 'absolute',
        top: pos.openUp ? undefined : pos.top,
        bottom: pos.openUp ? window.innerHeight + window.scrollY - pos.top : undefined,
        left: pos.left,
        zIndex: 9999,
      }}
    >
      <div className="dp-header">
        <button type="button" className="dp-nav-btn" onClick={prevMonth}>
          <ChevronLeft size={14} />
        </button>
        <span className="dp-month-label">{MONTHS[viewMonth]} {viewYear}</span>
        <button type="button" className="dp-nav-btn" onClick={nextMonth}>
          <ChevronRight size={14} />
        </button>
      </div>

      <div className="dp-grid">
        {DAYS.map((d) => (
          <div key={d} className="dp-day-name">{d}</div>
        ))}
        {cells.map((day, i) => (
          <div key={i} className="dp-cell-wrap">
            {day !== null ? (
              <button
                type="button"
                className={`dp-day${isSelected(day) ? ' dp-day-selected' : ''}${isToday(day) && !isSelected(day) ? ' dp-day-today' : ''}`}
                onClick={() => selectDay(day)}
              >
                {day}
              </button>
            ) : (
              <span />
            )}
          </div>
        ))}
      </div>

      <div className="dp-footer">
        <button
          type="button"
          className="dp-today-btn"
          onClick={() => {
            onChange(toLocalISO(today));
            setViewYear(today.getFullYear());
            setViewMonth(today.getMonth());
            setOpen(false);
          }}
        >
          Today
        </button>
      </div>
    </div>,
    document.body,
  ) : null;

  return (
    <div className={`dp-root${open ? ' dp-open' : ''}${disabled ? ' dp-disabled' : ''}`}>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        className="dp-trigger"
        onClick={() => !disabled && setOpen((v) => !v)}
        disabled={disabled}
      >
        <span className={value ? 'dp-value' : 'dp-placeholder'}>
          {value ? formatDisplay(value) : 'Pick a date'}
        </span>
        <CalendarDays size={14} className="dp-icon" />
      </button>
      {popup}
    </div>
  );
}
