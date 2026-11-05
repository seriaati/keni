import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';
import './Select.css';

export interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  id?: string;
}

interface DropdownPos {
  top: number;
  left: number;
  width: number;
  openUp: boolean;
}

const DROPDOWN_MAX_H = 240;
const DROPDOWN_MARGIN = 4;

export function Select({ value, onChange, options, placeholder = 'Select…', disabled = false, id }: SelectProps) {
  const [open, setOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const [pos, setPos] = useState<DropdownPos | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const selected = options.find((o) => o.value === value);

  const measure = () => {
    if (!triggerRef.current) return;
    const r = triggerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - r.bottom;
    const spaceAbove = r.top;
    const openUp = spaceBelow < DROPDOWN_MAX_H + DROPDOWN_MARGIN && spaceAbove > spaceBelow;
    setPos({
      top: openUp ? r.top + window.scrollY - DROPDOWN_MARGIN : r.bottom + window.scrollY + DROPDOWN_MARGIN,
      left: r.left + window.scrollX,
      width: r.width,
      openUp,
    });
  };

  useLayoutEffect(() => {
    if (open) measure();
  }, [open]);

  useEffect(() => {
    if (!open) { setFocusedIndex(-1); return; }
    const idx = options.findIndex((o) => o.value === value);
    setFocusedIndex(idx >= 0 ? idx : 0);
  }, [open]);

  useEffect(() => {
    if (!open || focusedIndex < 0) return;
    const el = listRef.current?.children[focusedIndex] as HTMLElement | undefined;
    el?.scrollIntoView({ block: 'nearest' });
  }, [focusedIndex, open]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (
        !triggerRef.current?.contains(e.target as Node) &&
        !listRef.current?.contains(e.target as Node)
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

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    switch (e.key) {
      case 'Enter':
      case ' ':
        e.preventDefault();
        if (open && focusedIndex >= 0) {
          onChange(options[focusedIndex].value);
          setOpen(false);
        } else {
          setOpen(true);
        }
        break;
      case 'ArrowDown':
        e.preventDefault();
        if (!open) { setOpen(true); break; }
        setFocusedIndex((i) => Math.min(i + 1, options.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setFocusedIndex((i) => Math.max(i - 1, 0));
        break;
      case 'Escape':
        if (open) { e.preventDefault(); e.stopPropagation(); } // a Modal around it stays open
        setOpen(false);
        break;
      case 'Tab':
        setOpen(false);
        break;
    }
  };

  const dropdown = open && pos ? createPortal(
    <ul
      ref={listRef}
      role="listbox"
      className={`select-dropdown${pos.openUp ? ' select-dropdown-up' : ''}`}
      style={{
        position: 'absolute',
        top: pos.openUp ? undefined : pos.top,
        bottom: pos.openUp ? window.innerHeight + window.scrollY - pos.top : undefined,
        left: pos.left,
        width: pos.width,
        zIndex: 9999,
      }}
    >
      {options.map((opt, i) => (
        <li
          key={opt.value}
          role="option"
          aria-selected={opt.value === value}
          className={`select-option${opt.value === value ? ' select-option-selected' : ''}${i === focusedIndex ? ' select-option-focused' : ''}`}
          onMouseEnter={() => setFocusedIndex(i)}
          onMouseDown={(e) => {
            e.preventDefault();
            onChange(opt.value);
            setOpen(false);
          }}
        >
          <span className="select-option-label">{opt.label}</span>
          {opt.value === value && <Check size={13} className="select-option-check" />}
        </li>
      ))}
    </ul>,
    document.body,
  ) : null;

  return (
    <div className={`select-root${open ? ' select-open' : ''}${disabled ? ' select-disabled' : ''}`}>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        className="select-trigger"
        onClick={() => !disabled && setOpen((v) => !v)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
      >
        <span className={selected ? 'select-value' : 'select-placeholder'}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown size={14} className="select-chevron" />
      </button>
      {dropdown}
    </div>
  );
}
