import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { Wallet } from 'lucide-react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { expenses as expensesApi } from '../lib/api';
import { useWallet } from '../contexts/WalletContext';
import type { TransactionAnalytics, TransactionResponse } from '../lib/types';
import { fmt, fmtDateShort } from '../lib/utils';
import { DatePicker } from '../components/ui/DatePicker';
import { ErrorBoundary } from '../components/ErrorBoundary';

type Preset = 'this_month' | 'last_month' | 'last_3_months' | 'this_year' | 'custom';
type TxType = 'expense' | 'income';

const PRESETS: Preset[] = ['this_month', 'last_month', 'last_3_months', 'this_year', 'custom'];
const PALETTE = [
  'var(--forest)',
  'var(--amber)',
  'var(--sky)',
  'var(--rose)',
  'oklch(60% 0.13 300)',
  'oklch(65% 0.15 160)',
  'oklch(60% 0.14 30)',
  'oklch(55% 0.10 240)',
];
const TOP_CATEGORIES = 8;
const TOP_TRANSACTIONS = 50;
const DEFAULT_TOP_SHOWN = 5;

const dayMs = 86_400_000;
const pad = (n: number) => String(n).padStart(2, '0');
const localDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseDay = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
};

function presetRange(preset: Exclude<Preset, 'custom'>): { start: Date; end: Date } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  switch (preset) {
    case 'last_month':
      return { start: new Date(y, m - 1, 1), end: new Date(y, m, 0) };
    case 'last_3_months':
      return { start: new Date(y, m - 2, 1), end: new Date(y, m + 1, 0) };
    case 'this_year':
      return { start: new Date(y, 0, 1), end: new Date(y, 11, 31) };
    default:
      return { start: new Date(y, m, 1), end: new Date(y, m + 1, 0) };
  }
}

function previousRange(start: Date, end: Date): { start: Date; end: Date } {
  const spanDays = Math.round((end.getTime() - start.getTime()) / dayMs) + 1;
  const prevEnd = new Date(start.getTime() - dayMs);
  const prevStart = new Date(prevEnd.getTime() - (spanDays - 1) * dayMs);
  return { start: prevStart, end: prevEnd };
}

function toParams(start: Date, end: Date) {
  const endOfDay = new Date(end.getFullYear(), end.getMonth(), end.getDate(), 23, 59, 59);
  return { start_date: start.toISOString(), end_date: endOfDay.toISOString() };
}

function cumulativeByOffset(byDay: TransactionAnalytics['by_day'], start: Date) {
  const sorted = [...byDay].sort((a, b) => a.day.localeCompare(b.day));
  const startOnly = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  let run = 0;
  const out = new Map<number, number>();
  for (const d of sorted) {
    run += d.total;
    const offset = Math.round((parseDay(d.day).getTime() - startOnly.getTime()) / dayMs);
    out.set(offset, run);
  }
  return out;
}

interface HeatTip {
  iso: string;
  total: number;
  x: number;
  y: number;
}

