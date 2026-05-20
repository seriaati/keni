import { memo, useRef } from 'react';
import { ArrowLeftRight, Pencil, TrendingDown, TrendingUp, Trash2, WandSparkles, Wallet } from 'lucide-react';
import type { CategoryResponse, TagResponse, WalletResponse } from '../../lib/types';
import { fmt, fmtDate } from '../../lib/utils';
import { DatePicker } from '../ui/DatePicker';
import { Select } from '../ui/Select';
import { CategorySelect } from '../ui/CategorySelect';
import { TagMultiSelect } from './TagMultiSelect';
import { commitEditable } from './utils';
import type { EditableExpense } from './types';

export const ExpenseCard = memo(function ExpenseCard({
  expense,
  onChange,
  currency,
  label,
  onRemove,
  onCancelNew,
  onCancel,
  showInlineSave,
  categories,
  allTags,
  wallets,
  selectedWalletId,
  onWalletChange,
  onTransferClick,
}: {
  expense: EditableExpense;
  onChange: (e: EditableExpense) => void;
  currency?: string;
  label?: string;
  onRemove?: () => void;
  onCancelNew?: () => void;
  onCancel?: () => void;
  showInlineSave?: boolean;
  categories: CategoryResponse[];
  allTags: TagResponse[];
  wallets?: WalletResponse[];
  selectedWalletId?: string | null;
  onWalletChange?: (id: string) => void;
  onTransferClick?: () => void;
}) {
  const amountRef = useRef<HTMLInputElement>(null);

  const startEditing = () => {
    onChange({
      ...expense,
      _editAmount: expense.amount != null ? String(expense.amount) : '',
      _editCategory: expense.category_name ?? '',
      _editDescription: expense.description ?? '',
      _editTags: expense.suggested_tags.map((t) => t.name).join(', '),
      _editDate: expense.date ? expense.date.slice(0, 10) : new Date().toISOString().slice(0, 10),
      _editing: true,
    });
    setTimeout(() => amountRef.current?.focus(), 50);
  };

  const commit = () => onChange(commitEditable(expense));

  const inputStyle: React.CSSProperties = {
    width: '100%',
    fontSize: 13,
    color: 'var(--ink)',
    background: 'white',
    border: '1px solid var(--sand)',
    borderRadius: 6,
    padding: '3px 7px',
    outline: 'none',
    fontFamily: 'var(--font-body)',
  };

  return (
    <div style={{
      background: 'var(--cream)',
      borderRadius: 10,
      padding: '12px 14px',
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
      border: expense._editing ? '1.5px solid var(--forest)' : '1.5px solid transparent',
    }}>
      {(label || onRemove) && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          {label && <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink-faint)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{label}</div>}
          {onRemove && (
            <button
              type="button"
              onClick={onRemove}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-faint)', padding: 2, display: 'flex', alignItems: 'center', marginLeft: 'auto' }}
            >
              <Trash2 size={12} />
            </button>
          )}
        </div>
      )}

      {expense._editing && (
        <div>
          <div style={{ fontSize: 10, color: 'var(--ink-light)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Type</div>
          <div className="tabs" style={{ display: 'inline-flex' }}>
            <button
              type="button"
              className={`tab ${expense.type === 'expense' ? 'tab-active' : ''}`}
              onClick={() => onChange({ ...expense, type: 'expense' })}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
            >
              <TrendingDown size={12} /> Expense
            </button>
            <button
              type="button"
              className={`tab ${expense.type === 'income' ? 'tab-active' : ''}`}
              onClick={() => onChange({ ...expense, type: 'income' })}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
            >
              <TrendingUp size={12} /> Income
            </button>
            {onTransferClick && (
              <button
                type="button"
                className="tab"
                onClick={onTransferClick}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
              >
                <ArrowLeftRight size={12} /> Transfer
              </button>
            )}
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <div>
          <div style={{ fontSize: 10, color: 'var(--ink-light)', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Amount</div>
          {expense._editing ? (
            <input
              ref={amountRef}
              type="number"
              value={expense._editAmount}
              onChange={(e) => onChange({ ...expense, _editAmount: e.target.value })}
              onKeyDown={(e) => { if (e.key === 'Enter') commit(); }}
              style={{ ...inputStyle, fontSize: 16, fontFamily: 'var(--font-display)' }}
            />
          ) : (
            <div style={{ fontSize: 16, fontFamily: 'var(--font-display)', color: 'var(--ink)' }}>
              {expense.amount != null ? fmt(expense.amount, currency ?? expense.currency ?? 'USD') : '—'}
            </div>
          )}
        </div>

        <div style={{
          background: expense.is_new_category && !expense._editing ? 'oklch(97% 0.02 145)' : 'transparent',
          borderRadius: 6,
          padding: expense.is_new_category && !expense._editing ? '4px 8px' : 0,
          border: expense.is_new_category && !expense._editing ? '1px solid oklch(82% 0.08 145)' : 'none',
        }}>
          <div style={{ fontSize: 10, color: 'var(--ink-light)', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: 4 }}>
            Category
            {expense.is_new_category && !expense._editing && (
              <span style={{ fontSize: 9, fontWeight: 700, color: 'oklch(48% 0.09 145)', background: 'oklch(92% 0.04 145)', borderRadius: 3, padding: '1px 4px' }}>
                <WandSparkles size={8} style={{ display: 'inline', verticalAlign: 'middle' }} /> New
              </span>
            )}
          </div>
          {expense._editing ? (
            <CategorySelect
              value={expense._editCategory}
              categories={categories}
              matchBy="name"
              size="sm"
              onSelect={(cat) => onChange({ ...expense, _editCategory: cat.name })}
              onCreate={(name) => onChange({ ...expense, _editCategory: name })}
            />
          ) : (
            <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--ink)' }}>{expense.category_name ?? 'Others'}</div>
          )}
        </div>
      </div>

      <div>
        <div style={{ fontSize: 10, color: 'var(--ink-light)', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Date</div>
        {expense._editing ? (
          <DatePicker
            value={expense._editDate}
            onChange={(v) => onChange({ ...expense, _editDate: v })}
          />
        ) : (
          <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)' }}>
            {expense._editDate ? fmtDate(expense._editDate) : '—'}
          </div>
        )}
      </div>

      {(expense.description || expense._editing) && (
        <div>
          <div style={{ fontSize: 10, color: 'var(--ink-light)', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Description</div>
          {expense._editing ? (
            <textarea
              value={expense._editDescription}
              onChange={(e) => onChange({ ...expense, _editDescription: e.target.value })}
              placeholder="Optional"
              rows={3}
              style={{ ...inputStyle, resize: 'vertical' }}
            />
          ) : (
            <div style={{ fontSize: 13, color: 'var(--ink)' }}>{expense.description}</div>
          )}
        </div>
      )}

      {(expense.suggested_tags.length > 0 || expense._editing) && (
        <div>
          <div style={{ fontSize: 10, color: 'var(--ink-light)', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Tags</div>
          {expense._editing ? (
            <TagMultiSelect
              value={expense._editTags}
              onChange={(v) => onChange({ ...expense, _editTags: v })}
              allTags={allTags}
            />
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {expense.suggested_tags.map((t) => (
                t.is_new ? (
                  <span key={t.name} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11, fontWeight: 500, color: 'oklch(48% 0.09 145)', background: 'oklch(92% 0.04 145)', border: '1px solid oklch(82% 0.08 145)', borderRadius: 5, padding: '2px 6px' }}>
                    <WandSparkles size={9} /> {t.name}
                  </span>
                ) : (
                  <span key={t.name} className="chip" style={{ fontSize: 11, padding: '2px 6px' }}>{t.name}</span>
                )
              ))}
            </div>
          )}
        </div>
      )}

      {wallets && wallets.length > 1 && selectedWalletId != null && onWalletChange && (
        <div>
          <div style={{ fontSize: 10, color: 'var(--ink-light)', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: 4 }}>
            <Wallet size={10} /> Wallet
          </div>
          <Select
            value={selectedWalletId}
            onChange={onWalletChange}
            options={wallets.map((w) => ({ value: w.id, label: `${w.name} (${w.currency})` }))}
          />
        </div>
      )}

      {expense.ai_context && !expense._editing && (
        <div style={{ fontSize: 11, color: 'var(--ink-light)', fontStyle: 'italic' }}>
          AI: {expense.ai_context}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
        {expense._editing ? (
          <>
            <button
              className="btn btn-secondary btn-sm"
              style={{ fontSize: 12, padding: '3px 10px' }}
              onClick={() => {
                if (onCancel) { onCancel(); return; }
                if (expense._isNew && onCancelNew) { onCancelNew(); return; }
                onChange({ ...expense, _editing: false });
              }}
            >
              Cancel
            </button>
            {showInlineSave && (
              <button
                className="btn btn-primary btn-sm"
                style={{ fontSize: 12, padding: '3px 10px' }}
                onClick={commit}
              >
                Save
              </button>
            )}
          </>
        ) : (
          <button className="btn btn-secondary btn-sm" style={{ fontSize: 12, padding: '3px 10px', display: 'inline-flex', alignItems: 'center', gap: 4 }} onClick={startEditing}>
            <Pencil size={11} /> Edit
          </button>
        )}
      </div>
    </div>
  );
});
