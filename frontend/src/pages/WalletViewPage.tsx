import { useEffect, useState, useCallback } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Download, Filter, Search, SortAsc, SortDesc, X } from 'lucide-react';
import { expenses as expensesApi, categories as categoriesApi, wallets as walletsApi } from '../lib/api';
import { useToast } from '../components/ui/Toast';
import type { CategoryResponse, ExpenseListResponse, ExpenseResponse, WalletSummary } from '../lib/types';
import { fmt, fmtRelative } from '../lib/utils';

export function WalletViewPage() {
  const { walletId } = useParams<{ walletId: string }>();
  const toast = useToast();

  const [wallet, setWallet] = useState<WalletSummary | null>(null);
  const [data, setData] = useState<ExpenseListResponse | null>(null);
  const [categories, setCategories] = useState<CategoryResponse[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [sortBy, setSortBy] = useState('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [showFilters, setShowFilters] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [minAmount, setMinAmount] = useState('');
  const [maxAmount, setMaxAmount] = useState('');

  const PAGE_SIZE = 20;

  const load = useCallback(async () => {
    if (!walletId) return;
    setLoading(true);
    try {
      const [w, cats, list] = await Promise.all([
        walletsApi.get(walletId),
        categoriesApi.list(),
        expensesApi.list(walletId, {
          page,
          page_size: PAGE_SIZE,
          search: search || undefined,
          category_id: categoryId || undefined,
          sort_by: sortBy,
          sort_order: sortOrder,
          start_date: startDate || undefined,
          end_date: endDate || undefined,
          min_amount: minAmount ? Number(minAmount) : undefined,
          max_amount: maxAmount ? Number(maxAmount) : undefined,
        }),
      ]);
      setWallet(w);
      setCategories(cats);
      setData(list);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed to load', 'error');
    } finally {
      setLoading(false);
    }
  }, [walletId, page, search, categoryId, sortBy, sortOrder, startDate, endDate, minAmount, maxAmount, toast]);

  useEffect(() => { load(); }, [load]);

  const handleExport = async (format: 'csv' | 'json') => {
    if (!walletId) return;
    try {
      const res = await expensesApi.export(walletId, format);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `expenses.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast('Export failed', 'error');
    }
  };

  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 0;
  const hasFilters = search || categoryId || startDate || endDate || minAmount || maxAmount;

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">{wallet?.name ?? 'Wallet'}</h1>
          <p className="page-subtitle">
            {wallet ? `${fmt(wallet.total_expenses, wallet.currency)} total · ${wallet.expense_count} expenses` : ''}
          </p>
        </div>
        <div className="page-actions">
          <button className="btn btn-secondary btn-sm" onClick={() => handleExport('csv')}>
            <Download size={14} /> CSV
          </button>
          <button className="btn btn-secondary btn-sm" onClick={() => handleExport('json')}>
            <Download size={14} /> JSON
          </button>
        </div>
      </div>

      {/* Search & filter bar */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200, position: 'relative' }}>
          <Search size={15} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-faint)' }} />
          <input
            className="input"
            style={{ paddingLeft: 32 }}
            placeholder="Search expenses…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>

        <select
          className="input"
          style={{ width: 'auto', minWidth: 140 }}
          value={categoryId}
          onChange={(e) => { setCategoryId(e.target.value); setPage(1); }}
        >
          <option value="">All categories</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>

        <button
          className={`btn btn-secondary btn-md ${showFilters ? 'btn-active' : ''}`}
          onClick={() => setShowFilters(!showFilters)}
          style={showFilters ? { background: 'var(--cream-darker)' } : {}}
        >
          <Filter size={14} />
          Filters
          {hasFilters && <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--forest)', marginLeft: 2 }} />}
        </button>

        <button
          className="btn btn-secondary btn-md"
          onClick={() => setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc')}
          title="Toggle sort order"
        >
          {sortOrder === 'desc' ? <SortDesc size={14} /> : <SortAsc size={14} />}
        </button>
      </div>

      {/* Advanced filters */}
      {showFilters && (
        <div style={{
          background: 'white',
          border: '1px solid var(--cream-darker)',
          borderRadius: 12,
          padding: '16px',
          marginBottom: 16,
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: 12,
          animation: 'slideDown 0.2s ease both',
        }}>
          <div className="input-group">
            <label className="input-label">From date</label>
            <input className="input" type="date" value={startDate} onChange={(e) => { setStartDate(e.target.value); setPage(1); }} />
          </div>
          <div className="input-group">
            <label className="input-label">To date</label>
            <input className="input" type="date" value={endDate} onChange={(e) => { setEndDate(e.target.value); setPage(1); }} />
          </div>
          <div className="input-group">
            <label className="input-label">Min amount</label>
            <input className="input" type="number" placeholder="0" value={minAmount} onChange={(e) => { setMinAmount(e.target.value); setPage(1); }} />
          </div>
          <div className="input-group">
            <label className="input-label">Max amount</label>
            <input className="input" type="number" placeholder="∞" value={maxAmount} onChange={(e) => { setMaxAmount(e.target.value); setPage(1); }} />
          </div>
          <div className="input-group">
            <label className="input-label">Sort by</label>
            <select className="input" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
              <option value="date">Date</option>
              <option value="amount">Amount</option>
            </select>
          </div>
          {hasFilters && (
            <div style={{ display: 'flex', alignItems: 'flex-end' }}>
              <button
                className="btn btn-ghost btn-md"
                onClick={() => { setSearch(''); setCategoryId(''); setStartDate(''); setEndDate(''); setMinAmount(''); setMaxAmount(''); setPage(1); }}
              >
                <X size={14} /> Clear all
              </button>
            </div>
          )}
        </div>
      )}

      {/* Expense list */}
      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {[...Array(8)].map((_, i) => (
            <div key={i} className="skeleton" style={{ height: 60, borderRadius: 10 }} />
          ))}
        </div>
      ) : !data || data.items.length === 0 ? (
        <div className="empty-state">
          <p className="empty-state-title">No expenses found</p>
          <p className="empty-state-desc">
            {hasFilters ? 'Try adjusting your filters.' : 'Press ⌘K to add your first expense.'}
          </p>
        </div>
      ) : (
        <>
          <div style={{ background: 'white', borderRadius: 14, border: '1px solid var(--cream-darker)', overflow: 'hidden' }}>
            {data.items.map((expense, i) => (
              <ExpenseRow
                key={expense.id}
                expense={expense}
                currency={wallet?.currency ?? 'USD'}
                walletId={walletId!}
                isLast={i === data.items.length - 1}
              />
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 20 }}>
              <button
                className="btn btn-secondary btn-sm"
                disabled={page === 1}
                onClick={() => setPage(page - 1)}
              >
                Previous
              </button>
              <span style={{ fontSize: 13, color: 'var(--ink-light)' }}>
                Page {page} of {totalPages}
              </span>
              <button
                className="btn btn-secondary btn-sm"
                disabled={page === totalPages}
                onClick={() => setPage(page + 1)}
              >
                Next
              </button>
            </div>
          )}

          <p style={{ fontSize: 12, color: 'var(--ink-faint)', textAlign: 'center', marginTop: 12 }}>
            Showing {data.items.length} of {data.total} expenses
          </p>
        </>
      )}
    </div>
  );
}

function ExpenseRow({
  expense,
  currency,
  walletId,
  isLast,
}: {
  expense: ExpenseResponse;
  currency: string;
  walletId: string;
  isLast: boolean;
}) {
  return (
    <Link
      to={`/wallets/${walletId}/expenses/${expense.id}`}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '12px 16px',
        textDecoration: 'none',
        borderBottom: isLast ? 'none' : '1px solid var(--cream)',
        transition: 'background 0.1s',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--cream)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      <div
        style={{
          width: 38,
          height: 38,
          borderRadius: 10,
          background: expense.category.color ?? 'var(--cream-darker)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          fontSize: 16,
        }}
      >
        {expense.category.icon ? (
          <span>{expense.category.icon}</span>
        ) : (
          <span style={{ fontSize: 13, fontWeight: 700, color: 'white' }}>
            {expense.category.name[0]}
          </span>
        )}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {expense.description ?? expense.category.name}
        </div>
        <div style={{ fontSize: 12, color: 'var(--ink-faint)', display: 'flex', gap: 6, alignItems: 'center' }}>
          <span>{expense.category.name}</span>
          {expense.tags.length > 0 && (
            <>
              <span>·</span>
              {expense.tags.slice(0, 2).map((t) => (
                <span key={t.id} className="chip" style={{ fontSize: 11, padding: '1px 6px' }}>{t.name}</span>
              ))}
            </>
          )}
        </div>
      </div>

      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink)' }}>
          {fmt(expense.amount, currency)}
        </div>
        <div style={{ fontSize: 12, color: 'var(--ink-faint)' }}>
          {fmtRelative(expense.date)}
        </div>
      </div>
    </Link>
  );
}
