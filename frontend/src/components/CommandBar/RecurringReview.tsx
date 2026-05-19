import { Pencil, RefreshCw, WandSparkles, Wallet } from 'lucide-react';
import type { CategoryResponse, TagResponse, WalletResponse } from '../../lib/types';
import { fmt, FREQUENCIES } from '../../lib/utils';
import { DatePicker } from '../ui/DatePicker';
import { Select } from '../ui/Select';
import { CategorySelect } from '../ui/CategorySelect';
import { TagMultiSelect } from './TagMultiSelect';
import { makeEditableRecurring, commitEditableRecurring } from './utils';
import type { EditableRecurring } from './types';

export function RecurringReview({
  recurring,
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
  recurring: EditableRecurring;
  onChange: (r: EditableRecurring) => void;
  activeWalletCurrency: string | undefined;
  onSave: () => void;
  saving: boolean;
  categories: CategoryResponse[];
  allTags: TagResponse[];
  wallets: WalletResponse[];
  selectedWalletId: string | null;
  onWalletChange: (id: string) => void;
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

  const startEditing = () => onChange({ ...makeEditableRecurring(recurring), _editing: true });

  const commit = () => onChange(commitEditableRecurring(recurring));

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
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--forest)', fontWeight: 600 }}>
            <RefreshCw size={12} />
            Recurring
          </div>
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
                {fmt(recurring.amount, activeWalletCurrency ?? 'USD')}
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
              <CategorySelect
                value={recurring._editCategory}
                categories={categories}
                matchBy="name"
                size="sm"
                onSelect={(cat) => onChange({ ...recurring, _editCategory: cat.name })}
                onCreate={(name) => onChange({ ...recurring, _editCategory: name })}
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
              <textarea
                value={recurring._editDescription}
                onChange={(e) => onChange({ ...recurring, _editDescription: e.target.value })}
                placeholder="Optional"
                rows={3}
                style={{ ...inputStyle, resize: 'vertical' }}
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
              <TagMultiSelect
                value={recurring._editTags}
                onChange={(v) => onChange({ ...recurring, _editTags: v })}
                allTags={allTags}
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

        {wallets.length > 1 && selectedWalletId && (
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

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
          {recurring._editing ? (
            <button className="btn btn-secondary btn-sm" style={{ fontSize: 12, padding: '3px 10px' }} onClick={() => onChange({ ...recurring, _editing: false })}>Cancel</button>
          ) : (
            <button className="btn btn-secondary btn-sm" style={{ fontSize: 12, padding: '3px 10px', display: 'inline-flex', alignItems: 'center', gap: 4 }} onClick={startEditing}>
              <Pencil size={11} /> Edit
            </button>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', paddingTop: 4 }}>
        <button
          className="btn btn-primary btn-sm"
          style={recurring.type === 'income' ? {
            background: 'oklch(42% 0.14 155)',
            borderColor: 'oklch(42% 0.14 155)',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
          } : { display: 'inline-flex', alignItems: 'center', gap: 5 }}
          onClick={onSave}
          disabled={saving}
        >
          {saving && <span className="btn-spinner" />}
          <RefreshCw size={13} />
          Save recurring {recurring.type === 'income' ? 'income' : 'expense'}
        </button>
      </div>
      <div style={{ display: 'flex', gap: 12, fontSize: 11, color: 'var(--ink-faint)' }}>
        <span><kbd style={{ background: 'var(--cream-dark)', padding: '1px 5px', borderRadius: 4, fontFamily: 'inherit' }}>Edit text above</kbd> + Enter to re-parse</span>
        <span style={{ marginLeft: 'auto' }}><kbd style={{ background: 'var(--cream-dark)', padding: '1px 5px', borderRadius: 4, fontFamily: 'inherit' }}>Esc</kbd> to go back</span>
      </div>
    </div>
  );
}
