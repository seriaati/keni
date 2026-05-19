import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Search, X } from 'lucide-react';
import type { TagResponse } from '../../lib/types';

export function TagMultiSelect({
  value,
  onChange,
  allTags,
}: {
  value: string;
  onChange: (v: string) => void;
  allTags: TagResponse[];
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [dropPos, setDropPos] = useState<{ top: number; left: number; width: number; openUp: boolean } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selected = value.split(',').map((t) => t.trim()).filter(Boolean);
  const trimmed = query.trim();
  const filtered = allTags.filter(
    (t) => !selected.includes(t.name) && (!trimmed || t.name.toLowerCase().includes(trimmed.toLowerCase())),
  );
  const exactMatch = allTags.some((t) => t.name.toLowerCase() === trimmed.toLowerCase())
    || selected.some((n) => n.toLowerCase() === trimmed.toLowerCase());
  const showCreate = trimmed.length > 0 && !exactMatch;

  const addTag = (name: string) => { onChange([...selected, name].join(', ')); setQuery(''); };
  const removeTag = (name: string) => onChange(selected.filter((t) => t !== name).join(', '));

  const measure = useCallback(() => {
    if (!triggerRef.current) return;
    const r = triggerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - r.bottom;
    const openUp = spaceBelow < 220 && r.top > spaceBelow;
    setDropPos({
      top: openUp ? r.top + window.scrollY - 4 : r.bottom + window.scrollY + 4,
      left: r.left + window.scrollX,
      width: Math.max(r.width, 180),
      openUp,
    });
  }, []);

  useLayoutEffect(() => { if (open) measure(); }, [open, measure]);
  useEffect(() => {
    if (!open) { setQuery(''); return; }
    setTimeout(() => searchRef.current?.focus(), 0);
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!triggerRef.current?.contains(e.target as Node) && !dropdownRef.current?.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (showCreate) { addTag(trimmed); }
      else if (filtered[0]) { addTag(filtered[0].name); }
    }
    if (e.key === 'Escape') setOpen(false);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      {selected.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {selected.map((name) => (
            <span key={name} style={{
              display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11, fontWeight: 500,
              color: 'var(--ink-mid)', background: 'var(--cream-dark)', border: '1px solid var(--sand)',
              borderRadius: 5, padding: '2px 4px 2px 7px',
            }}>
              {name}
              <button
                type="button"
                onMouseDown={(e) => { e.preventDefault(); removeTag(name); }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', color: 'var(--ink-faint)' }}
              >
                <X size={10} />
              </button>
            </span>
          ))}
        </div>
      )}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 5, width: 'fit-content',
          padding: '3px 8px', borderRadius: 5, fontSize: 12, fontFamily: 'var(--font-body)',
          background: 'white', border: '1px solid var(--sand)', color: 'var(--ink-light)', cursor: 'pointer',
        }}
      >
        <Plus size={11} />
        Add tag
      </button>
      {open && dropPos && createPortal(
        <div
          ref={dropdownRef}
          style={{
            position: 'absolute',
            top: dropPos.openUp ? undefined : dropPos.top,
            bottom: dropPos.openUp ? window.innerHeight + window.scrollY - dropPos.top : undefined,
            left: dropPos.left,
            width: dropPos.width,
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 10px', borderBottom: '1px solid var(--cream-dark)' }}>
            <Search size={12} style={{ color: 'var(--ink-faint)', flexShrink: 0 }} />
            <input
              ref={searchRef}
              style={{ flex: 1, border: 'none', outline: 'none', fontSize: 13, fontFamily: 'var(--font-body)', color: 'var(--ink)', background: 'transparent' }}
              placeholder="Search or create tag…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
            />
          </div>
          <ul style={{ listStyle: 'none', padding: 4, maxHeight: 180, overflowY: 'auto', margin: 0 }}>
            {filtered.length === 0 && !showCreate && (
              <li style={{ padding: '10px', fontSize: 13, color: 'var(--ink-faint)', textAlign: 'center' }}>
                {trimmed ? 'No match' : 'No tags yet'}
              </li>
            )}
            {filtered.map((tag) => (
              <li
                key={tag.id}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 'calc(var(--radius) - 4px)', fontSize: 13, cursor: 'pointer' }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--cream-dark)'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                onMouseDown={(e) => { e.preventDefault(); addTag(tag.name); }}
              >
                {tag.color && <span style={{ width: 8, height: 8, borderRadius: '50%', background: tag.color, flexShrink: 0 }} />}
                <span style={{ color: 'var(--ink)' }}>{tag.name}</span>
              </li>
            ))}
            {showCreate && (
              <li
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 'calc(var(--radius) - 4px)', fontSize: 13, cursor: 'pointer', color: 'var(--forest)', fontWeight: 500 }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--cream-dark)'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                onMouseDown={(e) => { e.preventDefault(); addTag(trimmed); setOpen(false); }}
              >
                <Plus size={13} style={{ flexShrink: 0 }} />
                Create &ldquo;{trimmed}&rdquo;
              </li>
            )}
          </ul>
        </div>,
        document.body,
      )}
    </div>
  );
}
