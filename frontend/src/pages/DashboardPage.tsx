import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Wallet } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { expenses as expensesApi } from '../lib/api';
import { useWallet } from '../contexts/WalletContext';
import { useAuth } from '../contexts/AuthContext';
import type { ExpenseResponse, ExpenseSummary } from '../lib/types';
import { fmt, fmtRelative, startOfMonth, endOfMonth, startOfWeek } from '../lib/utils';

const CHART_COLORS = [
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
  const [summary, setSummary] = useState<ExpenseSummary | null>(null);
  const [weekSummary, setWeekSummary] = useState<ExpenseSummary | null>(null);
  const [recent, setRecent] = useState<ExpenseResponse[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!activeWallet) return;
    setLoading(true);
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);

    Promise.all([
      expensesApi.summary(activeWallet.id, { start_date: startOfMonth(), end_date: endOfMonth() }),
      expensesApi.summary(activeWallet.id, { start_date: startOfWeek() }),
      expensesApi.list(activeWallet.id, { page: 1, page_size: 8, sort_by: 'date', sort_order: 'desc' }),
    ])
      .then(([monthSum, weekSum, recentList]) => {
        setSummary(monthSum);
        setWeekSummary(weekSum);
        setRecent(recentList.items);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [activeWallet]);

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

  return (
    <div className="animate-fade-in">
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
          sub={`${summary?.expense_count ?? 0} expenses`}
          accent="var(--forest)"
          loading={loading}
        />
        <SummaryCard
          label="This week"
          value={loading ? null : fmt(weekSummary?.total_amount ?? 0, activeWallet.currency)}
          sub={`${weekSummary?.expense_count ?? 0} expenses`}
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

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)', gap: 20, alignItems: 'start' }}>
        {/* Recent expenses */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink)' }}>Recent expenses</h2>
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
              <p className="empty-state-title">No expenses yet</p>
              <p className="empty-state-desc">Press ⌘K to add your first expense.</p>
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
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 9,
                      background: expense.category.color ?? 'var(--cream-darker)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 16,
                      flexShrink: 0,
                    }}
                  >
                    {expense.category.icon ? (
                      <span>{expense.category.icon}</span>
                    ) : (
                      <span style={{ fontSize: 12, fontWeight: 600, color: 'white' }}>
                        {expense.category.name[0]}
                      </span>
                    )}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {expense.description ?? expense.category.name}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--ink-faint)' }}>
                      {expense.category.name} · {fmtRelative(expense.date)}
                    </div>
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink)', flexShrink: 0 }}>
                    {fmt(expense.amount, activeWallet.currency)}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Category breakdown */}
        <div>
          <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink)', marginBottom: 14 }}>By category</h2>
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
                    {summary.by_category.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(val) => fmt(Number(val), activeWallet.currency)}
                    contentStyle={{ borderRadius: 8, border: '1px solid var(--cream-darker)', fontSize: 13 }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                {summary.by_category.slice(0, 5).map((cat, i) => (
                  <div key={cat.category_id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 8, height: 8, borderRadius: 2, background: CHART_COLORS[i % CHART_COLORS.length], flexShrink: 0 }} />
                    <span style={{ fontSize: 13, color: 'var(--ink-mid)', flex: 1 }}>{cat.category_name}</span>
                    <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)' }}>{fmt(cat.total, activeWallet.currency)}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="empty-state" style={{ padding: '32px 16px', background: 'white', borderRadius: 14, border: '1px solid var(--cream-darker)' }}>
              <p className="empty-state-desc">No data yet this month.</p>
            </div>
          )}
        </div>
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