export function InsightsPage() {
  const { t } = useTranslation();
  const { activeWallet } = useWallet();
  const navigate = useNavigate();
  const currency = activeWallet?.currency ?? 'USD';
  const canHover = typeof window !== 'undefined' && window.matchMedia('(hover: hover)').matches;

  const [preset, setPreset] = useState<Preset>('this_month');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [type, setType] = useState<TxType>('expense');
  const [analytics, setAnalytics] = useState<TransactionAnalytics | null>(null);
  const [prevAnalytics, setPrevAnalytics] = useState<TransactionAnalytics | null>(null);
  const [topTxns, setTopTxns] = useState<TransactionResponse[]>([]);
  const [showAllTop, setShowAllTop] = useState(false);
  const [loading, setLoading] = useState(true);
  const [dataVersion, setDataVersion] = useState(0);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 640px)');
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  const { start, end } = useMemo(() => {
    if (preset === 'custom') {
      const fallback = presetRange('this_month');
      return {
        start: customStart ? parseDay(customStart) : fallback.start,
        end: customEnd ? parseDay(customEnd) : fallback.end,
      };
    }
    return presetRange(preset);
  }, [preset, customStart, customEnd]);

  const selectPreset = (p: Preset) => {
    if (p === 'custom' && !customStart && !customEnd) {
      const r = presetRange('this_month');
      setCustomStart(localDate(r.start));
      setCustomEnd(localDate(r.end));
    }
    setPreset(p);
  };

  useEffect(() => {
    if (!activeWallet) return;
    setLoading(true);
    setShowAllTop(false);
    const prev = previousRange(start, end);
    Promise.all([
      expensesApi.analytics(activeWallet.id, { ...toParams(start, end), type }),
      expensesApi.analytics(activeWallet.id, { ...toParams(prev.start, prev.end), type }),
      expensesApi.list(activeWallet.id, {
        ...toParams(start, end),
        type,
        sort_by: 'amount',
        sort_order: 'desc',
        page: 1,
        page_size: TOP_TRANSACTIONS,
      }),
    ])
      .then(([cur, prevData, top]) => {
        setAnalytics(cur);
        setPrevAnalytics(prevData);
        setTopTxns(top.items);
        setDataVersion((v) => v + 1);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [activeWallet, type, start, end]); // eslint-disable-line react-hooks/exhaustive-deps

  // Headline stats
  const stats = useMemo(() => {
    const byDay = analytics?.by_day ?? [];
    const total = byDay.reduce((s, d) => s + d.total, 0);
    const count = byDay.reduce((s, d) => s + d.count, 0);
    const spanDays = Math.round((end.getTime() - start.getTime()) / dayMs) + 1;
    const biggest = byDay.reduce<{ day: string; total: number } | null>(
      (max, d) => (!max || d.total > max.total ? { day: d.day, total: d.total } : max),
      null,
    );
    return { total, count, perDay: spanDays ? total / spanDays : 0, biggest };
  }, [analytics, start, end]);

  // Cumulative line: current vs previous period, aligned by day offset
  const cumulativeData = useMemo(() => {
    const cur = cumulativeByOffset(analytics?.by_day ?? [], start);
    const prevRange = previousRange(start, end);
    const prev = cumulativeByOffset(prevAnalytics?.by_day ?? [], prevRange.start);
    const maxOffset = Math.max(0, ...cur.keys(), ...prev.keys());
    const rows: { day: number; current: number | null; previous: number | null }[] = [];
    let curRun = 0;
    let prevRun = 0;
    let curSeen = false;
    let prevSeen = false;
    for (let i = 0; i <= maxOffset; i++) {
      if (cur.has(i)) { curRun = cur.get(i)!; curSeen = true; }
      if (prev.has(i)) { prevRun = prev.get(i)!; prevSeen = true; }
      rows.push({
        day: i + 1,
        current: curSeen ? curRun : null,
        previous: prevSeen ? prevRun : null,
      });
    }
    return rows;
  }, [analytics, prevAnalytics, start, end]);

  // Category stacked area: pivot by_day_category, keep top N + Other
  const { areaData, areaCategories } = useMemo(() => {
    const rows = analytics?.by_day_category ?? [];
    const totals = new Map<string, { id: string; name: string; color: string | null; total: number }>();
    for (const r of rows) {
      const cur = totals.get(r.category_name) ?? { id: r.category_id, name: r.category_name, color: r.category_color, total: 0 };
      cur.total += r.total;
      totals.set(r.category_name, cur);
    }
    const ranked = [...totals.values()].sort((a, b) => b.total - a.total);
    const top = ranked.slice(0, TOP_CATEGORIES);
    const topNames = new Set(top.map((c) => c.name));
    const hasOther = ranked.length > TOP_CATEGORIES;

    const byDay = new Map<string, Record<string, number | string>>();
    for (const r of rows) {
      const row = byDay.get(r.day) ?? { day: r.day };
      const key = topNames.has(r.category_name) ? r.category_name : t('insights.other');
      row[key] = ((row[key] as number) ?? 0) + r.total;
      byDay.set(r.day, row);
    }
    const data = [...byDay.values()].sort((a, b) => String(a.day).localeCompare(String(b.day)));
    const cats = top.map((c, i) => ({ id: c.id as string | null, name: c.name, color: c.color ?? PALETTE[i % PALETTE.length] }));
    if (hasOther) cats.push({ id: null, name: t('insights.other'), color: 'var(--ink-light)' });
    return { areaData: data, areaCategories: cats };
  }, [analytics, t]);

  // Calendar heatmap: GitHub-style week columns over the range
  const heatmap = useMemo(() => {
    const map = new Map((analytics?.by_day ?? []).map((d) => [d.day, d.total]));
    const max = Math.max(0, ...map.values());
    const startOnly = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    const endOnly = new Date(end.getFullYear(), end.getMonth(), end.getDate());
    const firstSunday = new Date(startOnly);
    firstSunday.setDate(firstSunday.getDate() - firstSunday.getDay());
    const weeks: ({ iso: string; total: number } | null)[][] = [];
    const monthCols: string[] = [];
    let lastMonth = -1;
    const cur = new Date(firstSunday);
    while (cur <= endOnly) {
      const week: ({ iso: string; total: number } | null)[] = [];
      let weekMonth = -1;
      for (let i = 0; i < 7; i++) {
        const inRange = cur >= startOnly && cur <= endOnly;
        if (inRange) {
          const iso = `${cur.getFullYear()}-${pad(cur.getMonth() + 1)}-${pad(cur.getDate())}`;
          week.push({ iso, total: map.get(iso) ?? 0 });
          if (weekMonth === -1) weekMonth = cur.getMonth();
        } else {
          week.push(null);
        }
        cur.setDate(cur.getDate() + 1);
      }
      if (weekMonth !== -1 && weekMonth !== lastMonth) {
        monthCols.push(new Date(2000, weekMonth, 1).toLocaleDateString(undefined, { month: 'short' }));
        lastMonth = weekMonth;
      } else {
        monthCols.push('');
      }
      weeks.push(week);
    }
    return { weeks, monthCols, max };
  }, [analytics, start, end]);

  // Responsive heatmap cell size — grow blocks to fill width on small ranges
  const heatRef = useRef<HTMLDivElement>(null);
  const [heatWidth, setHeatWidth] = useState(0);
  useEffect(() => {
    const el = heatRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => setHeatWidth(entries[0].contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Heatmap tooltip (hover on desktop, tap on mobile)
  const [tip, setTip] = useState<HeatTip | null>(null);
  const pinnedRef = useRef(false);
  useEffect(() => {
    if (!tip) return;
    const onDown = (e: PointerEvent) => {
      if (pinnedRef.current && !(e.target as HTMLElement).closest('[data-heatcell]')) {
        pinnedRef.current = false;
        setTip(null);
      }
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [tip]);

  if (!activeWallet) {
    return (
      <div className="empty-state" style={{ marginTop: 60 }}>
        <Wallet size={48} className="empty-state-icon" />
        <p className="empty-state-title">{t('dashboard.noWalletTitle')}</p>
        <p className="empty-state-desc">{t('dashboard.noWalletDesc')}</p>
      </div>
    );
  }

  const compact = (v: number) => (Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(Math.round(v)));
  const heatColor = (total: number) => {
    if (total <= 0) return 'var(--cream-darker)';
    const intensity = heatmap.max ? 0.18 + 0.82 * (total / heatmap.max) : 0.5;
    return `color-mix(in oklch, var(--forest) ${Math.round(intensity * 100)}%, var(--cream))`;
  };

  // Heatmap geometry
  const GAP = 4;
  const LABEL_W = 32;
  const weekCount = heatmap.weeks.length;
  const avail = Math.max(0, heatWidth - LABEL_W);
  const rawCell = weekCount > 0 ? Math.floor((avail - GAP * (weekCount - 1)) / weekCount) : 14;
  const cell = Math.max(13, Math.min(46, rawCell));
  const WEEKDAYS =[t('insights.sun'), t('insights.mon'), t('insights.tue'), t('insights.wed'), t('insights.thu'), t('insights.fri'), t('insights.sat')];

  const showTip = (c: { iso: string; total: number }, el: HTMLElement, pin: boolean) => {
    const r = el.getBoundingClientRect();
    pinnedRef.current = pin;
    setTip({ iso: c.iso, total: c.total, x: r.left + r.width / 2, y: r.top - 6 });
  };

  const visibleTop = showAllTop ? topTxns : topTxns.slice(0, DEFAULT_TOP_SHOWN);
  const rangeParams = `category_ids=__CAT__&start_date=${localDate(start)}&end_date=${localDate(end)}`;
  const categoryLink = (catId: string) =>
    `/wallets/${activeWallet.id}?${rangeParams.replace('__CAT__', catId)}`;
  const dateLink = (iso: string) => {
    const d = parseDay(iso);
    return `/wallets/${activeWallet.id}?start_date=${localDate(d)}&end_date=${localDate(d)}`;
  };
  const linkStyle = { color: 'var(--forest)' } as const;

  const renderCategoryLegend = () => (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px', justifyContent: 'center', ...legendStyle }}>
      {areaCategories.map((c) => {
        const swatch = <span style={{ width: 10, height: 10, borderRadius: 2, background: c.color, flexShrink: 0 }} />;
        const inner = (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            {swatch}
            {c.name}
          </span>
        );
        return c.id ? (
          <Link key={c.name} to={categoryLink(c.id)} className="insight-link" style={{ color: 'var(--ink-mid)' }}>
            {inner}
          </Link>
        ) : (
          <span key={c.name} style={{ color: 'var(--ink-mid)' }}>{inner}</span>
        );
      })}
    </div>
  );

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(26px, 4vw, 36px)', color: 'var(--ink)', fontStyle: 'italic' }}>
          {t('insights.title')}
        </h1>
        <p style={{ fontSize: 14, color: 'var(--ink-light)', marginTop: 4 }}>{t('insights.subtitle')}</p>
      </div>

      {/* Filter bar */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: preset === 'custom' ? 12 : 24, alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {PRESETS.map((p) => (
            <button
              key={p}
              onClick={() => selectPreset(p)}
              style={{
                padding: '6px 13px',
                borderRadius: 999,
                fontSize: 13,
                lineHeight: 1.4,
                border: '1px solid',
                borderColor: preset === p ? 'var(--ink)' : 'var(--cream-darker)',
                background: preset === p ? 'var(--ink)' : 'white',
                color: preset === p ? 'white' : 'var(--ink-mid)',
                cursor: 'pointer',
              }}
            >
              {t(`insights.preset.${p}`)}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
          {(['expense', 'income'] as TxType[]).map((tp) => (
            <button
              key={tp}
              onClick={() => setType(tp)}
              style={{
                padding: '6px 13px',
                borderRadius: 999,
                fontSize: 13,
                lineHeight: 1.4,
                border: '1px solid',
                borderColor: type === tp ? 'var(--forest)' : 'var(--cream-darker)',
                background: type === tp ? 'var(--forest)' : 'white',
                color: type === tp ? 'white' : 'var(--ink-mid)',
                cursor: 'pointer',
              }}
            >
              {t(`insights.${tp}`)}
            </button>
          ))}
        </div>
      </div>

      {/* Custom range pickers */}
      {preset === 'custom' && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 24, flexWrap: 'wrap' }}>
          <DatePicker value={customStart} onChange={setCustomStart} />
          <span style={{ fontSize: 13, color: 'var(--ink-light)' }}>{t('insights.rangeTo')}</span>
          <DatePicker value={customEnd} onChange={setCustomEnd} />
        </div>
      )}

      {/* Headline stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 24 }}>
        <StatCard label={t('insights.statTotal')} value={fmt(stats.total, currency)} />
        <StatCard label={t('insights.statCount')} value={String(stats.count)} />
        <StatCard label={t('insights.statPerDay')} value={fmt(stats.perDay, currency)} />
        <StatCard
          label={t('insights.statBiggest')}
          value={stats.biggest ? fmt(stats.biggest.total, currency) : '—'}
          sub={stats.biggest ? fmtDateShort(stats.biggest.day) : undefined}
        />
      </div>

      {loading && <p style={{ fontSize: 13, color: 'var(--ink-light)', marginBottom: 16 }}>{t('insights.loading')}</p>}

      {/* Cumulative line */}
      <Card title={t('insights.cumulativeTitle')} desc={t('insights.cumulativeDesc')}>
        <ErrorBoundary fallback={<ChartError />}>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart key={`cum-${dataVersion}`} data={cumulativeData} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--cream-darker)" />
              <XAxis dataKey="day" tick={{ fontSize: 11 }} stroke="var(--ink-light)" interval={isMobile ? 4 : 'preserveStartEnd'} />
              <YAxis tickFormatter={compact} tick={{ fontSize: 11 }} stroke="var(--ink-light)" width={40} />
              <Tooltip formatter={(v) => fmt(Number(v), currency)} labelFormatter={(l) => t('insights.dayN', { n: l })} />
              <Legend wrapperStyle={legendStyle} />
              <Line type="monotone" dataKey="previous" name={t('insights.prevPeriod')} stroke="var(--ink-light)" strokeDasharray="4 4" dot={false} connectNulls />
              <Line type="monotone" dataKey="current" name={t('insights.thisPeriod')} stroke="var(--forest)" strokeWidth={2} dot={false} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </ErrorBoundary>
      </Card>

      {/* Calendar heatmap */}
      <Card title={t('insights.heatmapTitle')} desc={t('insights.heatmapDesc')}>
        <div ref={heatRef} style={{ overflowX: 'auto', paddingBottom: 4 }}>
          <div style={{ width: 'fit-content', margin: '0 auto' }}>
            {/* Month labels */}
            <div style={{ display: 'flex', gap: GAP, marginLeft: LABEL_W, marginBottom: 4 }}>
              {heatmap.monthCols.map((label, wi) => (
                <div key={wi} style={{ width: cell, fontSize: 10, color: 'var(--ink-light)', whiteSpace: 'nowrap', position: 'relative' }}>
                  {label && <span style={{ position: 'absolute', left: 0 }}>{label}</span>}
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: GAP }}>
              {/* Weekday labels */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: GAP, width: LABEL_W - GAP }}>
                {WEEKDAYS.map((wd, i) => (
                  <div key={i} style={{ height: cell, fontSize: 10, color: 'var(--ink-light)', display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                    {i % 2 === 1 ? wd : ''}
                  </div>
                ))}
              </div>
              {/* Week columns */}
              {heatmap.weeks.map((week, wi) => (
                <div key={wi} style={{ display: 'flex', flexDirection: 'column', gap: GAP }}>
                  {week.map((c, di) =>
                    c ? (
                      <div
                        key={di}
                        data-heatcell
                        onPointerEnter={(e) => { if (!pinnedRef.current && e.pointerType === 'mouse') showTip(c, e.currentTarget, false); }}
                        onPointerLeave={(e) => { if (!pinnedRef.current && e.pointerType === 'mouse') setTip(null); }}
                        onClick={(e) => {
                          // Desktop: tooltip already shown on hover, click navigates.
                          // Touch: first tap shows tooltip, second tap on the same cell navigates.
                          if (canHover || (pinnedRef.current && tip?.iso === c.iso)) {
                            navigate(dateLink(c.iso));
                            return;
                          }
                          showTip(c, e.currentTarget, true);
                        }}
                        style={{ width: cell, height: cell, borderRadius: 3, background: heatColor(c.total), cursor: 'pointer' }}
                      />
                    ) : (
                      <div key={di} style={{ width: cell, height: cell }} />
                    ),
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </Card>

      {/* Heatmap floating tooltip */}
      {tip && (
        <div
          style={{
            position: 'fixed',
            left: tip.x,
            top: tip.y,
            transform: 'translate(-50%, -100%)',
            background: 'white',
            border: '1px solid var(--cream-darker)',
            borderRadius: 8,
            padding: '6px 10px',
            fontSize: 12,
            fontFamily: 'var(--font-body)',
            color: 'var(--ink)',
            boxShadow: '0 4px 14px rgba(0,0,0,0.12)',
            pointerEvents: 'none',
            zIndex: 60,
            whiteSpace: 'nowrap',
          }}
        >
          <div style={{ fontWeight: 600 }}>{fmtDateShort(tip.iso)}</div>
          <div style={{ color: 'var(--ink-mid)' }}>{fmt(tip.total, currency)}</div>
        </div>
      )}

      {/* Category stacked area */}
      <Card title={t('insights.areaTitle')} desc={t('insights.areaDesc')}>
        <ErrorBoundary fallback={<ChartError />}>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart key={`area-${dataVersion}`} data={areaData} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--cream-darker)" />
              <XAxis dataKey="day" tickFormatter={(d) => fmtDateShort(d)} tick={{ fontSize: 11 }} stroke="var(--ink-light)" minTickGap={24} />
              <YAxis tickFormatter={compact} tick={{ fontSize: 11 }} stroke="var(--ink-light)" width={40} />
              <Tooltip formatter={(v) => fmt(Number(v), currency)} labelFormatter={(d) => fmtDateShort(d as string)} />
              <Legend content={renderCategoryLegend} />
              {areaCategories.map((c) => (
                <Area key={c.name} type="monotone" dataKey={c.name} stackId="1" stroke={c.color} fill={c.color} fillOpacity={0.5} />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        </ErrorBoundary>
      </Card>

      {/* Top transactions */}
      <Card title={t('insights.topTitle')} desc={t('insights.topDesc')}>
        {topTxns.length === 0 ? (
          <p className="empty-state-desc" style={{ padding: '12px 0' }}>{t('dashboard.noData')}</p>
        ) : (
          <>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: 'var(--ink-light)' }}>
                    <th style={{ padding: '6px 8px' }}>{t('insights.colDate')}</th>
                    <th style={{ padding: '6px 8px' }}>{t('insights.colCategory')}</th>
                    <th style={{ padding: '6px 8px' }}>{t('insights.colDesc')}</th>
                    <th style={{ padding: '6px 8px', textAlign: 'right' }}>{t('insights.colAmount')}</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleTop.map((tx) => (
                    <tr key={tx.id} style={{ borderTop: '1px solid var(--cream-darker)' }}>
                      <td style={{ padding: '8px', whiteSpace: 'nowrap' }}>
                        <Link to={dateLink(tx.date)} className="insight-link" style={linkStyle}>{fmtDateShort(tx.date)}</Link>
                      </td>
                      <td style={{ padding: '8px' }}>
                        <Link to={categoryLink(tx.category.id)} className="insight-link" style={linkStyle}>{tx.category.name}</Link>
                      </td>
                      <td style={{ padding: '8px', maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        <Link to={`/wallets/${activeWallet.id}/expenses/${tx.id}`} className="insight-link" style={{ ...linkStyle, color: 'var(--ink-mid)' }}>
                          {tx.description ?? '—'}
                        </Link>
                      </td>
                      <td style={{ padding: '8px', textAlign: 'right', fontWeight: 600 }}>{fmt(tx.amount, currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {topTxns.length > DEFAULT_TOP_SHOWN && (
              <button
                onClick={() => setShowAllTop((v) => !v)}
                className="insight-link"
                style={{ marginTop: 12, fontSize: 13, color: 'var(--forest)', background: 'none', border: 'none', fontWeight: 500 }}
              >
                {showAllTop ? t('insights.showLess') : t('insights.viewAll', { count: topTxns.length })}
              </button>
            )}
          </>
        )}
      </Card>
    </div>
  );
}

const legendStyle = { fontSize: 12, fontFamily: 'var(--font-body)', color: 'var(--ink-mid)' };

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{ background: 'white', border: '1px solid var(--cream-darker)', borderRadius: 14, padding: '14px 16px' }}>
      <div style={{ fontSize: 12, color: 'var(--ink-light)' }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--ink)', marginTop: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--ink-light)', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function Card({ title, desc, children }: { title: string; desc?: string; children: ReactNode }) {
  return (
    <div style={{ background: 'white', border: '1px solid var(--cream-darker)', borderRadius: 14, padding: 20, marginBottom: 20 }}>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--ink)' }}>{title}</h2>
        {desc && <p style={{ fontSize: 12.5, color: 'var(--ink-light)', marginTop: 8 }}>{desc}</p>}
      </div>
      {children}
    </div>
  );
}

function ChartError() {
  return (
    <div className="empty-state" style={{ padding: '32px 16px' }}>
      <p className="empty-state-desc">Chart unavailable</p>
    </div>
  );
}
