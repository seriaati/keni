import { useEffect, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { AlertTriangle, ArrowRight, Layers, Wallet } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { expenses as expensesApi, budgets as budgetsApi, categories as categoriesApi } from '../lib/api';
import { useWallet } from '../contexts/WalletContext';
import { useAuth } from '../contexts/AuthContext';
import type { BudgetResponse, CategoryResponse, TransactionResponse, TransactionSummary } from '../lib/types';
import { fmt, fmtRelative, startOfMonth, endOfMonth, startOfWeek } from '../lib/utils';
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
  const { user } = useAuth();
  const { activeWallet } = useWallet();
  const { expenseAddedKey } = useOutletContext<LayoutOutletContext>();
  const [summary, setSummary] = useState<TransactionSummary | null>(null);
  const [weekSummary, setWeekSummary] = useState<TransactionSummary | null>(null);
  const [recent, setRecent] = useState<TransactionResponse[]>([]);
  const [budgets, setBudgets] = useState<BudgetResponse[]>([]);
  const [categories, setCategories] = useState<CategoryResponse[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!activeWallet) return;
    setLoading(true);

    Promise.all([
      expensesApi.summary(activeWallet.id, { start_date: startOfMonth(), end_date: endOfMonth() }),
      expensesApi.summary(activeWallet.id, { start_date: startOfWeek() }),
      expensesApi.list(activeWallet.id, { page: 1, page_size: 8, sort_by: 'date', sort_order: 'desc' }),
      budgetsApi.list(),
      categoriesApi.list(),
    ])
      .then(([monthSum, weekSum, recentList, budgetList, categoryList]) => {
        setSummary(monthSum);
        setWeekSummary(weekSum);
        setRecent(recentList.items);
        setBudgets(budgetList);
        setCategories(categoryList);
      })
      .catch(() => { })
      .finally(() => setLoading(false));
  }, [activeWallet, expenseAddedKey]);

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  };

  const name = user?.display_name ?? user?.username ?? '';

  if (!activeWallet) {
    return (
      <div className="empty-state" style={{ marginTop: 60 }}>
        <Wallet size={48} className="empty-state-icon" />
        <p className="empty-state-title">No wallet yet</p>
        <p className="empty-state-desc">Create a wallet to start tracking your expenses.</p>
        <Link to="/wallets" className="btn btn-primary btn-md" style={{ marginTop: 8 }}>
          Create wallet
        </Link>
      </div>
    );
  }

  const getCategoryName = (id: string | null) =>
    id ? (categories.find((c) => c.id === id)?.name ?? 'Unknown') : null;

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
              {overBudget.length === 1 ? '1 budget exceeded' : `${overBudget.length} budgets exceeded`}
            </div>
            <div style={{ fontSize: 13, color: 'var(--ink-mid)' }}>
              {overBudget.map((b) => getCategoryName(b.category_id) ?? 'Overall').join(', ')} {overBudget.length === 1 ? 'is' : 'are'} over the spending limit this {overBudget[0].period}.
            </div>
          </div>
          <Link to="/budgets" style={{ fontSize: 13, color: 'var(--rose)', fontWeight: 500, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4 }}>
            Review <ArrowRight size={13} />
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
              {nearLimit.length === 1 ? '1 budget near limit' : `${nearLimit.length} budgets near limit`}
            </div>
            <div style={{ fontSize: 13, color: 'var(--ink-mid)' }}>
              {nearLimit.map((b) => getCategoryName(b.category_id) ?? 'Overall').join(', ')} {nearLimit.length === 1 ? 'is' : 'are'} above 80% of the spending limit.
            </div>
          </div>
          <Link to="/budgets" style={{ fontSize: 13, color: 'oklch(52% 0.14 65)', fontWeight: 500, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4 }}>
            Review <ArrowRight size={13} />
          </Link>
        </div>
      )}

      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(26px, 4vw, 36px)', color: 'var(--ink)', fontStyle: 'italic' }}>
          {greeting()}{name ? `, ${name}` : ''}.
        </h1>
        <p style={{ fontSize: 14, color: 'var(--ink-light)', marginTop: 4 }}>
          Here's your spending overview for {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}.
        </p>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 32 }}>
        <SummaryCard
          label="This month"
          value={loading ? null : fmt(summary?.total_amount ?? 0, activeWallet.currency)}
          sub={`${summary?.expense_count ?? 0} transactions`}
          accent="var(--forest)"
          loading={loading}
        />
        <SummaryCard
          label="This week"
          value={loading ? null : fmt(weekSummary?.total_amount ?? 0, activeWallet.currency)}
          sub={`${weekSummary?.expense_count ?? 0} transactions`}
          accent="var(--amber)"
          loading={loading}
        />
        <SummaryCard
          label="Daily average"
          value={loading ? null : fmt(
            summary ? summary.total_amount / Math.max(new Date().getDate(), 1) : 0,
            activeWallet.currency,
          )}
          sub="this month"
          accent="var(--sky)"
          loading={loading}
        />
      </div>

      {/* Budget overview */}
      {(loading || budgets.length > 0) && (
        <div style={{ marginBottom: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink)' }}>Budgets</h2>
            <Link to="/budgets" style={{ fontSize: 13, color: 'var(--forest)', display: 'flex', alignItems: 'center', gap: 4 }}>
              Manage <ArrowRight size={13} />
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
                        {getCategoryName(b.category_id) ?? 'Overall'}
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
                        {fmt(b.spent)} spent
                      </span>
                      <span style={{ fontSize: 11, color: b.is_over_budget ? 'var(--rose)' : 'var(--ink-faint)' }}>
                        {b.is_over_budget ? `${fmt(Math.abs(b.remaining))} over` : `${fmt(b.remaining)} left`}
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div
        ref={(el) => {
          if (!el) return;
          const grid = el;
          const firstChild = el.firstElementChild as HTMLElement | null;
          console.debug('[layout-debug] viewport width:', window.innerWidth);
          console.debug('[layout-debug] page-content width:', el.parentElement?.offsetWidth);
          console.debug('[layout-debug] dashboard-bottom-grid width:', grid.scrollWidth, '(offsetWidth:', grid.offsetWidth, ')');
          if (firstChild) console.debug('[layout-debug] recent-transactions column width:', firstChild.scrollWidth, '(offsetWidth:', firstChild.offsetWidth, ')');
        }}
        style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)', gap: 20, alignItems: 'start', minWidth: 0 }} className="dashboard-bottom-grid">
        {/* Recent expenses */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink)' }}>Recent transactions</h2>
            <Link
              to={`/wallets/${activeWallet.id}`}
              style={{ fontSize: 13, color: 'var(--forest)', display: 'flex', alignItems: 'center', gap: 4 }}
            >
              View all <ArrowRight size={13} />
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
              <p className="empty-state-title">No transactions yet</p>
              <p className="empty-state-desc">Press ⌘K to add your first transaction.</p>
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
                            {expense.children.length} items
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
            <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink)', marginBottom: 14 }}>Spending by category</h2>
            {loading ? (
              <div className="skeleton" style={{ height: 220, borderRadius: 12 }} />
            ) : summary && summary.by_category.length > 0 ? (
              <div style={{ background: 'white', borderRadius: 14, border: '1px solid var(--cream-darker)', padding: '16px' }}>
                <ResponsiveContainer width="100%" height={160}>
                  <PieChart>
                    <Pie
                      data={summary.by_category}
                      dataKey="total"
                      nameKey="category_name"
                      cx="50%"
                      cy="50%"
                      innerRadius={45}
                      outerRadius={72}
                      paddingAngle={2}
                    >
                      {summary.by_category.map((cat, i) => (
                        <Cell key={i} fill={cat.category_color ?? FALLBACK_COLORS[i % FALLBACK_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip content={<PieTooltip total={summary.by_category.reduce((s, c) => s + c.total, 0)} currency={activeWallet.currency} />} wrapperStyle={{ transition: 'opacity 0.15s ease' }} />
                  </PieChart>
                </ResponsiveContainer>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                  {(() => {
                    const total = summary.by_category.reduce((s, c) => s + c.total, 0);
                    return summary.by_category.slice(0, 5).map((cat, i) => (
                      <div key={cat.category_id} style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                        <div style={{ width: 8, height: 8, borderRadius: 2, background: cat.category_color ?? FALLBACK_COLORS[i % FALLBACK_COLORS.length], flexShrink: 0, alignSelf: 'center' }} />
                        <span style={{ fontSize: 13, color: 'var(--ink-mid)', flex: 1 }}>{cat.category_name}</span>
                        <span style={{ fontSize: 12, color: 'var(--ink-faint)' }}>{total > 0 ? ((cat.total / total) * 100).toFixed(1) : 0}%</span>
                        <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)' }}>{fmt(cat.total, activeWallet.currency)}</span>
                      </div>
                    ));
                  })()}
                </div>
              </div>
            ) : (
              <div className="empty-state" style={{ padding: '32px 16px', background: 'white', borderRadius: 14, border: '1px solid var(--cream-darker)' }}>
                <p className="empty-state-desc">No data yet this month.</p>
              </div>
            )}
          </div>

          {/* Income by category */}
          {(loading || (summary && summary.income_by_category.length > 0)) && (
            <div>
              <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink)', marginBottom: 14 }}>Income by category</h2>
              {loading ? (
                <div className="skeleton" style={{ height: 220, borderRadius: 12 }} />
              ) : (
                <div style={{ background: 'white', borderRadius: 14, border: '1px solid var(--cream-darker)', padding: '16px' }}>
                  <ResponsiveContainer width="100%" height={160}>
                    <PieChart>
                      <Pie
                        data={summary!.income_by_category}
                        dataKey="total"
                        nameKey="category_name"
                        cx="50%"
                        cy="50%"
                        innerRadius={45}
                        outerRadius={72}
                        paddingAngle={2}
                      >
                        {summary!.income_by_category.map((cat, i) => (
                          <Cell key={i} fill={cat.category_color ?? FALLBACK_COLORS[i % FALLBACK_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip content={<PieTooltip total={summary!.income_by_category.reduce((s, c) => s + c.total, 0)} currency={activeWallet.currency} />} wrapperStyle={{ transition: 'opacity 0.15s ease' }} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                    {(() => {
                      const total = summary!.income_by_category.reduce((s, c) => s + c.total, 0);
                      return summary!.income_by_category.slice(0, 5).map((cat, i) => (
                        <div key={cat.category_id} style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                          <div style={{ width: 8, height: 8, borderRadius: 2, background: cat.category_color ?? FALLBACK_COLORS[i % FALLBACK_COLORS.length], flexShrink: 0, alignSelf: 'center' }} />
                          <span style={{ fontSize: 13, color: 'var(--ink-mid)', flex: 1 }}>{cat.category_name}</span>
                          <span style={{ fontSize: 12, color: 'var(--ink-faint)' }}>{total > 0 ? ((cat.total / total) * 100).toFixed(1) : 0}%</span>
                          <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--forest)' }}>{fmt(cat.total, activeWallet.currency)}</span>
                        </div>
                      ));
                    })()}
                  </div>
                </div>
              )}
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
