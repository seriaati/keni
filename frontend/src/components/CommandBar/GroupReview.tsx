import { useCallback, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, Shuffle } from 'lucide-react';
import type { CategoryResponse, TagResponse, WalletResponse } from '../../lib/types';
import { fmt } from '../../lib/utils';
import { ExpenseCard } from './ExpenseCard';
import { makeEditable, commitEditable } from './utils';
import type { EditableExpense } from './types';

export function GroupReview({
  parent,
  items,
  onChangeParent,
  onChangeItems,
  activeWalletCurrency,
  onSave,
  saving,
  error,
  categories,
  allTags,
  wallets,
  selectedWalletId,
  onWalletChange,
}: {
  parent: EditableExpense;
  items: EditableExpense[];
  onChangeParent: (e: EditableExpense) => void;
  onChangeItems: (list: EditableExpense[]) => void;
  activeWalletCurrency?: string;
  onSave: () => void;
  saving: boolean;
  error: string;
  categories: CategoryResponse[];
  allTags: TagResponse[];
  wallets: WalletResponse[];
  selectedWalletId: string | null;
  onWalletChange: (id: string) => void;
}) {
  const [showItems, setShowItems] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const updateItem = useCallback((i: number, e: EditableExpense) => {
    onChangeItems(items.map((it, idx) => idx === i ? e : it));
  }, [items, onChangeItems]);

  const removeItem = useCallback((i: number) => {
    const next = items.filter((_, idx) => idx !== i);
    onChangeItems(next);
    setActiveIndex((prev) => Math.min(prev, next.length - 1));
  }, [items, onChangeItems]);

  const addItem = useCallback(() => {
    const newItem = makeEditable({
      amount: 0,
      currency: parent.currency,
      category_name: parent.category_name,
      is_new_category: false,
      description: null,
      date: parent.date,
      ai_context: null,
      suggested_tags: [],
      suggested_icon: null,
      type: 'expense',
    });
    newItem._editing = true;
    newItem._isNew = true;
    const newItems = [...items, newItem];
    onChangeItems(newItems);
    setActiveIndex(newItems.length - 1);
  }, [items, parent, onChangeItems]);

  const goTo = useCallback((next: number) => {
    const current = items[activeIndex];
    if (current._editing) {
      onChangeItems(items.map((it, idx) => idx === activeIndex ? commitEditable(current) : it));
    }
    setActiveIndex(next);
  }, [items, activeIndex, onChangeItems]);

  const { parentTotal, itemsSum, sumMismatch } = useMemo(() => {
    const cp = parent._editing ? commitEditable(parent) : parent;
    const total = cp.amount ?? 0;
    const sum = items.reduce((s, e) => {
      const amount = e._editing ? (parseFloat(e._editAmount) || 0) : (e.amount ?? 0);
      return s + amount;
    }, 0);
    return { parentTotal: total, itemsSum: sum, sumMismatch: Math.abs(sum - total) > 0.001 };
  }, [parent, items]);

  return (
    <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: 12, color: 'var(--ink-light)', fontWeight: 600 }}>
          {showItems ? `Sub-expenses (${items.length})` : 'Group expense — parent total'}
        </div>
        <button
          className="btn btn-ghost btn-sm"
          style={{ fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--ink-light)' }}
          onClick={() => setShowItems((v) => !v)}
        >
          <Shuffle size={12} />
          {showItems ? 'Parent' : 'Sub-expenses'}
        </button>
      </div>

      {!showItems ? (
        <ExpenseCard expense={parent} onChange={onChangeParent} currency={activeWalletCurrency} label="Group total" showInlineSave categories={categories} allTags={allTags} wallets={wallets} selectedWalletId={selectedWalletId} onWalletChange={onWalletChange} />
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{
              fontSize: 12,
              fontWeight: 600,
              color: sumMismatch ? 'var(--rose)' : 'var(--forest)',
            }}>
              {fmt(itemsSum, activeWalletCurrency ?? parent.currency ?? 'USD')} / {fmt(parentTotal, activeWalletCurrency ?? parent.currency ?? 'USD')}
            </span>
            <button
              className="btn btn-secondary btn-sm"
              style={{ fontSize: 11, padding: '3px 8px', display: 'inline-flex', alignItems: 'center', gap: 4 }}
              onClick={addItem}
            >
              <Plus size={11} /> Add item
            </button>
          </div>

          <div style={{ overflow: 'hidden' }}>
            <div
              style={{
                transform: `translateX(${-activeIndex * 100}%)`,
                transition: 'transform 0.2s ease',
                display: 'flex',
              }}
            >
              {items.map((item, i) => (
                <div key={item._id} style={{ minWidth: '100%' }}>
                  {Math.abs(i - activeIndex) <= 1 && (
                    <ExpenseCard
                      expense={item}
                      onChange={(e) => updateItem(i, e)}
                      currency={activeWalletCurrency}
                      label={`Item ${i + 1}`}
                      onRemove={items.length > 1 ? () => removeItem(i) : undefined}
                      onCancelNew={item._isNew ? () => removeItem(i) : undefined}
                      showInlineSave
                      categories={categories}
                      allTags={allTags}
                      wallets={wallets}
                      selectedWalletId={selectedWalletId}
                      onWalletChange={onWalletChange}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
            <button
              className="btn btn-secondary btn-sm"
              style={{ padding: '4px 10px' }}
              onClick={() => goTo(activeIndex - 1)}
              disabled={activeIndex === 0}
            >
              <ChevronLeft size={15} />
            </button>
            <span style={{ fontSize: 13, color: 'var(--ink-light)', fontWeight: 500, minWidth: 48, textAlign: 'center' }}>
              {activeIndex + 1} / {items.length}
            </span>
            <button
              className="btn btn-secondary btn-sm"
              style={{ padding: '4px 10px' }}
              onClick={() => goTo(activeIndex + 1)}
              disabled={activeIndex === items.length - 1}
            >
              <ChevronRight size={15} />
            </button>
          </div>
        </>
      )}

      {sumMismatch && !error && (
        <div style={{ fontSize: 12, color: 'var(--rose)', background: 'var(--rose-light)', borderRadius: 8, padding: '8px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <span>Items sum ({fmt(itemsSum, activeWalletCurrency ?? parent.currency ?? 'USD')}) must equal group total ({fmt(parentTotal, activeWalletCurrency ?? parent.currency ?? 'USD')})</span>
          <button
            className="btn btn-secondary btn-sm"
            style={{ fontSize: 11, padding: '3px 8px', whiteSpace: 'nowrap', flexShrink: 0 }}
            onClick={() => {
              const diff = Math.round((parentTotal - itemsSum) * 100) / 100;
              onChangeItems([
                ...items,
                makeEditable({
                  amount: diff,
                  currency: parent.currency,
                  category_name: 'Tax rounding',
                  is_new_category: true,
                  description: 'Rounding adjustment',
                  date: parent.date,
                  ai_context: null,
                  suggested_tags: [],
                  suggested_icon: null,
                  type: 'expense',
                }),
              ]);
              setActiveIndex(items.length);
              setShowItems(true);
            }}
          >
            Add {fmt(Math.round((parentTotal - itemsSum) * 100) / 100, activeWalletCurrency ?? parent.currency ?? 'USD')} adjustment
          </button>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', paddingTop: 4 }}>
        <button className="btn btn-primary btn-sm" onClick={onSave} disabled={saving || sumMismatch} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          {saving && <span className="btn-spinner" />}
          Save group
        </button>
      </div>
    </div>
  );
}
