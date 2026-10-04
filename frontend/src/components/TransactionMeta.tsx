import { useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Layers } from 'lucide-react';
import type { TagBrief } from '../lib/types';

// Minimum width kept for an ellipsized category before falling back to date only.
const MIN_CATEGORY_WIDTH = 32;
const GAP = 5;
const MAX_TAGS = 2;

type Level = { items: 'full' | 'short' | 'none'; tags: number };

// Ordered richest → sparsest. The last level may truncate the category.
const LEVELS: Level[] = [
  { items: 'full', tags: MAX_TAGS },
  { items: 'short', tags: MAX_TAGS },
  { items: 'short', tags: 1 },
  { items: 'short', tags: 0 },
  { items: 'none', tags: 0 },
];
const DATE_ONLY = LEVELS.length;

// Single-line meta row for transaction lists. Measures each part in a hidden copy and
// drops detail (items label → tags → count → category) until it fits on one line.
export function TransactionMeta({ category, categoryName, itemCount, tags = [], date }: {
  category: ReactNode;
  categoryName: string;
  itemCount: number;
  tags?: TagBrief[];
  date?: string;
}) {
  const { t } = useTranslation();
  const rowRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const [level, setLevel] = useState(0);
  const itemsLabel = t('dashboard.itemsCount', { count: itemCount });
  const tagKey = tags.map((tag) => tag.name).join('\u0000');

  useLayoutEffect(() => {
    const row = rowRef.current;
    const measure = measureRef.current;
    if (!row || !measure) return;
    const update = () => {
      const w: Record<string, number> = {};
      measure.querySelectorAll<HTMLElement>('[data-k]').forEach((el) => { w[el.dataset.k!] = el.offsetWidth; });
      const avail = row.clientWidth;
      const widthOf = (lvl: Level, cat: number) => {
        const segments = [cat];
        if (itemCount > 0 && lvl.items !== 'none') segments.push(w[`items-${lvl.items}`]);
        const shown = Math.min(lvl.tags, tags.length);
        if (shown > 0) {
          const parts = Array.from({ length: shown }, (_, i) => w[`tag-${i}`]);
          if (tags.length > shown) parts.push(w[`more-${shown}`]);
          segments.push(parts.reduce((a, b) => a + b, 0) + GAP * (parts.length - 1));
        }
        if (date) segments.push(w.date);
        return segments.reduce((a, b) => a + b, 0) + (segments.length - 1) * (GAP * 2 + w.sep);
      };
      let next = LEVELS.findIndex((lvl, i) =>
        widthOf(lvl, i === LEVELS.length - 1 ? Math.min(w.cat, MIN_CATEGORY_WIDTH) : w.cat) <= avail,
      );
      if (next === -1) next = date ? DATE_ONLY : LEVELS.length - 1;
      setLevel(next);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(row);
    ro.observe(measure);
    return () => ro.disconnect();
  }, [itemCount, categoryName, itemsLabel, tagKey, tags.length, date]);

  const current = LEVELS[level];
  const shownTags = current ? tags.slice(0, Math.min(current.tags, MAX_TAGS)) : [];
  const chip = (tag: TagBrief, k?: string) => (
    <span key={tag.id} data-k={k} className="chip" style={{ fontSize: 11, padding: '1px 6px', flexShrink: 0 }}>{tag.name}</span>
  );
  const items = (label: ReactNode, k?: string) => (
    <span data-k={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, flexShrink: 0 }}>
      <Layers size={11} />
      {label}
    </span>
  );
  const sep = <span style={{ flexShrink: 0 }}>·</span>;

  return (
    <div
      ref={rowRef}
      style={{ position: 'relative', fontSize: 12, color: 'var(--ink-faint)', display: 'flex', gap: GAP, alignItems: 'center', whiteSpace: 'nowrap', overflow: 'hidden' }}
    >
      <div
        ref={measureRef}
        aria-hidden
        style={{ position: 'absolute', top: 0, left: 0, visibility: 'hidden', pointerEvents: 'none', display: 'flex', alignItems: 'center' }}
      >
        <span data-k="cat">{categoryName}</span>
        <span data-k="sep">·</span>
        {items(itemsLabel, 'items-full')}
        {items(itemCount, 'items-short')}
        {tags.slice(0, MAX_TAGS).map((tag, i) => chip(tag, `tag-${i}`))}
        {[1, 2].map((n) => <span key={n} data-k={`more-${n}`}>+{tags.length - n}</span>)}
        {date && <span data-k="date">{date}</span>}
      </div>
      {current && (
        <>
          <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{category}</span>
          {itemCount > 0 && current.items !== 'none' && (
            <>{sep}{items(current.items === 'full' ? itemsLabel : itemCount)}</>
          )}
          {shownTags.length > 0 && (
            <>
              {sep}
              {shownTags.map((tag) => chip(tag))}
              {tags.length > shownTags.length && <span style={{ flexShrink: 0 }}>+{tags.length - shownTags.length}</span>}
            </>
          )}
          {date && sep}
        </>
      )}
      {date && <span style={{ flexShrink: 0 }}>{date}</span>}
    </div>
  );
}
