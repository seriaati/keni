import { useCallback, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import type { CategoryResponse, TagResponse, WalletResponse } from '../../lib/types';
import { ExpenseCard } from './ExpenseCard';
import { makeEditable, commitEditable } from './utils';
import type { EditableExpense } from './types';

export function MultipleReview({
  expenses,
  onChange,
  activeWalletCurrency,
  onSave,
  saving,
  categories,
  allTags,
  wallets,
  selectedWalletId,
  onWalletChange,
}: {
  expenses: EditableExpense[];
  onChange: (list: EditableExpense[]) => void;
  activeWalletCurrency?: string;
  onSave: () => void;
  saving: boolean;
  categories: CategoryResponse[];
  allTags: TagResponse[];
  wallets: WalletResponse[];
  selectedWalletId: string | null;
  onWalletChange: (id: string) => void;
}) {
  const [activeIndex, setActiveIndex] = useState(0);

  const update = useCallback((i: number, e: EditableExpense) => {
    onChange(expenses.map((ex, idx) => idx === i ? e : ex));
  }, [expenses, onChange]);

  const goTo = useCallback((next: number) => {
    const current = expenses[activeIndex];
    if (current._editing) {
      onChange(expenses.map((ex, idx) => idx === activeIndex ? commitEditable(current) : ex));
    }
    setActiveIndex(next);
  }, [expenses, activeIndex, onChange]);

  const addExpense = useCallback(() => {
    const ref = expenses[0];
    const newExpense = makeEditable({
      amount: 0,
      currency: ref?.currency ?? null,
      category_name: null,
      is_new_category: false,
      description: null,
      date: ref?.date ?? null,
      ai_context: null,
      suggested_tags: [],
      suggested_icon: null,
      type: 'expense',
    });
    newExpense._editing = true;
    newExpense._isNew = true;
    const newList = [...expenses, newExpense];
    onChange(newList);
    setActiveIndex(newList.length - 1);
  }, [expenses, onChange]);

  const removeExpense = useCallback((i: number) => {
    const next = expenses.filter((_, idx) => idx !== i);
    onChange(next);
    setActiveIndex((prev) => Math.min(prev, next.length - 1));
  }, [expenses, onChange]);

  const incomeCount = expenses.filter((e) => e.type === 'income').length;
  const expenseCount = expenses.filter((e) => e.type === 'expense').length;
  const mixedLabel = incomeCount > 0 && expenseCount > 0
    ? `${incomeCount} income, ${expenseCount} expense`
    : incomeCount > 0
      ? `${incomeCount} income`
      : `${expenseCount} expense`;

  return (
    <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: 12, color: 'var(--ink-light)', fontWeight: 600 }}>
          {mixedLabel} {expenses.length === 1 ? 'entry' : 'entries'} detected — each saved independently
        </div>
        <button
          className="btn btn-secondary btn-sm"
          style={{ fontSize: 11, padding: '3px 8px', display: 'inline-flex', alignItems: 'center', gap: 4 }}
          onClick={addExpense}
        >
          <Plus size={11} /> Add transaction
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
          {expenses.map((exp, i) => (
            <div key={exp._id} style={{ minWidth: '100%' }}>
              {Math.abs(i - activeIndex) <= 1 && (
                <ExpenseCard
                  expense={exp}
                  onChange={(e) => update(i, e)}
                  currency={activeWalletCurrency}
                  label={`Expense ${i + 1}`}
                  onCancelNew={exp._isNew ? () => removeExpense(i) : undefined}
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
          {activeIndex + 1} / {expenses.length}
        </span>
        <button
          className="btn btn-secondary btn-sm"
          style={{ padding: '4px 10px' }}
          onClick={() => goTo(activeIndex + 1)}
          disabled={activeIndex === expenses.length - 1}
        >
          <ChevronRight size={15} />
        </button>
      </div>

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', paddingTop: 4 }}>
        <button className="btn btn-primary btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }} onClick={onSave} disabled={saving}>
          {saving && <span className="btn-spinner" />}
          Save all {expenses.length} transactions
        </button>
      </div>
    </div>
  );
}
