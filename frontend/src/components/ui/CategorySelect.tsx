import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Plus, Search } from 'lucide-react';
import type { CategoryResponse } from '../../lib/types';
import { CategoryIcon } from '../../lib/categoryIcons';

interface CategorySelectProps {
  value: string;
  categories: CategoryResponse[];
  onSelect: (cat: CategoryResponse) => void;
  onCreate?: (name: string) => void | Promise<void>;
  matchBy?: 'id' | 'name';
  size?: 'sm' | 'md';
}

const DROPDOWN_MAX_H = 260;
const DROPDOWN_MARGIN = 4;

interface DropdownPos {
  top: number;
  left: number;
  width: number;
  openUp: boolean;
}

export function CategorySelect({
  value,
  categories,
  onSelect,
  onCreate,
  matchBy = 'id',
  size = 'md',
}: CategorySelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [pos, setPos] = useState<DropdownPos | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const selected = categories.find((c) =>
    matchBy === 'id' ? c.id === value : c.name.toLowerCase() === value.trim().toLowerCase(),
  );

  const trimmed = query.trim();
  const filtered = trimmed
    ? categories.filter((c) => c.name.toLowerCase().includes(trimmed.toLowerCase()))
    : categories;
  const exactMatch = categories.some((c) => c.name.toLowerCase() === trimmed.toLowerCase());
  const showCreate = trimmed.length > 0 && !exactMatch && !!onCreate;
  const totalItems = filtered.length + (showCreate ? 1 : 0);

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

  const handleCreate = async () => {
    if (!trimmed || creating || !onCreate) return;
    setCreating(true);
    try {
      await onCreate(trimmed);
      setOpen(false);
      setQuery('');
    } finally {
      setCreating(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setFocusedIndex((i) => Math.min(i + 1, totalItems - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setFocusedIndex((i) => Math.max(i - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (focusedIndex < filtered.length) {
          const cat = filtered[focusedIndex];
          if (cat) { onSelect(cat); setOpen(false); }
        } else if (showCreate) {
          void handleCreate();
        }
        break;
      case 'Escape':
        setOpen(false);
        break;
    }
  };

  const isSm = size === 'sm';

  const dropdown = open && pos ? createPortal(
    <div
      ref={dropdownRef}
      style={{
        position: 'absolute',
        top: pos.openUp ? undefined : pos.top,
        bottom: pos.openUp ? window.innerHeight + window.scrollY - pos.top : undefined,
        left: pos.left,
        width: Math.max(pos.width, 200),
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
          placeholder="Search or create category…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
        />
      </div>
      <ul ref={listRef} style={{ listStyle: 'none', padding: 4, maxHeight: 200, overflowY: 'auto', margin: 0 }}>
        {filtered.length === 0 && !showCreate && (
          <li style={{ padding: '10px', fontSize: 13, color: 'var(--ink-faint)', textAlign: 'center' }}>No results</li>
        )}
        {filtered.map((cat, i) => {
          const isSelected = matchBy === 'id' ? cat.id === value : cat.name === value;
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
              onMouseDown={(e) => { e.preventDefault(); onSelect(cat); setOpen(false); }}
            >
              <CategoryIcon iconName={cat.icon} color={cat.color} size={11} containerSize={22} borderRadius={5} fallbackLetter={cat.name[0]} />
              <span style={{ flex: 1, color: isSelected ? 'var(--forest)' : 'var(--ink)' }}>{cat.name}</span>
              {isSelected && <Check size={13} style={{ color: 'var(--forest)', flexShrink: 0 }} />}
            </li>
          );
        })}
        {showCreate && (
          <li
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '7px 10px',
              borderRadius: 'calc(var(--radius) - 4px)',
              fontSize: 13,
              cursor: creating ? 'not-allowed' : 'pointer',
              background: focusedIndex === filtered.length ? 'var(--cream-dark)' : 'transparent',
              transition: 'background 0.1s',
              color: 'var(--forest)',
              fontWeight: 500,
              opacity: creating ? 0.6 : 1,
            }}
            onMouseEnter={() => setFocusedIndex(filtered.length)}
            onMouseDown={(e) => { e.preventDefault(); void handleCreate(); }}
          >
            <Plus size={13} style={{ flexShrink: 0 }} />
            <span>Create &ldquo;{trimmed}&rdquo;</span>
          </li>
        )}
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
          gap: 8,
          width: '100%',
          padding: isSm ? '5px 8px' : '6px 10px',
          borderRadius: isSm ? 6 : 'var(--radius)',
          fontSize: isSm ? 13 : 14,
          fontFamily: 'var(--font-body)',
          fontWeight: 500,
          background: 'white',
          border: isSm ? '1px solid var(--sand)' : '1.5px solid var(--sand)',
          color: value ? 'var(--ink)' : 'var(--ink-faint)',
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        {selected ? (
          <CategoryIcon iconName={selected.icon} color={selected.color} size={11} containerSize={isSm ? 20 : 22} borderRadius={isSm ? 4 : 5} fallbackLetter={selected.name[0]} />
        ) : null}
        <span style={{ flex: 1 }}>{selected ? selected.name : 'Select category…'}</span>
        <Search size={isSm ? 12 : 13} style={{ color: 'var(--ink-faint)', flexShrink: 0 }} />
      </button>
      {dropdown}
    </div>
  );
}
