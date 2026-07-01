import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { Wallet, X } from 'lucide-react';
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
import { expenses as expensesApi, categories as categoriesApi } from '../lib/api';
import { useWallet } from '../contexts/WalletContext';
import type { CategoryResponse, TransactionAnalytics, TransactionResponse } from '../lib/types';
import { fmt, fmtDateShort } from '../lib/utils';
import { DatePicker } from '../components/ui/DatePicker';
import { Select } from '../components/ui/Select';
import { Modal } from '../components/ui/Modal';
import { Button } from '../components/ui/Button';
import { MultiCategorySelect } from '../components/ui/MultiCategorySelect';
import { CategoryIcon } from '../lib/categoryIcons';
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
const DRAWER_WIDTH = 380;
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

function cumulativeByOffset(byDay: { day: string; total: number }[], start: Date) {
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

// Daily totals, optionally narrowed to selected categories (uses by_day_category pivot)
function dailyTotals(
  byDay: TransactionAnalytics['by_day'],
  byDayCategory: TransactionAnalytics['by_day_category'],
  categoryIds: string[],
): { day: string; total: number }[] {
  if (categoryIds.length === 0) return byDay;
  const set = new Set(categoryIds);
  const map = new Map<string, number>();
  for (const r of byDayCategory) {
    if (!set.has(r.category_id)) continue;
    map.set(r.day, (map.get(r.day) ?? 0) + r.total);
  }
  return [...map.entries()].map(([day, total]) => ({ day, total }));
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
  const [periodModalOpen, setPeriodModalOpen] = useState(false);
  const [draftStart, setDraftStart] = useState('');
  const [draftEnd, setDraftEnd] = useState('');
  const [analytics, setAnalytics] = useState<TransactionAnalytics | null>(null);
  const [prevAnalytics, setPrevAnalytics] = useState<TransactionAnalytics | null>(null);
  const [topTxns, setTopTxns] = useState<TransactionResponse[]>([]);
  const [showAllTop, setShowAllTop] = useState(false);
  const [loading, setLoading] = useState(true);
  const [dataVersion, setDataVersion] = useState(0);
  const [isMobile, setIsMobile] = useState(false);
  const [categories, setCategories] = useState<CategoryResponse[]>([]);
  const [lineCategoryIds, setLineCategoryIds] = useState<string[]>([]);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [dayTxns, setDayTxns] = useState<TransactionResponse[]>([]);
  const [dayLoading, setDayLoading] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 640px)');
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    categoriesApi.list().then(setCategories).catch(() => {});
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

  const openCustomModal = () => {
    const fallback = presetRange('this_month');
    setDraftStart(customStart || localDate(fallback.start));
    setDraftEnd(customEnd || localDate(fallback.end));
    setPeriodModalOpen(true);
  };

  const handlePresetChange = (v: string) => {
    if (v === 'custom') {
      openCustomModal();
      return;
    }
    setPreset(v as Preset);
  };

  const applyCustom = () => {
    setCustomStart(draftStart);
    setCustomEnd(draftEnd);
    setPreset('custom');
    setPeriodModalOpen(false);
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
    const curDaily = dailyTotals(analytics?.by_day ?? [], analytics?.by_day_category ?? [], lineCategoryIds);
    const prevDaily = dailyTotals(prevAnalytics?.by_day ?? [], prevAnalytics?.by_day_category ?? [], lineCategoryIds);
    const cur = cumulativeByOffset(curDaily, start);
    const prevRange = previousRange(start, end);
    const prev = cumulativeByOffset(prevDaily, prevRange.start);
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
  }, [analytics, prevAnalytics, start, end, lineCategoryIds]);

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
  const [heatWidth, setHeatWidth] = useState(0);
  const roRef = useRef<ResizeObserver | null>(null);
  // Callback ref: the heatmap node only mounts once activeWallet resolves, so a
  // mount-time effect can miss it. Attach the observer whenever the node appears.
  const heatRef = useCallback((el: HTMLDivElement | null) => {
    roRef.current?.disconnect();
    if (!el) return;
    const ro = new ResizeObserver((entries) => setHeatWidth(entries[0].contentRect.width));
    ro.observe(el);
    roRef.current = ro;
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

  // Day drawer (desktop): fetch the clicked day's transactions, scoped to type + selected categories
  useEffect(() => {
    if (!activeWallet || !selectedDay) return;
    setDayLoading(true);
    const dayStart = parseDay(selectedDay);
    const dayEnd = new Date(dayStart.getFullYear(), dayStart.getMonth(), dayStart.getDate(), 23, 59, 59, 999);
    expensesApi
      .list(activeWallet.id, {
        start_date: dayStart.toISOString(),
        end_date: dayEnd.toISOString(),
        type,
        category_ids: lineCategoryIds.length > 0 ? lineCategoryIds : undefined,
        sort_by: 'amount',
        sort_order: 'desc',
        page: 1,
        page_size: 100,
      })
      .then((res) => setDayTxns(res.items))
      .catch(() => setDayTxns([]))
      .finally(() => setDayLoading(false));
  }, [activeWallet, selectedDay, type, lineCategoryIds]);

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
  const cell = Math.max(13, Math.min(30, rawCell));
  const WEEKDAYS =[t('insights.sun'), t('insights.mon'), t('insights.tue'), t('insights.wed'), t('insights.thu'), t('insights.fri'), t('insights.sat')];

  const showTip = (c: { iso: string; total: number }, el: HTMLElement, pin: boolean) => {
    const r = el.getBoundingClientRect();
    pinnedRef.current = pin;
    setTip({ iso: c.iso, total: c.total, x: r.left + r.width / 2, y: r.top - 6 });
  };

  const visibleTop = showAllTop ? topTxns : topTxns.slice(0, DEFAULT_TOP_SHOWN);
  const rangeParams = `category_ids=__CAT__&start_date=${localDate(start)}&end_date=${localDate(end)}&type=${type}`;
  const categoryLink = (catId: string) =>
    `/wallets/${activeWallet.id}?${rangeParams.replace('__CAT__', catId)}`;
  const dateLink = (iso: string) => {
    const d = parseDay(iso);
    return `/wallets/${activeWallet.id}?start_date=${localDate(d)}&end_date=${localDate(d)}&type=${type}`;
  };
  const linkStyle = { color: 'var(--forest)' } as const;

  const cumulativeTitle = type === 'income' ? t('insights.cumulativeTitleIncome') : t('insights.cumulativeTitle');
  const cumulativeDesc = type === 'income' ? t('insights.cumulativeDescIncome') : t('insights.cumulativeDesc');

  // Only offer categories that actually have data this period
  const presentCategoryIds = new Set((analytics?.by_day_category ?? []).map((r) => r.category_id));
  const lineCategoryOptions = categories.filter((c) => presentCategoryIds.has(c.id));

  // Map a cumulative-chart X value (day offset + 1) back to an ISO date in the current period
  const startOnly = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const offsetToIso = (offset: number) => {
    const d = new Date(startOnly);
    d.setDate(d.getDate() + offset);
    return localDate(d);
  };
  // Local-day ISO bounds — matches how the chart buckets days (DB date_trunc in session tz)
  const dayBoundsISO = (iso: string) => {
    const d = parseDay(iso);
    return {
      start: d.toISOString(),
      end: new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999).toISOString(),
    };
  };
  const dayFilterLink = (iso: string) => {
    const { start: s, end: e } = dayBoundsISO(iso);
    const p = new URLSearchParams();
    p.set('start_date', s);
    p.set('end_date', e);
    p.set('type', type);
    for (const id of lineCategoryIds) p.append('category_ids', id);
    return `/wallets/${activeWallet.id}?${p.toString()}`;
  };
  const handleLineClick = (state: { activeLabel?: string | number }) => {
    if (state?.activeLabel == null) return;
    const iso = offsetToIso(Number(state.activeLabel) - 1);
    if (isMobile) navigate(dayFilterLink(iso));
    else setSelectedDay(iso);
  };

  const typeToggle = (
    <div style={{ display: 'flex', gap: 6 }}>
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
  );

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
    <div
      className="animate-fade-in"
      style={{
        ...(isMobile ? { paddingBottom: 'calc(60px + env(safe-area-inset-bottom, 0px) + 64px)' } : null),
        ...(!isMobile && selectedDay ? { paddingRight: DRAWER_WIDTH } : null),
        transition: 'padding-right 0.2s ease',
      }}
    >
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(26px, 4vw, 36px)', color: 'var(--ink)', fontStyle: 'italic' }}>
          {t('insights.title')}
        </h1>
        <p style={{ fontSize: 14, color: 'var(--ink-light)', marginTop: 4 }}>{t('insights.subtitle')}</p>
      </div>

      {/* Filter bar */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 24, alignItems: 'center' }}>
        <div style={{ width: 180 }}>
          <Select
            value={preset}
            onChange={handlePresetChange}
            options={PRESETS.map((p) => ({ value: p, label: t(`insights.preset.${p}`) }))}
          />
        </div>
        {preset === 'custom' && (
          <button
            onClick={openCustomModal}
            style={{
              padding: '6px 13px',
              borderRadius: 999,
              fontSize: 13,
              lineHeight: 1.4,
              border: '1px solid var(--cream-darker)',
              background: 'white',
              color: 'var(--ink-mid)',
              cursor: 'pointer',
            }}
          >
            {`${fmtDateShort(localDate(start))} ${t('insights.rangeTo')} ${fmtDateShort(localDate(end))}`}
          </button>
        )}
        {!isMobile && <div style={{ marginLeft: 'auto' }}>{typeToggle}</div>}
      </div>

      {/* Custom range modal */}
      <Modal
        open={periodModalOpen}
        onClose={() => setPeriodModalOpen(false)}
        title={t('insights.preset.custom')}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setPeriodModalOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={applyCustom} disabled={!draftStart || !draftEnd || draftStart > draftEnd}>
              {t('common.apply')}
            </Button>
          </>
        }
      >
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <DatePicker value={draftStart} onChange={setDraftStart} />
          <span style={{ fontSize: 13, color: 'var(--ink-light)' }}>{t('insights.rangeTo')}</span>
          <DatePicker value={draftEnd} onChange={setDraftEnd} />
        </div>
      </Modal>

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

      {/* Cumulative line */}
      <Card title={cumulativeTitle} desc={cumulativeDesc}>
        <div style={{ marginBottom: 24 }}>
          <MultiCategorySelect
            value={lineCategoryIds}
            categories={lineCategoryOptions}
            onChange={setLineCategoryIds}
            placeholder={t('insights.allCategories')}
          />
        </div>
        {loading ? (
          <ChartSkeleton height={280} />
        ) : (
          <ErrorBoundary fallback={<ChartError />}>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart key={`cum-${dataVersion}`} data={cumulativeData} margin={{ top: 8, right: 12, bottom: 4, left: 4 }} onClick={handleLineClick} style={{ cursor: 'pointer' }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--cream-darker)" />
                <XAxis dataKey="day" tick={{ fontSize: 11 }} stroke="var(--ink-light)" interval={isMobile ? 4 : 'preserveStartEnd'} />
                <YAxis tickFormatter={compact} tick={{ fontSize: 11 }} stroke="var(--ink-light)" width={40} />
                <Tooltip formatter={(v) => fmt(Number(v), currency)} labelFormatter={(l) => t('insights.dayN', { n: l })} />
                <Legend wrapperStyle={legendStyle} />
                <Line type="monotone" dataKey="previous" name={t('insights.prevPeriod')} stroke="var(--ink-light)" strokeDasharray="4 4" dot={false} connectNulls isAnimationActive={false} />
                <Line type="monotone" dataKey="current" name={t('insights.thisPeriod')} stroke="var(--forest)" strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </ErrorBoundary>
        )}
      </Card>

      {/* Calendar heatmap */}
      <Card title={t('insights.heatmapTitle')} desc={t('insights.heatmapDesc')}>
        {loading && <ChartSkeleton height={160} />}
        <div ref={heatRef} style={{ overflowX: 'auto', paddingBottom: 4, display: loading ? 'none' : undefined }}>
          <div style={{ width: 'fit-content', margin: '0 auto' }}>
            {/* Month labels */}
            <div style={{ display: 'flex', gap: GAP, marginLeft: LABEL_W, marginBottom: 4, height: 14 }}>
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
                  <div key={i} style={{ height: cell, fontSize: 10, color: 'var(--ink-light)', display: 'flex', alignItems: 'center', justifyContent: 'flex-start' }}>
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
                          // Desktop: tooltip already shown on hover, click opens the day drawer.
                          // Touch: first tap shows tooltip, second tap on the same cell navigates.
                          if (canHover || (pinnedRef.current && tip?.iso === c.iso)) {
                            if (isMobile) navigate(dayFilterLink(c.iso));
                            else setSelectedDay(c.iso);
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
        {loading ? (
          <ChartSkeleton height={300} />
        ) : (
          <ErrorBoundary fallback={<ChartError />}>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart key={`area-${dataVersion}`} data={areaData} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--cream-darker)" />
                <XAxis dataKey="day" tickFormatter={(d) => fmtDateShort(d)} tick={{ fontSize: 11 }} stroke="var(--ink-light)" minTickGap={24} />
                <YAxis tickFormatter={compact} tick={{ fontSize: 11 }} stroke="var(--ink-light)" width={40} />
                <Tooltip formatter={(v) => fmt(Number(v), currency)} labelFormatter={(d) => fmtDateShort(d as string)} />
                <Legend content={renderCategoryLegend} />
                {areaCategories.map((c) => (
                  <Area key={c.name} type="monotone" dataKey={c.name} stackId="1" stroke={c.color} fill={c.color} fillOpacity={0.5} isAnimationActive={false} />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          </ErrorBoundary>
        )}
      </Card>

      {/* Top transactions */}
      <Card title={t('insights.topTitle')} desc={t('insights.topDesc')}>
        {loading ? (
          <TableSkeleton rows={DEFAULT_TOP_SHOWN} />
        ) : topTxns.length === 0 ? (
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

      {/* Day transactions drawer (desktop) */}
      {!isMobile && selectedDay && (
        <DayDrawer
          iso={selectedDay}
          txns={dayTxns}
          loading={dayLoading}
          currency={currency}
          onClose={() => setSelectedDay(null)}
          onViewAll={() => { navigate(dayFilterLink(selectedDay)); setSelectedDay(null); }}
          onOpenTxn={(id) => navigate(`/wallets/${activeWallet.id}/expenses/${id}`)}
        />
      )}

      {/* Mobile expense/income toolbar */}
      {isMobile && (
        <div
          role="toolbar"
          aria-label={t('insights.expense')}
          style={{
            position: 'fixed',
            bottom: 'calc(60px + env(safe-area-inset-bottom, 0px) + 8px)',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 500,
            display: 'flex',
            gap: 8,
            background: 'white',
            border: '1px solid var(--cream-darker)',
            borderRadius: 100,
            padding: '6px 8px',
            boxShadow: '0 4px 24px rgba(0,0,0,0.12)',
          }}
        >
          {typeToggle}
        </div>
      )}
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

function ChartSkeleton({ height }: { height: number }) {
  return <div className="skeleton" style={{ height, width: '100%', borderRadius: 10 }} aria-hidden />;
}

function TableSkeleton({ rows }: { rows: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '4px 0' }} aria-hidden>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="skeleton" style={{ height: 20, width: '100%', borderRadius: 6 }} />
      ))}
    </div>
  );
}

