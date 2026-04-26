import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Bot,
  Check,
  ChevronLeft,
  ChevronRight,
  FileText,
  Image,
  LayoutDashboard,
  Mic,
  MicOff,
  Paperclip,
  Pencil,
  RefreshCw,
  Settings,
  Shuffle,
  WandSparkles,
  Tag,
  Wallet,
  X,
  Zap,
  Plus,
  Trash2,
} from 'lucide-react';
import { expenses as expensesApi, recurring as recurringApi } from '../lib/api';
import { useWallet } from '../contexts/WalletContext';
import { useToast } from './ui/Toast';
import type { AIExpenseResponse, AIParseResponse, AIRecurringResponse } from '../lib/types';
import { fmt, FREQUENCIES } from '../lib/utils';
import { DatePicker } from './ui/DatePicker';
import { Select } from './ui/Select';

interface CommandBarProps {
  open: boolean;
  onClose: () => void;
  onExpenseAdded?: () => void;
}

type Mode = 'input' | 'processing' | 'review';

interface EditableRecurring extends AIRecurringResponse {
  _editAmount: string;
  _editCategory: string;
  _editDescription: string;
  _editTags: string;
  _editFrequency: string;
  _editNextDue: string;
  _editing: boolean;
}

interface EditableExpense extends AIExpenseResponse {
  _editAmount: string;
  _editCategory: string;
  _editDescription: string;
  _editTags: string;
  _editing: boolean;
  _isNew?: boolean;
}

const NAV_ITEMS = [
  { label: 'Dashboard', path: '/', icon: LayoutDashboard, keywords: ['home', 'dashboard', 'overview'] },
  { label: 'Wallets', path: '/wallets', icon: Wallet, keywords: ['wallet', 'money', 'account'] },
  { label: 'Budgets', path: '/budgets', icon: Zap, keywords: ['budget', 'limit', 'spending'] },
  { label: 'Recurring', path: '/recurring', icon: RefreshCw, keywords: ['recurring', 'subscription', 'repeat'] },
  { label: 'Categories', path: '/categories', icon: Tag, keywords: ['category', 'categories'] },
  { label: 'Chat', path: '/chat', icon: Bot, keywords: ['chat', 'ask', 'question', 'ai'] },
  { label: 'Settings', path: '/settings', icon: Settings, keywords: ['settings', 'profile', 'api'] },
];

function looksLikeExpense(text: string): boolean {
  return /\d/.test(text) && !/^(go to|open|show|navigate|find)\s/i.test(text);
}

function makeEditable(exp: AIExpenseResponse): EditableExpense {
  return {
    ...exp,
    _editAmount: exp.amount != null ? String(exp.amount) : '',
    _editCategory: exp.category_name ?? '',
    _editDescription: exp.description ?? '',
    _editTags: exp.suggested_tags.map((t) => t.name).join(', '),
    _editing: false,
  };
}

function commitEditable(e: EditableExpense): EditableExpense {
  const newAmount = parseFloat(e._editAmount);
  const newTags = e._editTags
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
    .map((name) => ({ name, is_new: !e.suggested_tags.find((t) => t.name === name) }));
  return {
    ...e,
    amount: isNaN(newAmount) ? e.amount : newAmount,
    category_name: e._editCategory.trim() || e.category_name,
    description: e._editDescription.trim() || null,
    suggested_tags: newTags,
    _editing: false,
  };
}

function makeEditableRecurring(r: AIRecurringResponse): EditableRecurring {
  return {
    ...r,
    _editAmount: String(r.amount),
    _editCategory: r.category_name,
    _editDescription: r.description ?? '',
    _editTags: r.suggested_tags.map((t) => t.name).join(', '),
    _editFrequency: r.frequency,
    _editNextDue: r.next_due.slice(0, 10),
    _editing: false,
  };
}

