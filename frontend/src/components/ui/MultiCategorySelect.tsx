import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Search, X } from 'lucide-react';
import type { CategoryResponse } from '../../lib/types';
import { CategoryIcon } from '../../lib/categoryIcons';

interface MultiCategorySelectProps {
  value: string[];
  categories: CategoryResponse[];
  onChange: (ids: string[]) => void;
  placeholder?: string;
}

const DROPDOWN_MAX_H = 300;
const DROPDOWN_MARGIN = 4;

interface DropdownPos {
  top: number;
  left: number;
  width: number;
  openUp: boolean;
}

export function MultiCategorySelect({
  value,
  categories,
  onChange,
  placeholder = 'All categories',
}: MultiCategorySelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [pos, setPos] = useState<DropdownPos | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const selectedSet = new Set(value);
  const selectedCategories = categories.filter((c) => selectedSet.has(c.id));

  const trimmed = query.trim();
  const filtered = trimmed
    ? categories.filter((c) => c.name.toLowerCase().includes(trimmed.toLowerCase()))
    : categories;

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

  useLayoutEffect(() => { if (open) measure(); }, [open]);

  useEffect(() => {
    if (!open) { setQuery(''); setFocusedIndex(0); return; }
    setTimeout(() => searchRef.current?.focus(), 0);
  }, [open]);

  useEffect(() => { setFocusedIndex(0); }, [query]);

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
        !dropdownRef.current?.contains(e.target as Node)
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

  const toggle = (id: string) => {
    onChange(selectedSet.has(id) ? value.filter((v) => v !== id) : [...value, id]);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setFocusedIndex((i) => Math.min(i + 1, filtered.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setFocusedIndex((i) => Math.max(i - 1, 0));
        break;
      case 'Enter': {
        e.preventDefault();
        const cat = filtered[focusedIndex];
        if (cat) toggle(cat.id);
        break;
      }
      case 'Escape':
        setOpen(false);
        break;
    }
  };

  const dropdown = open && pos ? createPortal(
    <div
      ref={dropdownRef}
      style={{
        position: 'absolute',
        top: pos.openUp ? undefined : pos.top,
        bottom: pos.openUp ? window.innerHeight + window.scrollY - pos.top : undefined,
        left: pos.left,
        width: Math.max(pos.width, 220),
        zIndex: 9999,
        background: 'white',
        border: '1.5px solid var(--sand)',
        borderRadius: 'var(--radius)',
        boxShadow: 'var(--shadow-lg)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        animation: 'ssDropIn 0.12s cubic-bezier(0.16, 1, 0.3, 1) both',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderBottom: '1px solid var(--cream-dark)' }}>
        <Search size={13} style={{ color: 'var(--ink-faint)', flexShrink: 0 }} />
        <input
          ref={searchRef}
          style={{ flex: 1, border: 'none', outline: 'none', fontSize: 13, fontFamily: 'var(--font-body)', color: 'var(--ink)', background: 'transparent' }}
          placeholder="Search categories…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        {value.length > 0 && (
          <button
            type="button"
            onMouseDown={(e) => { e.preventDefault(); onChange([]); }}
            style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--ink-faint)', fontSize: 12, padding: 0, flexShrink: 0 }}
          >
            Clear
          </button>
        )}
      </div>
      <ul ref={listRef} style={{ listStyle: 'none', padding: 4, maxHeight: 240, overflowY: 'auto', margin: 0 }}>
        {filtered.length === 0 && (
          <li style={{ padding: '10px', fontSize: 13, color: 'var(--ink-faint)', textAlign: 'center' }}>No results</li>
        )}
        {filtered.map((cat, i) => {
          const isSelected = selectedSet.has(cat.id);
          return (
            <li
              key={cat.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '7px 10px',
                borderRadius: 'calc(var(--radius) - 4px)',
                fontSize: 13,
                cursor: 'pointer',
                background: i === focusedIndex ? 'var(--cream-dark)' : 'transparent',
                transition: 'background 0.1s',
              }}
              onMouseEnter={() => setFocusedIndex(i)}
              onMouseDown={(e) => { e.preventDefault(); toggle(cat.id); }}
            >
              <CategoryIcon iconName={cat.icon} color={cat.color} size={11} containerSize={22} borderRadius={5} fallbackLetter={cat.name[0]} />
              <span style={{ flex: 1, color: isSelected ? 'var(--forest)' : 'var(--ink)' }}>{cat.name}</span>
              {isSelected && <Check size={13} style={{ color: 'var(--forest)', flexShrink: 0 }} />}
            </li>
          );
        })}
      </ul>
    </div>,
    document.body,
  ) : null;

  return (
    <div style={{ position: 'relative' }}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          minWidth: 180,
          maxWidth: '100%',
          padding: '9px 12px',
          borderRadius: 'var(--radius)',
          fontSize: 14,
          fontFamily: 'var(--font-body)',
          fontWeight: 500,
          background: 'white',
          border: '1.5px solid var(--sand)',
          color: selectedCategories.length ? 'var(--ink)' : 'var(--ink-faint)',
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        {selectedCategories.length === 0 ? (
          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{placeholder}</span>
        ) : (
          <span style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 4, overflow: 'hidden' }}>
            {selectedCategories.slice(0, 2).map((cat) => (
              <span
                key={cat.id}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0, maxWidth: 120 }}
              >
                <CategoryIcon iconName={cat.icon} color={cat.color} size={10} containerSize={18} borderRadius={4} fallbackLetter={cat.name[0]} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cat.name}</span>
              </span>
            ))}
            {selectedCategories.length > 2 && (
              <span style={{ flexShrink: 0, color: 'var(--ink-faint)', fontSize: 13 }}>+{selectedCategories.length - 2}</span>
            )}
          </span>
        )}
        {value.length > 0 ? (
          <span
            role="button"
            tabIndex={-1}
            onClick={(e) => { e.stopPropagation(); onChange([]); }}
            style={{ display: 'inline-flex', alignItems: 'center', color: 'var(--ink-faint)', flexShrink: 0 }}
          >
            <X size={14} />
          </span>
        ) : (
          <ChevronDown size={14} style={{ color: 'var(--ink-faint)', flexShrink: 0 }} />
        )}
      </button>
      {dropdown}
    </div>
  );
}