function DayDrawer({
  iso,
  txns,
  loading,
  currency,
  onClose,
  onViewAll,
  onOpenTxn,
}: {
  iso: string;
  txns: TransactionResponse[];
  loading: boolean;
  currency: string;
  onClose: () => void;
  onViewAll: () => void;
  onOpenTxn: (id: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        bottom: 0,
        width: DRAWER_WIDTH,
        zIndex: 600,
        background: 'white',
        borderLeft: '1px solid var(--cream-darker)',
        display: 'flex',
        flexDirection: 'column',
        animation: 'slideInRight 0.2s ease both',
        willChange: 'transform',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--cream-darker)' }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink)' }}>{fmtDateShort(iso)}</div>
        <button
          onClick={onClose}
          style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--ink-light)', display: 'flex', padding: 4 }}
          aria-label={t('common.cancel')}
        >
          <X size={18} />
        </button>
      </div>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 16 }} aria-hidden>
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="skeleton" style={{ height: 48, borderRadius: 10 }} />
            ))}
          </div>
        ) : txns.length === 0 ? (
          <p className="empty-state-desc" style={{ padding: '24px 20px', textAlign: 'center' }}>{t('insights.drawerEmpty')}</p>
        ) : (
          txns.map((tx) => (
            <div
              key={tx.id}
              onClick={() => onOpenTxn(tx.id)}
              style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px', borderBottom: '1px solid var(--cream)', cursor: 'pointer' }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'var(--cream)'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
            >
              <CategoryIcon
                iconName={tx.category.icon}
                color={tx.category.color}
                size={16}
                containerSize={36}
                borderRadius={10}
                fallbackLetter={tx.category.name[0]}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {tx.description ?? tx.category.name}
                </div>
                <div style={{ fontSize: 12, color: 'var(--ink-faint)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {tx.category.name}
                </div>
              </div>
              <div style={{ fontSize: 14, fontWeight: 600, color: tx.type === 'income' ? 'var(--forest)' : 'var(--ink)', flexShrink: 0 }}>
                {tx.type === 'income' ? '+' : ''}{fmt(tx.amount, currency)}
              </div>
            </div>
          ))
        )}
      </div>
      <div style={{ padding: '12px 20px', borderTop: '1px solid var(--cream-darker)' }}>
        <button
          onClick={onViewAll}
          className="btn btn-secondary btn-md"
          style={{ width: '100%', justifyContent: 'center' }}
        >
          {t('insights.drawerViewAll')}
        </button>
      </div>
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
