import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams, useSearchParams, useOutletContext } from 'react-router-dom';
import { ArrowLeftRight, Download, Filter, Layers, Search, SortAsc, SortDesc, X } from 'lucide-react';
import { expenses as expensesApi, categories as categoriesApi, wallets as walletsApi, tags as tagsApi } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../components/ui/Toast';
import { Select } from '../components/ui/Select';
import { DatePicker } from '../components/ui/DatePicker';
import type { CategoryResponse, TransactionListResponse, TransactionResponse, TagResponse, WalletSummary } from '../lib/types';
import { fmt, fmtRelative } from '../lib/utils';
import { CategoryIcon } from '../lib/categoryIcons';
import { getExchangeRate } from '../lib/fx';
import type { LayoutOutletContext } from '../components/Layout';

function useIsMobile(breakpoint = 640) {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= breakpoint);
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint}px)`);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [breakpoint]);
  return isMobile;
}

export function WalletViewPage() {
  const { t } = useTranslation();
  const { walletId } = useParams<{ walletId: string }>();
  const [searchParams] = useSearchParams();
  const toast = useToast();
  const { user } = useAuth();
  const { expenseAddedKey } = useOutletContext<LayoutOutletContext>();

  const [wallet, setWallet] = useState<WalletSummary | null>(null);
  const [fxRate, setFxRate] = useState<number | null>(null);
  const isMobile = useIsMobile();
  const [showConverted, setShowConverted] = useState(false);
  const [switching, setSwitching] = useState(false);

  const handleToggleConverted = () => {
    if (switching) return;
    setSwitching(true);
    setTimeout(() => setShowConverted((v) => !v), 112);
    setTimeout(() => setSwitching(false), 320);
  };
  const [data, setData] = useState<TransactionListResponse | null>(null);
  const [categories, setCategories] = useState<CategoryResponse[]>([]);
  const [allTags, setAllTags] = useState<TagResponse[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState(() => searchParams.get('category_id') ?? '');
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>(() => searchParams.getAll('tag_ids'));
  const [sortBy, setSortBy] = useState('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [showFilters, setShowFilters] = useState(false);
  const [startDate, setStartDate] = useState(() => searchParams.get('start_date') ?? '');
  const [endDate, setEndDate] = useState(() => searchParams.get('end_date') ?? '');
  const [minAmount, setMinAmount] = useState('');
  const [maxAmount, setMaxAmount] = useState('');

  const PAGE_SIZE = 20;

  const load = useCallback(async () => {
    if (!walletId) return;
    setLoading(true);
    try {
      const [w, cats, tagList, list] = await Promise.all([
        walletsApi.get(walletId),
        categoriesApi.list(),
        tagsApi.list(),
        expensesApi.list(walletId, {
          page,
          page_size: PAGE_SIZE,
          search: search || undefined,
          category_id: categoryId || undefined,
          tag_ids: selectedTagIds.length > 0 ? selectedTagIds : undefined,
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
      setAllTags(tagList);
      setData(list);
    } catch (e) {
      toast(e instanceof Error ? e.message : t('walletView.toastLoadFailed'), 'error');
    } finally {
      setLoading(false);
    }
  }, [walletId, page, search, categoryId, selectedTagIds, sortBy, sortOrder, startDate, endDate, minAmount, maxAmount, toast, expenseAddedKey]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const globalCurrency = user?.global_currency;
    const walletCurrency = wallet?.currency;
    if (!globalCurrency || !walletCurrency || globalCurrency === walletCurrency) {
      setFxRate(null);
      return;
    }
    getExchangeRate(walletCurrency, globalCurrency).then(setFxRate);
  }, [wallet?.currency, user?.global_currency]);

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
      toast(t('walletView.toastExportFailed'), 'error');
    }
  };

  const toggleTag = (id: string) => {
    setSelectedTagIds((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]
    );
    setPage(1);
  };

  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 0;
  const hasFilters = search || categoryId || selectedTagIds.length > 0 || startDate || endDate || minAmount || maxAmount;

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">{wallet?.name ?? t('walletView.titleFallback')}</h1>
          <p className="page-subtitle">
            {wallet ? `${fmt(wallet.balance, wallet.currency)} balance · ${fmt(wallet.total_income, wallet.currency)} income · ${fmt(wallet.total_expenses, wallet.currency)} expenses` : ''}
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
            placeholder={t('walletView.searchPlaceholder')}
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>

        <Select
          value={categoryId}
          onChange={(v) => { setCategoryId(v); setPage(1); }}
          options={[{ value: '', label: t('walletView.filterAllCategories') }, ...categories.map((c) => ({ value: c.id, label: c.name }))]}
          placeholder={t('walletView.filterAllCategories')}
        />

        <button
          className={`btn btn-secondary btn-md ${showFilters ? 'btn-active' : ''}`}
          onClick={() => setShowFilters(!showFilters)}
          style={showFilters ? { background: 'var(--cream-darker)' } : {}}
        >
          <Filter size={14} />
          {t('walletView.filterFilters')}
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
            <label className="input-label">{t('walletView.filterFromDate')}</label>
            <DatePicker value={startDate} onChange={(v) => { setStartDate(v); setPage(1); }} />
          </div>
          <div className="input-group">
            <label className="input-label">{t('walletView.filterToDate')}</label>
            <DatePicker value={endDate} onChange={(v) => { setEndDate(v); setPage(1); }} />
          </div>
          <div className="input-group">
            <label className="input-label">{t('walletView.filterMinAmount')}</label>
            <input className="input" type="number" placeholder="0" value={minAmount} onChange={(e) => { setMinAmount(e.target.value); setPage(1); }} />
          </div>
          <div className="input-group">
            <label className="input-label">{t('walletView.filterMaxAmount')}</label>
            <input className="input" type="number" placeholder="∞" value={maxAmount} onChange={(e) => { setMaxAmount(e.target.value); setPage(1); }} />
          </div>
          <div className="input-group">
            <label className="input-label">{t('walletView.filterSortBy')}</label>
            <Select
              value={sortBy}
              onChange={setSortBy}
              options={[{ value: 'date', label: t('walletView.filterSortDate') }, { value: 'amount', label: t('walletView.filterSortAmount') }]}
            />
          </div>
          {allTags.length > 0 && (
            <div className="input-group" style={{ gridColumn: '1 / -1' }}>
              <label className="input-label">{t('walletView.filterTags')}</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {allTags.map((tag) => {
                  const active = selectedTagIds.includes(tag.id);
                  return (
                    <button
                      key={tag.id}
                      onClick={() => toggleTag(tag.id)}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 5,
                        padding: '3px 10px',
                        borderRadius: 100,
                        fontSize: 12,
                        fontWeight: 500,
                        cursor: 'pointer',
                        border: `1.5px solid ${tag.color ? (active ? tag.color : `${tag.color}50`) : 'var(--cream-darker)'}`,
                        background: active ? (tag.color ?? 'var(--ink)') : (tag.color ? `${tag.color}14` : 'var(--cream-dark)'),
                        color: active ? 'white' : 'var(--ink-mid)',
                        transition: 'all 0.15s',
                      }}
                    >
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: active ? 'white' : (tag.color ?? 'var(--sand-dark)'), flexShrink: 0 }} />
                      {tag.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {hasFilters && (
            <div style={{ display: 'flex', alignItems: 'flex-end' }}>
              <button
                className="btn btn-ghost btn-md"
                onClick={() => { setSearch(''); setCategoryId(''); setSelectedTagIds([]); setStartDate(''); setEndDate(''); setMinAmount(''); setMaxAmount(''); setPage(1); }}
              >
                <X size={14} /> {t('walletView.filterClearAll')}
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
          <p className="empty-state-title">{t('walletView.noTransactionsTitle')}</p>
          <p className="empty-state-desc">
            {hasFilters ? t('walletView.noTransactionsDescFiltered') : t('walletView.noTransactionsDescEmpty')}
          </p>
        </div>
      ) : (
        <>
          {isMobile && fxRate != null && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
              <button
                className="btn btn-secondary btn-sm"
                onClick={handleToggleConverted}
                style={{ gap: 5, fontSize: 12 }}
              >
                <ArrowLeftRight size={12} />
                {showConverted ? `${user?.global_currency} (converted)` : `${wallet?.currency} (original)`}
              </button>
            </div>
          )}
          <div style={{ background: 'white', borderRadius: 14, border: '1px solid var(--cream-darker)', overflow: 'hidden' }}>
            {data.items.map((expense, i) => (
              <ExpenseRow
                key={expense.id}
                expense={expense}
                currency={wallet?.currency ?? 'USD'}
                walletId={walletId!}
                isLast={i === data.items.length - 1}
                fxRate={fxRate}
                globalCurrency={user?.global_currency ?? null}
                isMobile={isMobile}
                showConverted={showConverted}
                switching={switching}
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
                {t('walletView.paginationPrev')}
              </button>
              <span style={{ fontSize: 13, color: 'var(--ink-light)' }}>
                {t('walletView.paginationPage', { page, total: totalPages })}
              </span>
              <button
                className="btn btn-secondary btn-sm"
                disabled={page === totalPages}
                onClick={() => setPage(page + 1)}
              >
                {t('walletView.paginationNext')}
              </button>
            </div>
          )}

          <p style={{ fontSize: 12, color: 'var(--ink-faint)', textAlign: 'center', marginTop: 12 }}>
            {t('walletView.showingCount', { shown: data.items.length, total: data.total })}
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
  fxRate,
  globalCurrency,
  isMobile,
  showConverted,
  switching,
}: {
  expense: TransactionResponse;
  currency: string;
  walletId: string;
  isLast: boolean;
  fxRate: number | null;
  globalCurrency: string | null;
  isMobile: boolean;
  showConverted: boolean;
  switching: boolean;
}) {
  const convertedAmount = fxRate != null ? expense.amount * fxRate : null;
  const hasConversion = convertedAmount != null && globalCurrency != null;
  const sign = expense.type === 'income' ? '+' : '';
  const amountColor = expense.type === 'income' ? 'var(--forest)' : 'var(--ink)';

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
      <CategoryIcon
        iconName={expense.category.icon}
        color={expense.category.color}
        size={17}
        containerSize={38}
        borderRadius={10}
        fallbackLetter={expense.category.name[0]}
      />

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {expense.description ?? expense.category.name}
        </div>
        <div style={{ fontSize: 12, color: 'var(--ink-faint)', display: 'flex', gap: 6, alignItems: 'center', overflow: 'hidden', flexWrap: 'nowrap' }}>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 1, minWidth: 0 }}>
            {expense.category.name}
          </span>
          {expense.children && expense.children.length > 0 && (
            <>
              <span style={{ flexShrink: 0 }}>·</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, flexShrink: 0, whiteSpace: 'nowrap' }}>
                <Layers size={11} />
                {expense.children.length}
              </span>
            </>
          )}
          {expense.tags.length > 0 && (
            <>
              <span style={{ flexShrink: 0 }}>·</span>
              {expense.tags.slice(0, 2).map((t) => (
                <span key={t.id} className="chip" style={{ fontSize: 11, padding: '1px 6px', flexShrink: 0, whiteSpace: 'nowrap' }}>{t.name}</span>
              ))}
              {expense.tags.length > 2 && (
                <span style={{ flexShrink: 0, whiteSpace: 'nowrap' }}>+{expense.tags.length - 2}</span>
              )}
            </>
          )}
          {!isMobile && hasConversion && (
            <>
              <span style={{ flexShrink: 0 }}>·</span>
              <span style={{ flexShrink: 0, whiteSpace: 'nowrap' }}>{fmtRelative(expense.date)}</span>
            </>
          )}
        </div>
      </div>

      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        {isMobile && hasConversion ? (
          <>
            <div
              className={switching ? 'amount-switching' : ''}
              style={{ fontSize: 15, fontWeight: 600, color: amountColor }}
            >
              {sign}{showConverted ? fmt(convertedAmount!, globalCurrency!) : fmt(expense.amount, currency)}
            </div>
            <div style={{ fontSize: 12, color: 'var(--ink-faint)' }}>
              {fmtRelative(expense.date)}
            </div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 15, fontWeight: 600, color: amountColor }}>
              {sign}{fmt(expense.amount, currency)}
            </div>
            <div style={{ fontSize: 12, color: 'var(--ink-faint)' }}>
              {hasConversion
                ? <span style={{ color: 'var(--ink-mid)' }}>≈ {fmt(convertedAmount!, globalCurrency!)}</span>
                : fmtRelative(expense.date)
              }
            </div>
          </>
        )}
      </div>
    </Link>
  );
}