function ExpenseCard({
  expense,
  onChange,
  currency,
  label,
  onRemove,
  onCancelNew,
}: {
  expense: EditableExpense;
  onChange: (e: EditableExpense) => void;
  currency?: string;
  label?: string;
  onRemove?: () => void;
  onCancelNew?: () => void;
}) {
  const amountRef = useRef<HTMLInputElement>(null);

  const startEditing = () => {
    onChange({
      ...expense,
      _editAmount: expense.amount != null ? String(expense.amount) : '',
      _editCategory: expense.category_name ?? '',
      _editDescription: expense.description ?? '',
      _editTags: expense.suggested_tags.map((t) => t.name).join(', '),
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
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-faint)', padding: 2, display: 'flex', alignItems: 'center' }}
            >
              <Trash2 size={12} />
            </button>
          )}
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
            <input
              type="text"
              value={expense._editCategory}
              onChange={(e) => onChange({ ...expense, _editCategory: e.target.value })}
              onKeyDown={(e) => { if (e.key === 'Enter') commit(); }}
              style={inputStyle}
            />
          ) : (
            <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--ink)' }}>{expense.category_name ?? 'Others'}</div>
          )}
        </div>
      </div>

      {(expense.description || expense._editing) && (
        <div>
          <div style={{ fontSize: 10, color: 'var(--ink-light)', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Description</div>
          {expense._editing ? (
            <input
              type="text"
              value={expense._editDescription}
              onChange={(e) => onChange({ ...expense, _editDescription: e.target.value })}
              onKeyDown={(e) => { if (e.key === 'Enter') commit(); }}
              placeholder="Optional"
              style={inputStyle}
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
            <input
              type="text"
              value={expense._editTags}
              onChange={(e) => onChange({ ...expense, _editTags: e.target.value })}
              onKeyDown={(e) => { if (e.key === 'Enter') commit(); }}
              placeholder="tag1, tag2"
              style={inputStyle}
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

      {expense.ai_context && !expense._editing && (
        <div style={{ fontSize: 11, color: 'var(--ink-light)', fontStyle: 'italic' }}>
          AI: {expense.ai_context}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
        {expense._editing ? (
          <>
            <button className="btn btn-secondary btn-sm" style={{ fontSize: 12, padding: '3px 10px' }} onClick={() => expense._isNew && onCancelNew ? onCancelNew() : onChange({ ...expense, _editing: false })}>Cancel</button>
            <button className="btn btn-primary btn-sm" style={{ fontSize: 12, padding: '3px 10px', display: 'inline-flex', alignItems: 'center', gap: 4 }} onClick={commit}>
              <Check size={11} /> Apply
            </button>
          </>
        ) : (
          <button className="btn btn-secondary btn-sm" style={{ fontSize: 12, padding: '3px 10px', display: 'inline-flex', alignItems: 'center', gap: 4 }} onClick={startEditing}>
            <Pencil size={11} /> Edit
          </button>
        )}
      </div>
    </div>
  );
}

function SingleReview({
  expense,
  onChange,
  activeWalletCurrency,
  onSave,
  saving,
}: {
  expense: EditableExpense;
  onChange: (e: EditableExpense) => void;
  activeWalletCurrency?: string;
  onSave: () => void;
  saving: boolean;
}) {
  return (
    <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <ExpenseCard expense={expense} onChange={onChange} currency={activeWalletCurrency} />
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', paddingTop: 4 }}>
        <button className="btn btn-primary btn-sm" onClick={onSave} disabled={saving}>
          {saving && <span className="btn-spinner" />}
          Save expense
        </button>
      </div>
      <div style={{ display: 'flex', gap: 12, fontSize: 11, color: 'var(--ink-faint)' }}>
        <span><kbd style={{ background: 'var(--cream-dark)', padding: '1px 5px', borderRadius: 4, fontFamily: 'inherit' }}>Edit text above</kbd> + Enter to re-parse</span>
        <span style={{ marginLeft: 'auto' }}><kbd style={{ background: 'var(--cream-dark)', padding: '1px 5px', borderRadius: 4, fontFamily: 'inherit' }}>Esc</kbd> to go back</span>
      </div>
    </div>
  );
}

function MultipleReview({
  expenses,
  onChange,
  activeWalletCurrency,
  onSave,
  saving,
}: {
  expenses: EditableExpense[];
  onChange: (list: EditableExpense[]) => void;
  activeWalletCurrency?: string;
  onSave: () => void;
  saving: boolean;
}) {
  const [activeIndex, setActiveIndex] = useState(0);

  const update = (i: number, e: EditableExpense) => {
    const next = [...expenses];
    next[i] = e;
    onChange(next);
  };

  const goTo = (next: number) => {
    const current = expenses[activeIndex];
    if (current._editing) {
      const next2 = [...expenses];
      next2[activeIndex] = commitEditable(current);
      onChange(next2);
    }
    setActiveIndex(next);
  };

  const addExpense = () => {
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
  };

  const removeExpense = (i: number) => {
    const next = expenses.filter((_, idx) => idx !== i);
    onChange(next);
    setActiveIndex((prev) => Math.min(prev, next.length - 1));
  };

  return (
    <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: 12, color: 'var(--ink-light)', fontWeight: 600 }}>
          {expenses.length} expenses detected — each will be saved independently
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
            <div key={i} style={{ minWidth: '100%' }}>
              <ExpenseCard
                expense={exp}
                onChange={(e) => update(i, e)}
                currency={activeWalletCurrency}
                label={`Expense ${i + 1}`}
                onCancelNew={exp._isNew ? () => removeExpense(i) : undefined}
              />
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
        <button className="btn btn-primary btn-sm" onClick={onSave} disabled={saving}>
          {saving && <span className="btn-spinner" />}
          Save all {expenses.length} expenses
        </button>
      </div>
    </div>
  );
}

function RecurringReview({
  recurring,
  onChange,
  onSave,
  saving,
}: {
  recurring: EditableRecurring;
  onChange: (r: EditableRecurring) => void;
  activeWalletCurrency?: string;
  onSave: () => void;
  saving: boolean;
}) {
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

  const fieldLabel = (text: string) => (
    <div style={{ fontSize: 10, color: 'var(--ink-light)', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{text}</div>
  );

  const startEditing = () => onChange({
    ...recurring,
    _editAmount: String(recurring.amount),
    _editCategory: recurring.category_name,
    _editDescription: recurring.description ?? '',
    _editTags: recurring.suggested_tags.map((t) => t.name).join(', '),
    _editFrequency: recurring.frequency,
    _editNextDue: recurring.next_due.slice(0, 10),
    _editing: true,
  });

  const commit = () => {
    const newAmount = parseFloat(recurring._editAmount);
    const newTags = recurring._editTags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)
      .map((name) => ({ name, is_new: !recurring.suggested_tags.find((t) => t.name === name) }));
    onChange({
      ...recurring,
      amount: isNaN(newAmount) ? recurring.amount : newAmount,
      category_name: recurring._editCategory.trim() || recurring.category_name,
      description: recurring._editDescription.trim() || '',
      frequency: recurring._editFrequency,
      next_due: recurring._editNextDue,
      suggested_tags: newTags,
      _editing: false,
    });
  };

  const freqLabel = FREQUENCIES.find((f) => f.value === recurring.frequency)?.label ?? recurring.frequency;

  return (
    <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{
        background: 'var(--cream)',
        borderRadius: 10,
        padding: '12px 14px',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        border: recurring._editing ? '1.5px solid var(--forest)' : '1.5px solid transparent',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--forest)', fontWeight: 600 }}>
          <RefreshCw size={12} />
          Recurring
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div>
            {fieldLabel('Amount')}
            {recurring._editing ? (
              <input
                type="number"
                value={recurring._editAmount}
                onChange={(e) => onChange({ ...recurring, _editAmount: e.target.value })}
                onKeyDown={(e) => { if (e.key === 'Enter') commit(); }}
                style={{ ...inputStyle, fontSize: 16, fontFamily: 'var(--font-display)' }}
                autoFocus
              />
            ) : (
              <div style={{ fontSize: 16, fontFamily: 'var(--font-display)', color: 'var(--ink)' }}>
                {recurring.amount}
              </div>
            )}
          </div>

          <div style={{
            background: recurring.is_new_category && !recurring._editing ? 'oklch(97% 0.02 145)' : 'transparent',
            borderRadius: 6,
            padding: recurring.is_new_category && !recurring._editing ? '4px 8px' : 0,
            border: recurring.is_new_category && !recurring._editing ? '1px solid oklch(82% 0.08 145)' : 'none',
          }}>
            <div style={{ fontSize: 10, color: 'var(--ink-light)', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: 4 }}>
              Category
              {recurring.is_new_category && !recurring._editing && (
                <span style={{ fontSize: 9, fontWeight: 700, color: 'oklch(48% 0.09 145)', background: 'oklch(92% 0.04 145)', borderRadius: 3, padding: '1px 4px' }}>
                  <WandSparkles size={8} style={{ display: 'inline', verticalAlign: 'middle' }} /> New
                </span>
              )}
            </div>
            {recurring._editing ? (
              <input
                type="text"
                value={recurring._editCategory}
                onChange={(e) => onChange({ ...recurring, _editCategory: e.target.value })}
                onKeyDown={(e) => { if (e.key === 'Enter') commit(); }}
                style={inputStyle}
              />
            ) : (
              <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--ink)' }}>{recurring.category_name}</div>
            )}
          </div>
        </div>

        {(recurring.description || recurring._editing) && (
          <div>
            {fieldLabel('Description')}
            {recurring._editing ? (
              <input
                type="text"
                value={recurring._editDescription}
                onChange={(e) => onChange({ ...recurring, _editDescription: e.target.value })}
                onKeyDown={(e) => { if (e.key === 'Enter') commit(); }}
                placeholder="Optional"
                style={inputStyle}
              />
            ) : (
              <div style={{ fontSize: 13, color: 'var(--ink)' }}>{recurring.description}</div>
            )}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div>
            {fieldLabel('Frequency')}
            {recurring._editing ? (
              <Select
                value={recurring._editFrequency}
                onChange={(v) => onChange({ ...recurring, _editFrequency: v })}
                options={FREQUENCIES}
              />
            ) : (
              <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--ink)' }}>{freqLabel}</div>
            )}
          </div>

          <div>
            {fieldLabel('Next due')}
            {recurring._editing ? (
              <DatePicker
                value={recurring._editNextDue}
                onChange={(v) => onChange({ ...recurring, _editNextDue: v })}
              />
            ) : (
              <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--ink)' }}>{recurring.next_due.slice(0, 10)}</div>
            )}
          </div>
        </div>

        {(recurring.suggested_tags.length > 0 || recurring._editing) && (
          <div>
            {fieldLabel('Tags')}
            {recurring._editing ? (
              <input
                type="text"
                value={recurring._editTags}
                onChange={(e) => onChange({ ...recurring, _editTags: e.target.value })}
                onKeyDown={(e) => { if (e.key === 'Enter') commit(); }}
                placeholder="tag1, tag2"
                style={inputStyle}
              />
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {recurring.suggested_tags.map((t) => (
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

        {recurring.ai_context && !recurring._editing && (
          <div style={{ fontSize: 11, color: 'var(--ink-light)', fontStyle: 'italic' }}>
            AI: {recurring.ai_context}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
          {recurring._editing ? (
            <>
              <button className="btn btn-secondary btn-sm" style={{ fontSize: 12, padding: '3px 10px' }} onClick={() => onChange({ ...recurring, _editing: false })}>Cancel</button>
              <button className="btn btn-primary btn-sm" style={{ fontSize: 12, padding: '3px 10px', display: 'inline-flex', alignItems: 'center', gap: 4 }} onClick={commit}>
                <Check size={11} /> Apply
              </button>
            </>
          ) : (
            <button className="btn btn-secondary btn-sm" style={{ fontSize: 12, padding: '3px 10px', display: 'inline-flex', alignItems: 'center', gap: 4 }} onClick={startEditing}>
              <Pencil size={11} /> Edit
            </button>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', paddingTop: 4 }}>
        <button className="btn btn-primary btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }} onClick={onSave} disabled={saving}>
          {saving && <span className="btn-spinner" />}
          <RefreshCw size={13} />
          Save recurring
        </button>
      </div>
      <div style={{ display: 'flex', gap: 12, fontSize: 11, color: 'var(--ink-faint)' }}>
        <span><kbd style={{ background: 'var(--cream-dark)', padding: '1px 5px', borderRadius: 4, fontFamily: 'inherit' }}>Edit text above</kbd> + Enter to re-parse</span>
        <span style={{ marginLeft: 'auto' }}><kbd style={{ background: 'var(--cream-dark)', padding: '1px 5px', borderRadius: 4, fontFamily: 'inherit' }}>Esc</kbd> to go back</span>
      </div>
    </div>
  );
}

function GroupReview({
  parent,
  items,
  onChangeParent,
  onChangeItems,
  activeWalletCurrency,
  onSave,
  saving,
  error,
}: {
  parent: EditableExpense;
  items: EditableExpense[];
  onChangeParent: (e: EditableExpense) => void;
  onChangeItems: (list: EditableExpense[]) => void;
  activeWalletCurrency?: string;
  onSave: () => void;
  saving: boolean;
  error: string;
}) {
  const [showItems, setShowItems] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const updateItem = (i: number, e: EditableExpense) => {
    const next = [...items];
    next[i] = e;
    onChangeItems(next);
  };

  const removeItem = (i: number) => {
    const next = items.filter((_, idx) => idx !== i);
    onChangeItems(next);
    setActiveIndex((prev) => Math.min(prev, next.length - 1));
  };

  const addItem = () => {
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
  };

  const goTo = (next: number) => {
    const current = items[activeIndex];
    if (current._editing) {
      const nextItems = [...items];
      nextItems[activeIndex] = commitEditable(current);
      onChangeItems(nextItems);
    }
    setActiveIndex(next);
  };

  const committedParent = parent._editing ? commitEditable(parent) : parent;
  const committedItems = items.map((e) => e._editing ? commitEditable(e) : e);
  const itemsSum = committedItems.reduce((s, e) => s + (e.amount ?? 0), 0);
  const parentTotal = committedParent.amount ?? 0;
  const sumMismatch = Math.abs(itemsSum - parentTotal) > 0.001;

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
        <ExpenseCard expense={parent} onChange={onChangeParent} currency={activeWalletCurrency} label="Group total" />
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
                <div key={i} style={{ minWidth: '100%' }}>
                  <ExpenseCard
                    expense={item}
                    onChange={(e) => updateItem(i, e)}
                    currency={activeWalletCurrency}
                    label={`Item ${i + 1}`}
                    onRemove={items.length > 1 ? () => removeItem(i) : undefined}
                    onCancelNew={item._isNew ? () => removeItem(i) : undefined}
                  />
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
        <button className="btn btn-primary btn-sm" onClick={onSave} disabled={saving || sumMismatch}>
          {saving && <span className="btn-spinner" />}
          Save group
        </button>
      </div>
    </div>
  );
}

export function CommandBar({ open, onClose, onExpenseAdded }: CommandBarProps) {
  const [text, setText] = useState('');
  const [mode, setMode] = useState<Mode>('input');
  const [parseResult, setParseResult] = useState<AIParseResponse | null>(null);
  const [transcript, setTranscript] = useState('');
  const [imageEnlarged, setImageEnlarged] = useState(false);

  const [singleExpense, setSingleExpense] = useState<EditableExpense | null>(null);
  const [multiExpenses, setMultiExpenses] = useState<EditableExpense[]>([]);
  const [groupParent, setGroupParent] = useState<EditableExpense | null>(null);
  const [groupItems, setGroupItems] = useState<EditableExpense[]>([]);
  const [recurringExpense, setRecurringExpense] = useState<EditableRecurring | null>(null);

  const [error, setError] = useState('');
  const [selectedNavIndex, setSelectedNavIndex] = useState(0);
  const [recording, setRecording] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [dragging, setDragging] = useState(false);
  const dragCounterRef = useRef(0);

  const dropZoneRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { activeWallet } = useWallet();
  const navigate = useNavigate();
  const toast = useToast();

  const reset = useCallback(() => {
    setText('');
    setMode('input');
    setParseResult(null);
    setTranscript('');
    setSelectedNavIndex(0);
    setSingleExpense(null);
    setMultiExpenses([]);
    setGroupParent(null);
    setGroupItems([]);
    setRecurringExpense(null);
    setError('');
    setImageFile(null);
    setImagePreview(null);
    setImageEnlarged(false);
    setSaving(false);
  }, []);

  useEffect(() => {
    if (open) {
      reset();
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open, reset]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (mode === 'review') { setMode('input'); return; }
        onClose();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose, mode]);

  const applyParseResult = (result: AIParseResponse) => {
    setParseResult(result);
    if (result.result_type === 'single') {
      setSingleExpense(makeEditable(result.expenses[0]));
    } else if (result.result_type === 'multiple') {
      setMultiExpenses(result.expenses.map(makeEditable));
    } else if (result.result_type === 'recurring') {
      if (result.recurring) setRecurringExpense(makeEditableRecurring(result.recurring));
    } else {
      setGroupParent(result.group ? makeEditable(result.group) : null);
      setGroupItems(result.expenses.map(makeEditable));
    }
    setMode('review');
  };

  const navSuggestions = text.trim()
    ? NAV_ITEMS.filter(
      (item) =>
        item.label.toLowerCase().includes(text.toLowerCase()) ||
        item.keywords.some((k) => k.includes(text.toLowerCase())),
    )
    : NAV_ITEMS.slice(0, 4);

  const handleSubmit = async () => {
    if (!text.trim() && !imageFile) return;
    if (!activeWallet) { setError('No wallet selected'); return; }

    if (!imageFile && !looksLikeExpense(text)) {
      const match = navSuggestions[0];
      if (match) { navigate(match.path); onClose(); return; }
    }

    setMode('processing');
    setError('');
    try {
      const result = await expensesApi.aiParse(activeWallet.id, text || undefined, imageFile || undefined);
      applyParseResult(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to parse expense');
      setMode('input');
    }
  };

  const handleSaveSingle = async () => {
    if (!singleExpense || !activeWallet) return;
    setSaving(true);
    try {
      const exp = singleExpense._editing ? commitEditable(singleExpense) : singleExpense;
      await expensesApi.create(activeWallet.id, {
        category_name: exp.category_name ?? 'Others',
        category_icon: exp.suggested_icon ?? undefined,
        amount: exp.amount ?? 0,
        type: exp.type ?? 'expense',
        description: exp.description ?? undefined,
        date: exp.date ?? undefined,
        tag_names: exp.suggested_tags.map((t) => t.name),
        ai_context: exp.ai_context ?? undefined,
      });
      toast('Transaction saved!', 'success');
      onExpenseAdded?.();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveMultiple = async () => {
    if (!activeWallet) return;
    setSaving(true);
    try {
      const committed = multiExpenses.map((e) => e._editing ? commitEditable(e) : e);
      await Promise.all(committed.map((exp) =>
        expensesApi.create(activeWallet.id, {
          category_name: exp.category_name ?? 'Others',
          category_icon: exp.suggested_icon ?? undefined,
          amount: exp.amount ?? 0,
          type: exp.type ?? 'expense',
          description: exp.description ?? undefined,
          date: exp.date ?? undefined,
          tag_names: exp.suggested_tags.map((t) => t.name),
          ai_context: exp.ai_context ?? undefined,
        }),
      ));
      toast(`${committed.length} transactions saved!`, 'success');
      onExpenseAdded?.();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveRecurring = async () => {
    if (!recurringExpense || !activeWallet) return;
    setSaving(true);
    try {
      const tags = recurringExpense._editTags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
      await recurringApi.create(activeWallet.id, {
        category_name: recurringExpense._editCategory.trim() || recurringExpense.category_name,
        category_icon: recurringExpense.suggested_icon ?? undefined,
        amount: parseFloat(recurringExpense._editAmount) || recurringExpense.amount,
        type: recurringExpense.type,
        description: recurringExpense._editDescription.trim() || undefined,
        frequency: recurringExpense._editFrequency,
        next_due: new Date(recurringExpense._editNextDue).toISOString(),
        tag_names: tags,
      });
      toast('Recurring transaction saved!', 'success');
      onExpenseAdded?.();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveGroup = async () => {
    if (!groupParent || !activeWallet) return;
    const parent = groupParent._editing ? commitEditable(groupParent) : groupParent;
    const items = groupItems.map((e) => e._editing ? commitEditable(e) : e);

    const itemsSum = items.reduce((s, e) => s + (e.amount ?? 0), 0);
    if (Math.abs(itemsSum - (parent.amount ?? 0)) > 0.001) {
      setError(`Items sum (${itemsSum.toFixed(2)}) must equal group total (${(parent.amount ?? 0).toFixed(2)})`);
      return;
    }

    setSaving(true);
    try {
      await expensesApi.createGroup(activeWallet.id, {
        group: {
          category_name: parent.category_name ?? 'Others',
          category_icon: parent.suggested_icon ?? undefined,
          amount: parent.amount ?? 0,
          description: parent.description ?? undefined,
          date: parent.date ?? undefined,
          tag_names: parent.suggested_tags.map((t) => t.name),
          tag_ids: [],
        },
        items: items.map((e) => ({
          category_name: e.category_name ?? 'Others',
          category_icon: e.suggested_icon ?? undefined,
          amount: e.amount ?? 0,
          description: e.description ?? undefined,
          tag_names: e.suggested_tags.map((t) => t.name),
          tag_ids: [],
        })),
      });
      toast('Group transaction saved!', 'success');
      onExpenseAdded?.();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleDragEnter = useCallback((e: DragEvent) => {
    e.preventDefault();
    dragCounterRef.current += 1;
    if (dragCounterRef.current === 1) setDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    dragCounterRef.current -= 1;
    if (dragCounterRef.current === 0) setDragging(false);
  }, []);

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
  }, []);

  const handleDrop = useCallback((e: DragEvent) => {
    e.preventDefault();
    dragCounterRef.current = 0;
    setDragging(false);
    const file = e.dataTransfer?.files?.[0];
    if (!file) return;
    setImageFile(file);
    if (file.type.startsWith('image/')) {
      setImagePreview(URL.createObjectURL(file));
    } else {
      setImagePreview(null);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const el = dropZoneRef.current;
    if (!el) return;
    el.addEventListener('dragenter', handleDragEnter);
    el.addEventListener('dragleave', handleDragLeave);
    el.addEventListener('dragover', handleDragOver);
    el.addEventListener('drop', handleDrop);
    return () => {
      el.removeEventListener('dragenter', handleDragEnter);
      el.removeEventListener('dragleave', handleDragLeave);
      el.removeEventListener('dragover', handleDragOver);
      el.removeEventListener('drop', handleDrop);
    };
  }, [open, handleDragEnter, handleDragLeave, handleDragOver, handleDrop]);

  const handleImagePaste = useCallback((e: ClipboardEvent) => {
    if (!open) return;
    const item = Array.from(e.clipboardData?.items ?? []).find((i) => i.type.startsWith('image/'));
    if (!item) return;
    const file = item.getAsFile();
    if (!file) return;
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  }, [open]);

  useEffect(() => {
    document.addEventListener('paste', handleImagePaste);
    return () => document.removeEventListener('paste', handleImagePaste);
  }, [handleImagePaste]);

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    if (file.type.startsWith('image/')) {
      setImagePreview(URL.createObjectURL(file));
    } else {
      setImagePreview(null);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (e) => chunksRef.current.push(e.data);
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        if (!activeWallet) return;
        setMode('processing');
        try {
          const result = await expensesApi.voiceParse(activeWallet.id, blob);
          setTranscript(result.transcript);
          setText(result.transcript);
          applyParseResult(result);
        } catch (e) {
          setError(e instanceof Error ? e.message : 'Voice processing failed');
          setMode('input');
        }
      };
      mr.start();
      mediaRef.current = mr;
      setRecording(true);
    } catch {
      setError('Microphone access denied');
    }
  };

  const stopRecording = () => {
    mediaRef.current?.stop();
    setRecording(false);
  };

  if (!open) return null;

  const resultType = parseResult?.result_type;

  return (
    <>
      {imageEnlarged && imagePreview && createPortal(
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 3000,
            background: 'oklch(18% 0.02 80 / 0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
            backdropFilter: 'blur(4px)',
          }}
          onClick={() => setImageEnlarged(false)}
        >
          <img
            src={imagePreview}
            alt="Receipt enlarged"
            style={{
              maxWidth: '90vw',
              maxHeight: '85vh',
              objectFit: 'contain',
              borderRadius: 12,
              boxShadow: '0 32px 80px oklch(18% 0.02 80 / 0.4)',
            }}
            onClick={(e) => e.stopPropagation()}
          />
          <button
            onClick={() => setImageEnlarged(false)}
            style={{
              position: 'absolute',
              top: 16,
              right: 16,
              background: 'oklch(18% 0.02 80 / 0.6)',
              border: 'none',
              borderRadius: '50%',
              width: 36,
              height: 36,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              color: 'white',
            }}
          >
            <X size={18} />
          </button>
        </div>,
        document.body
      )}
      <div
        ref={dropZoneRef}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'oklch(18% 0.02 80 / 0.45)',
          zIndex: 2000,
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'center',
          padding: 'clamp(60px, 12vh, 140px) 16px 16px',
          backdropFilter: 'blur(3px)',
          animation: 'fadeIn 0.15s ease both',
        }}
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      >
        <div
          style={{
            width: '100%',
            maxWidth: resultType === 'group' || resultType === 'multiple' ? 680 : 580,
            background: 'white',
            borderRadius: 20,
            boxShadow: '0 24px 80px oklch(18% 0.02 80 / 0.22), 0 4px 16px oklch(18% 0.02 80 / 0.1)',
            overflow: 'hidden',
            animation: 'scaleIn 0.2s cubic-bezier(0.16, 1, 0.3, 1) both',
            position: 'relative',
          }}
        >
          {dragging && (
            <div style={{
              position: 'absolute',
              inset: 0,
              zIndex: 10,
              borderRadius: 20,
              border: '2.5px dashed var(--forest)',
              background: '#F9F5EC',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
              pointerEvents: 'none',
            }}>
              <Image size={28} style={{ color: 'var(--forest)' }} />
              <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink)', fontFamily: 'var(--font-body)' }}>Drop file to attach</span>
              <span style={{ fontSize: 12, color: 'var(--ink-light)' }}>Image or PDF</span>
            </div>
          )}

          {/* Header bar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderBottom: '1px solid var(--cream-darker)' }}>
            {mode === 'processing' ? (
              <div style={{ width: 20, height: 20, border: '2px solid var(--forest)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.6s linear infinite', flexShrink: 0 }} />
            ) : (
              <Zap size={18} style={{ color: 'var(--forest)', flexShrink: 0 }} />
            )}

            <input
              ref={inputRef}
              value={text}
              onChange={(e) => { setText(e.target.value); setSelectedNavIndex(0); }}
              onKeyDown={(e) => {
                if (mode === 'input' && (navSuggestions.length > 0 || text.trim())) {
                  const isExpense = text.trim() && looksLikeExpense(text);
                  if (!isExpense) {
                    const totalItems = navSuggestions.length + (text.trim() ? 1 : 0);
                    if (e.key === 'ArrowDown') {
                      e.preventDefault();
                      setSelectedNavIndex((i) => Math.min(i + 1, totalItems - 1));
                      return;
                    }
                    if (e.key === 'ArrowUp') {
                      e.preventDefault();
                      setSelectedNavIndex((i) => Math.max(i - 1, 0));
                      return;
                    }
                  }
                }
                if (e.key === 'Enter') {
                  if (mode === 'input') {
                    if (text.trim() && !looksLikeExpense(text)) {
                      const isAddTx = selectedNavIndex === navSuggestions.length;
                      if (isAddTx) { handleSubmit(); return; }
                      const item = navSuggestions[selectedNavIndex];
                      if (item) { navigate(item.path); onClose(); return; }
                    }
                    handleSubmit();
                  } else if (mode === 'review') handleSubmit();
                }
              }}
              placeholder={
                mode === 'processing' ? 'Processing…' :
                  mode === 'review' ? 'Edit text and press Enter to re-parse…' :
                    'Type a transaction or navigate… (e.g. "coffee 4.50" or "salary 5000")'
              }
              disabled={mode === 'processing'}
              style={{
                flex: 1,
                border: 'none',
                outline: 'none',
                fontSize: 15,
                fontFamily: 'var(--font-body)',
                color: mode === 'review' ? 'var(--ink-mid)' : 'var(--ink)',
                background: 'transparent',
              }}
            />

            <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
              <button className="icon-btn" onClick={() => fileInputRef.current?.click()} title="Attach image or PDF">
                <Paperclip size={16} />
              </button>
              <input ref={fileInputRef} type="file" accept="image/*,application/pdf" style={{ display: 'none' }} onChange={handleImageSelect} />

              {text.trim() || imageFile ? (
                <button
                  className="icon-btn"
                  onClick={mode === 'input' ? handleSubmit : handleSubmit}
                  title="Send"
                  style={{ color: 'var(--ink)', background: 'var(--cream)' }}
                >
                  <ArrowRight size={16} />
                </button>
              ) : (
                <button
                  className="icon-btn"
                  onClick={recording ? stopRecording : startRecording}
                  title={recording ? 'Stop recording' : 'Record voice'}
                  style={recording ? { color: 'var(--rose)', background: 'var(--rose-light)' } : {}}
                >
                  {recording ? <MicOff size={16} /> : <Mic size={16} />}
                </button>
              )}
            </div>
          </div>

          {/* File preview */}
          {imageFile && (
            <div style={{ padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 8, background: 'var(--cream)' }}>
              {imagePreview ? (
                <img
                  src={imagePreview}
                  alt="Receipt"
                  onClick={() => setImageEnlarged(true)}
                  style={{ height: 48, width: 48, objectFit: 'cover', borderRadius: 6, cursor: 'zoom-in' }}
                />
              ) : (
                <div style={{ height: 48, width: 48, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--cream-darker)', borderRadius: 6, flexShrink: 0 }}>
                  <FileText size={22} style={{ color: 'var(--ink-mid)' }} />
                </div>
              )}
              <span style={{ fontSize: 13, color: 'var(--ink-mid)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {imageFile.name}
              </span>
              <button className="icon-btn" onClick={() => { setImageFile(null); setImagePreview(null); }} style={{ marginLeft: 'auto', flexShrink: 0 }}>
                <X size={14} />
              </button>
            </div>
          )}

          {/* Transcript badge */}
          {transcript && mode === 'review' && (
            <div style={{ padding: '6px 16px', background: 'oklch(96% 0.04 155)', borderBottom: '1px solid oklch(88% 0.06 155)', fontSize: 12, color: 'var(--forest)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Mic size={12} />
              <span style={{ fontStyle: 'italic' }}>{transcript}</span>
            </div>
          )}

          {/* Error */}
          {error && (
            <div style={{ padding: '8px 16px', background: 'var(--rose-light)', color: 'var(--rose)', fontSize: 13 }}>
              {error}
            </div>
          )}

          {/* Review: single */}
          {mode === 'review' && resultType === 'single' && singleExpense && (
            <SingleReview
              expense={singleExpense}
              onChange={setSingleExpense}
              activeWalletCurrency={activeWallet?.currency}
              onSave={handleSaveSingle}
              saving={saving}
            />
          )}

          {/* Review: multiple */}
          {mode === 'review' && resultType === 'multiple' && (
            <MultipleReview
              expenses={multiExpenses}
              onChange={setMultiExpenses}
              activeWalletCurrency={activeWallet?.currency}
              onSave={handleSaveMultiple}
              saving={saving}
            />
          )}

          {/* Review: recurring */}
          {mode === 'review' && resultType === 'recurring' && recurringExpense && (
            <RecurringReview
              recurring={recurringExpense}
              onChange={setRecurringExpense}
              activeWalletCurrency={activeWallet?.currency}
              onSave={handleSaveRecurring}
              saving={saving}
            />
          )}

          {/* Review: group */}
          {mode === 'review' && resultType === 'group' && groupParent && (
            <GroupReview
              parent={groupParent}
              items={groupItems}
              onChangeParent={setGroupParent}
              onChangeItems={setGroupItems}
              activeWalletCurrency={activeWallet?.currency}
              onSave={handleSaveGroup}
              saving={saving}
              error={error}
            />
          )}

          {/* Navigation suggestions */}
          {mode === 'input' && (
            <div style={{ padding: '6px 8px 8px' }}>
              {text.trim() && looksLikeExpense(text) ? (
                <button
                  onClick={handleSubmit}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '10px 12px',
                    borderRadius: 10,
                    background: 'var(--forest)',
                    color: 'var(--cream)',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: 14,
                    fontFamily: 'var(--font-body)',
                    fontWeight: 500,
                  }}
                >
                  <Zap size={16} />
                  <span>Parse "{text}" as transaction</span>
                  <ArrowRight size={14} style={{ marginLeft: 'auto' }} />
                </button>
              ) : (
                <>
                  {navSuggestions.length > 0 && (
                    <div style={{ padding: '4px 8px 2px', fontSize: 11, color: 'var(--ink-faint)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      {text ? 'Navigate to' : 'Quick navigation'}
                    </div>
                  )}
                  {navSuggestions.map((item, i) => (
                    <button
                      key={item.path}
                      onClick={() => { navigate(item.path); onClose(); }}
                      onMouseEnter={() => setSelectedNavIndex(i)}
                      style={{
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: '8px 12px',
                        borderRadius: 8,
                        background: selectedNavIndex === i ? 'var(--cream)' : 'none',
                        border: 'none',
                        cursor: 'pointer',
                        fontSize: 14,
                        fontFamily: 'var(--font-body)',
                        color: 'var(--ink-mid)',
                        textAlign: 'left',
                        transition: 'background 0.1s',
                      }}
                    >
                      <item.icon size={15} style={{ color: 'var(--ink-faint)', flexShrink: 0 }} />
                      {item.label}
                      <ArrowRight size={12} style={{ marginLeft: 'auto', color: 'var(--ink-faint)' }} />
                    </button>
                  ))}
                  {text.trim() && (
                    <button
                      onClick={handleSubmit}
                      onMouseEnter={() => setSelectedNavIndex(navSuggestions.length)}
                      style={{
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: '8px 12px',
                        borderRadius: 8,
                        background: selectedNavIndex === navSuggestions.length ? 'var(--cream)' : 'none',
                        border: 'none',
                        cursor: 'pointer',
                        fontSize: 14,
                        fontFamily: 'var(--font-body)',
                        color: 'var(--forest)',
                        textAlign: 'left',
                      }}
                    >
                      <Zap size={15} style={{ flexShrink: 0 }} />
                      Add as transaction
                    </button>
                  )}
                </>
              )}
            </div>
          )}

        </div>
      </div>
    </>
  );
}