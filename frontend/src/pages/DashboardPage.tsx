import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useOutletContext } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, ArrowRight, ChevronDown, Layers, Wallet } from 'lucide-react';
import { PieChart, Pie, Sector, ResponsiveContainer, Tooltip } from 'recharts';
import { expenses as expensesApi, budgets as budgetsApi, categories as categoriesApi } from '../lib/api';
import { useWallet } from '../contexts/WalletContext';
import { useAuth } from '../contexts/AuthContext';
import type { BudgetResponse, CategoryResponse, TransactionResponse, TransactionSummary } from '../lib/types';
import { fmt, fmtRelative, startOfMonth, endOfMonth, startOfWeek, getPeriodDateRange, getPeriodLabel } from '../lib/utils';
import type { DashboardPeriod } from '../lib/utils';
import { CategoryIcon } from '../lib/categoryIcons';
import type { LayoutOutletContext } from '../components/Layout';

const FALLBACK_COLORS = [
  'var(--forest)',
  'var(--amber)',
  'var(--sky)',
  'var(--rose)',
  'oklch(62% 0.1 280)',
  'oklch(62% 0.1 180)',
  'oklch(72% 0.08 50)',
];

export function DashboardPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { activeWallet } = useWallet();
  const { expenseAddedKey } = useOutletContext<LayoutOutletContext>();
  const navigate = useNavigate();
  const [monthlySummary, setMonthlySummary] = useState<TransactionSummary | null>(null);
  const [spendingSummary, setSpendingSummary] = useState<TransactionSummary | null>(null);
  const [incomeSummary, setIncomeSummary] = useState<TransactionSummary | null>(null);
  const [weekSummary, setWeekSummary] = useState<TransactionSummary | null>(null);
  const [recent, setRecent] = useState<TransactionResponse[]>([]);
  const [budgets, setBudgets] = useState<BudgetResponse[]>([]);
  const [categories, setCategories] = useState<CategoryResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [spendingLoading, setSpendingLoading] = useState(false);
  const [incomeLoading, setIncomeLoading] = useState(false);
  const [spendingPeriod, setSpendingPeriod] = useState<DashboardPeriod>('this_month');
  const [incomePeriod, setIncomePeriod] = useState<DashboardPeriod>('this_month');
  const [spendingPeriodOpen, setSpendingPeriodOpen] = useState(false);
  const [incomePeriodOpen, setIncomePeriodOpen] = useState(false);
  const spendingPeriodRef = useRef<HTMLDivElement>(null);
  const incomePeriodRef = useRef<HTMLDivElement>(null);
  const spendingChartRef = useRef<HTMLDivElement>(null);
  const incomeChartRef = useRef<HTMLDivElement>(null);
  const [categoryExpanded, setCategoryExpanded] = useState(false);
  const [incomeCategoryExpanded, setIncomeCategoryExpanded] = useState(false);

  // Full reload: wallet change or new transaction added
  useEffect(() => {
    if (!activeWallet) return;
    setLoading(true);
    Promise.all([
      expensesApi.summary(activeWallet.id, { start_date: startOfMonth(), end_date: endOfMonth() }),
      expensesApi.summary(activeWallet.id, getPeriodDateRange(spendingPeriod)),
      expensesApi.summary(activeWallet.id, getPeriodDateRange(incomePeriod)),
      expensesApi.summary(activeWallet.id, { start_date: startOfWeek() }),
      expensesApi.list(activeWallet.id, { page: 1, page_size: 8, sort_by: 'date', sort_order: 'desc' }),
      budgetsApi.list(),
      categoriesApi.list(),
    ])
      .then(([monthSum, spendSum, incomeSum, weekSum, recentList, budgetList, categoryList]) => {
        setMonthlySummary(monthSum);
        setSpendingSummary(spendSum);
        setIncomeSummary(incomeSum);
        setWeekSummary(weekSum);
        setRecent(recentList.items);
        setBudgets(budgetList);
        setCategories(categoryList);
      })
      .catch(() => { })
      .finally(() => setLoading(false));
  }, [activeWallet, expenseAddedKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Spending chart reload on period change (skip mount)
  const spendingMountedRef = useRef(false);
  useEffect(() => {
    if (!spendingMountedRef.current) { spendingMountedRef.current = true; return; }
    if (!activeWallet) return;
    setSpendingLoading(true);
    expensesApi.summary(activeWallet.id, getPeriodDateRange(spendingPeriod))
      .then(setSpendingSummary)
      .catch(() => { })
      .finally(() => setSpendingLoading(false));
  }, [spendingPeriod]); // eslint-disable-line react-hooks/exhaustive-deps

  // Income chart reload on period change (skip mount)
  const incomeMountedRef = useRef(false);
  useEffect(() => {
    if (!incomeMountedRef.current) { incomeMountedRef.current = true; return; }
    if (!activeWallet) return;
    setIncomeLoading(true);
    expensesApi.summary(activeWallet.id, getPeriodDateRange(incomePeriod))
      .then(setIncomeSummary)
      .catch(() => { })
      .finally(() => setIncomeLoading(false));
  }, [incomePeriod]); // eslint-disable-line react-hooks/exhaustive-deps

  // Apply opacity directly to DOM to avoid React re-render interrupting CSS transition
  useEffect(() => {
    if (spendingChartRef.current) spendingChartRef.current.style.opacity = spendingLoading ? '0.4' : '1';
  }, [spendingLoading]);
  useEffect(() => {
    if (incomeChartRef.current) incomeChartRef.current.style.opacity = incomeLoading ? '0.4' : '1';
  }, [incomeLoading]);

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (spendingPeriodRef.current && !spendingPeriodRef.current.contains(e.target as Node)) setSpendingPeriodOpen(false);
      if (incomePeriodRef.current && !incomePeriodRef.current.contains(e.target as Node)) setIncomePeriodOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return t('dashboard.greetingMorning');
    if (h < 17) return t('dashboard.greetingAfternoon');
    return t('dashboard.greetingEvening');
  };

  const name = user?.display_name ?? user?.username ?? '';

  if (!activeWallet) {
    return (
      <div className="empty-state" style={{ marginTop: 60 }}>
        <Wallet size={48} className="empty-state-icon" />
        <p className="empty-state-title">{t('dashboard.noWalletTitle')}</p>
        <p className="empty-state-desc">{t('dashboard.noWalletDesc')}</p>
        <Link to="/wallets" className="btn btn-primary btn-md" style={{ marginTop: 8 }}>
          {t('dashboard.noWalletCta')}
        </Link>
      </div>
    );
  }

  const getCategoryName = (id: string | null) =>
    id ? (categories.find((c) => c.id === id)?.name ?? 'Unknown') : null;

  const goToCategory = (categoryId: string) => {
    navigate(`/wallets/${activeWallet!.id}?category_id=${categoryId}`);
  };

  const overBudget = budgets.filter((b) => b.is_over_budget);
  const nearLimit = budgets.filter((b) => !b.is_over_budget && b.percentage_used >= 80);

  return (
    <div className="animate-fade-in">
      {/* Over-budget warning banner */}
      {!loading && overBudget.length > 0 && (
        <div style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 12,
          background: 'oklch(97% 0.04 20)',
          border: '1.5px solid var(--rose-light)',
          borderLeft: '4px solid var(--rose)',
          borderRadius: 12,
          padding: '14px 16px',
          marginBottom: 24,
        }}>
          <AlertTriangle size={18} style={{ color: 'var(--rose)', flexShrink: 0, marginTop: 1 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--rose)', marginBottom: 2 }}>
              {t('dashboard.budgetExceeded', { count: overBudget.length })}
            </div>
            <div style={{ fontSize: 13, color: 'var(--ink-mid)' }}>
              {t('dashboard.budgetOverLimit', {
                names: overBudget.map((b) => getCategoryName(b.category_id) ?? t('common.overall')).join(', '),
                verb: overBudget.length === 1 ? t('dashboard.verbIs') : t('dashboard.verbAre'),
                period: overBudget[0].period,
              })}
            </div>
          </div>
          <Link to="/budgets" style={{ fontSize: 13, color: 'var(--rose)', fontWeight: 500, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4 }}>
            {t('common.review')} <ArrowRight size={13} />
          </Link>
        </div>
      )}

      {/* Near-limit warning banner */}
      {!loading && overBudget.length === 0 && nearLimit.length > 0 && (
        <div style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 12,
          background: 'oklch(97% 0.06 70)',
          border: '1.5px solid var(--amber-light)',
          borderLeft: '4px solid var(--amber)',
          borderRadius: 12,
          padding: '14px 16px',
          marginBottom: 24,
        }}>
          <AlertTriangle size={18} style={{ color: 'var(--amber)', flexShrink: 0, marginTop: 1 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'oklch(52% 0.14 65)', marginBottom: 2 }}>
              {t('dashboard.budgetNear', { count: nearLimit.length })}
            </div>
            <div style={{ fontSize: 13, color: 'var(--ink-mid)' }}>
              {t('dashboard.budgetNearLimit', {
                names: nearLimit.map((b) => getCategoryName(b.category_id) ?? t('common.overall')).join(', '),
                verb: nearLimit.length === 1 ? t('dashboard.verbIs') : t('dashboard.verbAre'),
              })}
            </div>
          </div>
          <Link to="/budgets" style={{ fontSize: 13, color: 'oklch(52% 0.14 65)', fontWeight: 500, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4 }}>
            {t('common.review')} <ArrowRight size={13} />
          </Link>
        </div>
      )}

      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(26px, 4vw, 36px)', color: 'var(--ink)', fontStyle: 'italic' }}>
          {greeting()}{name ? `, ${name}` : ''}.
        </h1>
        <p style={{ fontSize: 14, color: 'var(--ink-light)', marginTop: 4 }}>
          {t('dashboard.overviewSubtitle', { month: new Date().toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) })}
        </p>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 32 }}>
        <SummaryCard
          label={t('dashboard.cardThisMonth')}
          value={loading ? null : fmt(monthlySummary?.total_amount ?? 0, activeWallet.currency)}
          sub={t('dashboard.transactionsCount', { count: monthlySummary?.expense_count ?? 0 })}
          accent="var(--forest)"
          loading={loading}
        />
        <SummaryCard
          label={t('dashboard.cardThisWeek')}
          value={loading ? null : fmt(weekSummary?.total_amount ?? 0, activeWallet.currency)}
          sub={t('dashboard.transactionsCount', { count: weekSummary?.expense_count ?? 0 })}
          accent="var(--amber)"
          loading={loading}
        />
        <SummaryCard
          label={t('dashboard.cardDailyAvg')}
          value={loading ? null : fmt(
            monthlySummary ? monthlySummary.total_amount / Math.max(new Date().getDate(), 1) : 0,
            activeWallet.currency,
          )}
          sub={t('dashboard.cardThisMonthSub')}
          accent="var(--sky)"
          loading={loading}
        />
      </div>

      {/* Budget overview */}
      {(loading || budgets.length > 0) && (
        <div style={{ marginBottom: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink)' }}>{t('dashboard.budgetsTitle')}</h2>
            <Link to="/budgets" style={{ fontSize: 13, color: 'var(--forest)', display: 'flex', alignItems: 'center', gap: 4 }}>
              {t('dashboard.budgetsManage')} <ArrowRight size={13} />
            </Link>
          </div>
          {loading ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
              {[...Array(3)].map((_, i) => (
                <div key={i} className="skeleton" style={{ height: 80, borderRadius: 12 }} />
              ))}
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
              {budgets.map((b) => {
                const pct = Math.min(b.percentage_used, 100);
                const isWarning = b.percentage_used >= 80 && !b.is_over_budget;
                const barColor = b.is_over_budget ? 'var(--rose)' : isWarning ? 'var(--amber)' : 'var(--forest)';
                return (
                  <Link
                    key={b.id}
                    to="/budgets"
                    style={{
                      display: 'block',
                      background: 'white',
                      borderRadius: 12,
                      border: `1px solid ${b.is_over_budget ? 'var(--rose-light)' : 'var(--cream-darker)'}`,
                      padding: '14px 16px',
                      textDecoration: 'none',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>
                        {getCategoryName(b.category_id) ?? t('common.overall')}
                      </span>
                      <span style={{ fontSize: 12, color: barColor, fontWeight: 500 }}>
                        {b.percentage_used.toFixed(0)}%
                      </span>
                    </div>
                    <div style={{ background: 'var(--cream-dark)', borderRadius: 99, height: 6, overflow: 'hidden', marginBottom: 6 }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: barColor, borderRadius: 99, transition: 'width 0.4s ease' }} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: 11, color: 'var(--ink-faint)' }}>
                        {t('dashboard.budgetSpent', { amount: fmt(b.spent) })}
                      </span>
                      <span style={{ fontSize: 11, color: b.is_over_budget ? 'var(--rose)' : 'var(--ink-faint)' }}>
                        {b.is_over_budget ? t('dashboard.budgetOver', { amount: fmt(Math.abs(b.remaining)) }) : t('dashboard.budgetLeft', { amount: fmt(b.remaining) })}
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)', gap: 20, alignItems: 'start', minWidth: 0 }} className="dashboard-bottom-grid">
        {/* Recent expenses */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink)' }}>{t('dashboard.recentTitle')}</h2>
            <Link
              to={`/wallets/${activeWallet.id}`}
              style={{ fontSize: 13, color: 'var(--forest)', display: 'flex', alignItems: 'center', gap: 4 }}
            >
              {t('dashboard.recentViewAll')} <ArrowRight size={13} />
            </Link>
          </div>

          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[...Array(5)].map((_, i) => (
                <div key={i} className="skeleton" style={{ height: 56, borderRadius: 10 }} />
              ))}
            </div>
          ) : recent.length === 0 ? (
            <div className="empty-state" style={{ padding: '32px 16px' }}>
              <p className="empty-state-title">{t('dashboard.recentEmptyTitle')}</p>
              <p className="empty-state-desc">{t('dashboard.recentEmptyDesc')}</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {recent.map((expense) => (
                <Link
                  key={expense.id}
                  to={`/wallets/${activeWallet.id}/expenses/${expense.id}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '10px 12px',
                    borderRadius: 10,
                    textDecoration: 'none',
                    transition: 'background 0.12s',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'white')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <CategoryIcon
                    iconName={expense.category.icon}
                    color={expense.category.color}
                    size={16}
                    containerSize={36}
                    borderRadius={9}
                    fallbackLetter={expense.category.name[0]}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {expense.description ?? expense.category.name}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--ink-faint)', display: 'flex', gap: 5, alignItems: 'center' }}>
                      <span>{expense.category.name}</span>
                      {expense.children && expense.children.length > 0 && (
                        <>
                          <span>·</span>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                            <Layers size={11} />
                            {t('dashboard.itemsCount', { count: expense.children.length })}
                          </span>
                        </>
                      )}
                      <span>·</span>
                      <span>{fmtRelative(expense.date)}</span>
                    </div>
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: expense.type === 'income' ? 'var(--forest)' : 'var(--ink)', flexShrink: 0 }}>
                    {expense.type === 'income' ? '+' : ''}{fmt(expense.amount, activeWallet.currency)}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Charts column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Spending by category */}
          <div>
            <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink)', marginBottom: 4 }}>{t('dashboard.spendingTitle')}</h2>
            <div ref={spendingPeriodRef} style={{ position: 'relative', display: 'inline-block', marginBottom: 14 }}>
              <button
                onClick={() => setSpendingPeriodOpen((v) => !v)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 3, background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 12, color: 'var(--ink-faint)', fontFamily: 'inherit' }}
              >
                {getPeriodLabel(spendingPeriod)}
                <ChevronDown size={11} style={{ transition: 'transform 0.15s', transform: spendingPeriodOpen ? 'rotate(180deg)' : 'none' }} />
              </button>
              {spendingPeriodOpen && (
                <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: 4, background: 'white', border: '1px solid var(--cream-darker)', borderRadius: 8, boxShadow: '0 4px 12px oklch(0% 0 0 / 0.08)', zIndex: 50, minWidth: 140, overflow: 'hidden' }}>
                  {(['this_month', 'last_month', 'last_3_months', 'this_year'] as DashboardPeriod[]).map((p) => (
                    <button
                      key={p}
                      onClick={() => { setSpendingPeriod(p); setSpendingPeriodOpen(false); }}
                      style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', background: p === spendingPeriod ? 'var(--cream)' : 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: p === spendingPeriod ? 'var(--forest)' : 'var(--ink)', fontFamily: 'inherit', fontWeight: p === spendingPeriod ? 500 : 400 }}
                      onMouseEnter={(e) => { if (p !== spendingPeriod) e.currentTarget.style.background = 'var(--cream)'; }}
                      onMouseLeave={(e) => { if (p !== spendingPeriod) e.currentTarget.style.background = 'none'; }}
                    >
                      {getPeriodLabel(p)}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div ref={spendingChartRef} style={{ transition: 'opacity 0.2s ease' }}>
            {loading ? (
              <div className="skeleton" style={{ height: 220, borderRadius: 12 }} />
            ) : spendingSummary && spendingSummary.by_category.length > 0 ? (
              (() => {
                const sorted = [...spendingSummary.by_category].sort((a, b) => b.total - a.total);
                const total = sorted.reduce((s, c) => s + c.total, 0);
                const displayed = categoryExpanded ? sorted : sorted.slice(0, 3);
                return (
                  <div style={{ background: 'white', borderRadius: 14, border: '1px solid var(--cream-darker)', padding: '16px' }}>
                    <ResponsiveContainer width="100%" height={160}>
                      <PieChart>
                        <Pie
                          data={sorted}
                          dataKey="total"
                          nameKey="category_name"
                          cx="50%"
                          cy="50%"
                          innerRadius={45}
                          outerRadius={72}
                          paddingAngle={2}
                          cursor="pointer"
                          // eslint-disable-next-line @typescript-eslint/no-explicit-any
                          onClick={(data: any) => goToCategory(data.category_id as string)}
                          shape={(props, index) => (
                            <Sector
                              cx={props.cx}
                              cy={props.cy}
                              innerRadius={props.innerRadius}
                              outerRadius={props.outerRadius}
                              startAngle={props.startAngle}
                              endAngle={props.endAngle}
                              cornerRadius={props.cornerRadius}
                              fill={sorted[index].category_color ?? FALLBACK_COLORS[index % FALLBACK_COLORS.length]}
                              style={{ cursor: 'pointer' }}
                            />
                          )}
                        />
                        <Tooltip content={<PieTooltip total={total} currency={activeWallet.currency} />} wrapperStyle={{ transition: 'opacity 0.15s ease' }} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                      {displayed.map((cat, i) => (
                        <button
                          key={cat.category_id}
                          onClick={() => goToCategory(cat.category_id)}
                          style={{ display: 'flex', alignItems: 'baseline', gap: 8, background: 'none', border: 'none', padding: '2px 0', cursor: 'pointer', width: '100%', textAlign: 'left', borderRadius: 4 }}
                          onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.7')}
                          onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
                        >
                          <div style={{ width: 8, height: 8, borderRadius: 2, background: cat.category_color ?? FALLBACK_COLORS[i % FALLBACK_COLORS.length], flexShrink: 0, alignSelf: 'center' }} />
                          <span style={{ fontSize: 13, color: 'var(--ink-mid)', flex: 1 }}>{cat.category_name}</span>
                          <span style={{ fontSize: 12, color: 'var(--ink-faint)' }}>{total > 0 ? ((cat.total / total) * 100).toFixed(1) : 0}%</span>
                          <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)' }}>{fmt(cat.total, activeWallet.currency)}</span>
                        </button>
                      ))}
                      {sorted.length > 3 && (
                        <button
                          onClick={() => setCategoryExpanded((v) => !v)}
                          style={{ alignSelf: 'flex-start', marginTop: 2, fontSize: 12, color: 'var(--forest)', background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontWeight: 500 }}
                        >
                          {categoryExpanded ? t('dashboard.showLess') : t('dashboard.showMore', { count: sorted.length - 3 })}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })()
            ) : (
              <div className="empty-state" style={{ padding: '32px 16px', background: 'white', borderRadius: 14, border: '1px solid var(--cream-darker)' }}>
                <p className="empty-state-desc">{t('dashboard.noData')}</p>
              </div>
            )}
            </div>
          </div>

          {/* Income by category */}
          {(loading || incomeSummary) && (
            <div>
              <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink)', marginBottom: 4 }}>{t('dashboard.incomeTitle')}</h2>
              <div ref={incomePeriodRef} style={{ position: 'relative', display: 'inline-block', marginBottom: 14 }}>
                <button
                  onClick={() => setIncomePeriodOpen((v) => !v)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 3, background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 12, color: 'var(--ink-faint)', fontFamily: 'inherit' }}
                >
                  {getPeriodLabel(incomePeriod)}
                  <ChevronDown size={11} style={{ transition: 'transform 0.15s', transform: incomePeriodOpen ? 'rotate(180deg)' : 'none' }} />
                </button>
                {incomePeriodOpen && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: 4, background: 'white', border: '1px solid var(--cream-darker)', borderRadius: 8, boxShadow: '0 4px 12px oklch(0% 0 0 / 0.08)', zIndex: 50, minWidth: 140, overflow: 'hidden' }}>
                    {(['this_month', 'last_month', 'last_3_months', 'this_year'] as DashboardPeriod[]).map((p) => (
                      <button
                        key={p}
                        onClick={() => { setIncomePeriod(p); setIncomePeriodOpen(false); }}
                        style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', background: p === incomePeriod ? 'var(--cream)' : 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: p === incomePeriod ? 'var(--forest)' : 'var(--ink)', fontFamily: 'inherit', fontWeight: p === incomePeriod ? 500 : 400 }}
                        onMouseEnter={(e) => { if (p !== incomePeriod) e.currentTarget.style.background = 'var(--cream)'; }}
                        onMouseLeave={(e) => { if (p !== incomePeriod) e.currentTarget.style.background = 'none'; }}
                      >
                        {getPeriodLabel(p)}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div ref={incomeChartRef} style={{ transition: 'opacity 0.2s ease' }}>
              {loading ? (
                <div className="skeleton" style={{ height: 220, borderRadius: 12 }} />
              ) : incomeSummary && incomeSummary.income_by_category.length === 0 ? (
                <div className="empty-state" style={{ padding: '32px 16px', background: 'white', borderRadius: 14, border: '1px solid var(--cream-darker)' }}>
                  <p className="empty-state-desc">{t('dashboard.noData')}</p>
                </div>
              ) : (
                (() => {
                  const sorted = [...incomeSummary!.income_by_category].sort((a, b) => b.total - a.total);
                  const total = sorted.reduce((s, c) => s + c.total, 0);
                  const displayed = incomeCategoryExpanded ? sorted : sorted.slice(0, 3);
                  return (
                    <div style={{ background: 'white', borderRadius: 14, border: '1px solid var(--cream-darker)', padding: '16px' }}>
                      <ResponsiveContainer width="100%" height={160}>
                        <PieChart>
                          <Pie
                            data={sorted}
                            dataKey="total"
                            nameKey="category_name"
                            cx="50%"
                            cy="50%"
                            innerRadius={45}
                            outerRadius={72}
                            paddingAngle={2}
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            onClick={(data: any) => goToCategory(data.category_id as string)}
                            shape={(props, index) => (
                              <Sector
                                cx={props.cx}
                                cy={props.cy}
                                innerRadius={props.innerRadius}
                                outerRadius={props.outerRadius}
                                startAngle={props.startAngle}
                                endAngle={props.endAngle}
                                cornerRadius={props.cornerRadius}
                                fill={sorted[index].category_color ?? FALLBACK_COLORS[index % FALLBACK_COLORS.length]}
                                style={{ cursor: 'pointer' }}
                              />
                            )}
                          />
                          <Tooltip content={<PieTooltip total={total} currency={activeWallet.currency} />} wrapperStyle={{ transition: 'opacity 0.15s ease' }} />
                        </PieChart>
                      </ResponsiveContainer>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                        {displayed.map((cat, i) => (
                          <button
                            key={cat.category_id}
                            onClick={() => goToCategory(cat.category_id)}
                            style={{ display: 'flex', alignItems: 'baseline', gap: 8, background: 'none', border: 'none', padding: '2px 0', cursor: 'pointer', width: '100%', textAlign: 'left', borderRadius: 4 }}
                            onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.7')}
                            onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
                          >
                            <div style={{ width: 8, height: 8, borderRadius: 2, background: cat.category_color ?? FALLBACK_COLORS[i % FALLBACK_COLORS.length], flexShrink: 0, alignSelf: 'center' }} />
                            <span style={{ fontSize: 13, color: 'var(--ink-mid)', flex: 1 }}>{cat.category_name}</span>
                            <span style={{ fontSize: 12, color: 'var(--ink-faint)' }}>{total > 0 ? ((cat.total / total) * 100).toFixed(1) : 0}%</span>
                            <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--forest)' }}>{fmt(cat.total, activeWallet.currency)}</span>
                          </button>
                        ))}
                        {sorted.length > 3 && (
                          <button
                            onClick={() => setIncomeCategoryExpanded((v) => !v)}
                            style={{ alignSelf: 'flex-start', marginTop: 2, fontSize: 12, color: 'var(--forest)', background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontWeight: 500 }}
                          >
                            {incomeCategoryExpanded ? t('dashboard.showLess') : t('dashboard.showMore', { count: sorted.length - 3 })}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })()
              )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PieTooltip({ active, payload, total, currency }: { active?: boolean; payload?: { name: string; value: number; payload: { category_color: string | null } }[]; total: number; currency: string }) {
  if (!active || !payload?.length) return null;
  const { name, value, payload: { category_color } } = payload[0];
  const pct = total > 0 ? ((value / total) * 100).toFixed(1) : '0.0';
  return (
    <div style={{ background: 'white', border: '1px solid var(--cream-darker)', borderRadius: 8, padding: '8px 12px', fontSize: 13, boxShadow: '0 2px 8px oklch(0% 0 0 / 0.08)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        {category_color && <div style={{ width: 8, height: 8, borderRadius: 2, background: category_color, flexShrink: 0 }} />}
        <span style={{ fontWeight: 600, color: 'var(--ink)' }}>{name}</span>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
        <span style={{ color: 'var(--ink)' }}>{fmt(value, currency)}</span>
        <span style={{ fontSize: 12, color: 'var(--ink-faint)' }}>{pct}%</span>
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  sub,
  accent,
  loading,
}: {
  label: string;
  value: string | null;
  sub: string;
  accent: string;
  loading: boolean;
}) {
  return (
    <div style={{
      background: 'white',
      borderRadius: 14,
      border: '1px solid var(--cream-darker)',
      padding: '18px 20px',
      borderLeft: `3px solid ${accent}`,
    }}>
      <div style={{ fontSize: 12, color: 'var(--ink-light)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
        {label}
      </div>
      {loading ? (
        <div className="skeleton" style={{ height: 28, width: '70%', marginBottom: 6 }} />
      ) : (
        <div style={{ fontSize: 24, fontFamily: 'var(--font-display)', color: 'var(--ink)', marginBottom: 2 }}>
          {value}
        </div>
      )}
      <div style={{ fontSize: 12, color: 'var(--ink-faint)' }}>{sub}</div>
    </div>
  );
}
