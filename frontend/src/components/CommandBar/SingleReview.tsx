import { TrendingDown, TrendingUp } from 'lucide-react';
import type { CategoryResponse, TagResponse, WalletResponse } from '../../lib/types';
import { ExpenseCard } from './ExpenseCard';
import type { EditableExpense } from './types';

export function SingleReview({
  expense,
  onChange,
  activeWalletCurrency,
  onSave,
  saving,
  categories,
  allTags,
  wallets,
  selectedWalletId,
  onWalletChange,
  onTransferClick,
}: {
  expense: EditableExpense;
  onChange: (e: EditableExpense) => void;
  activeWalletCurrency?: string;
  onSave: () => void;
  saving: boolean;
  categories: CategoryResponse[];
  allTags: TagResponse[];
  wallets: WalletResponse[];
  selectedWalletId: string | null;
  onWalletChange: (id: string) => void;
  onTransferClick?: () => void;
}) {
  const isIncome = expense.type === 'income';
  return (
    <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <ExpenseCard expense={expense} onChange={onChange} currency={activeWalletCurrency} categories={categories} allTags={allTags} wallets={wallets} selectedWalletId={selectedWalletId} onWalletChange={onWalletChange} onTransferClick={onTransferClick} />
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', paddingTop: 4 }}>
        <button
          className="btn btn-primary btn-sm"
          onClick={onSave}
          disabled={saving}
          style={isIncome ? {
            background: 'oklch(42% 0.14 155)',
            borderColor: 'oklch(42% 0.14 155)',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
          } : { display: 'inline-flex', alignItems: 'center', gap: 5 }}
        >
          {saving && <span className="btn-spinner" />}
          {isIncome ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
          Save {isIncome ? 'income' : 'expense'}
        </button>
      </div>
      <div style={{ display: 'flex', gap: 12, fontSize: 11, color: 'var(--ink-faint)' }}>
        <span><kbd style={{ background: 'var(--cream-dark)', padding: '1px 5px', borderRadius: 4, fontFamily: 'inherit' }}>Edit text above</kbd> + Enter to re-parse</span>
        <span style={{ marginLeft: 'auto' }}><kbd style={{ background: 'var(--cream-dark)', padding: '1px 5px', borderRadius: 4, fontFamily: 'inherit' }}>Esc</kbd> to go back</span>
      </div>
    </div>
  );
}
