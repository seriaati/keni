import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Search } from 'lucide-react';
import './SearchableSelect.css';

export interface SelectOption {
  value: string;
  label: string;
}

interface SearchableSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  disabled?: boolean;
  id?: string;
}

interface DropdownPos {
  top: number;
  left: number;
  width: number;
  openUp: boolean;
}

const DROPDOWN_MAX_H = 280;
const DROPDOWN_MARGIN = 4;

export function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = 'Select…',
  searchPlaceholder = 'Search…',
  disabled = false,
  id,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [pos, setPos] = useState<DropdownPos | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const selected = options.find((o) => o.value === value);

  const filtered = query.trim()
    ? options.filter((o) => o.label.toLowerCase().includes(query.toLowerCase()))
    : options;

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
    if (!open) {
      setQuery('');
      setFocusedIndex(0);
      return;
    }
    const idx = options.findIndex((o) => o.value === value);
    setFocusedIndex(idx >= 0 ? idx : 0);
    setTimeout(() => searchRef.current?.focus(), 0);
  }, [open]);

  useEffect(() => {
    setFocusedIndex(0);
  }, [query]);

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
        !(e.target as Node)?.isConnected
      ) return;
      const dropdown = document.querySelector('.ss-dropdown');
      if (!triggerRef.current?.contains(e.target as Node) && !dropdown?.contains(e.target as Node)) {
        setOpen(false);
      }
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

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setFocusedIndex((i) => Math.min(i + 1, filtered.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setFocusedIndex((i) => Math.max(i - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (filtered[focusedIndex]) {
          onChange(filtered[focusedIndex].value);
          setOpen(false);
        }
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

  const handleTriggerKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    switch (e.key) {
      case 'Enter':
      case ' ':
        e.preventDefault();
        setOpen((v) => !v);
        break;
      case 'ArrowDown':
        e.preventDefault();
        setOpen(true);
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

  const dropdown = open && pos
    ? createPortal(
        <div
          className={`ss-dropdown${pos.openUp ? ' ss-dropdown-up' : ''}`}
          style={{
            position: 'absolute',
            top: pos.openUp ? undefined : pos.top,
            bottom: pos.openUp ? window.innerHeight + window.scrollY - pos.top : undefined,
            left: pos.left,
            width: pos.width,
            zIndex: 9999,
          }}
        >
          <div className="ss-search-wrap">
            <Search size={13} className="ss-search-icon" />
            <input
              ref={searchRef}
              className="ss-search"
              placeholder={searchPlaceholder}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleSearchKeyDown}
            />
          </div>
          <ul ref={listRef} role="listbox" className="ss-list">
            {filtered.length === 0 ? (
              <li className="ss-empty">No results</li>
            ) : (
              filtered.map((opt, i) => (
                <li
                  key={opt.value}
                  role="option"
                  aria-selected={opt.value === value}
                  className={`ss-option${opt.value === value ? ' ss-option-selected' : ''}${i === focusedIndex ? ' ss-option-focused' : ''}`}
                  onMouseEnter={() => setFocusedIndex(i)}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    onChange(opt.value);
                    setOpen(false);
                  }}
                >
                  <span className="ss-option-label">{opt.label}</span>
                  {opt.value === value && <Check size={13} className="ss-option-check" />}
                </li>
              ))
            )}
          </ul>
        </div>,
        document.body,
      )
    : null;

  return (
    <div className={`ss-root${open ? ' ss-open' : ''}${disabled ? ' ss-disabled' : ''}`}>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        className="ss-trigger"
        onClick={() => !disabled && setOpen((v) => !v)}
        onKeyDown={handleTriggerKeyDown}
        disabled={disabled}
      >
        <span className={selected ? 'ss-value' : 'ss-placeholder'}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown size={14} className="ss-chevron" />
      </button>
      {dropdown}
    </div>
  );
}
