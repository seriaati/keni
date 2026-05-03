import i18n from './i18n';

function locale(): string {
  return i18n.language ?? 'en';
}

export function fmt(amount: number, currency = 'USD'): string {
  return new Intl.NumberFormat(locale(), {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function fmtDate(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString(locale(), { month: 'short', day: 'numeric', year: 'numeric' });
}

export function fmtDateShort(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString(locale(), { month: 'short', day: 'numeric' });
}

export function fmtRelative(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const days = Math.floor(diff / 86400000);
  const t = i18n.t.bind(i18n);
  if (days === 0) return t('utils.today');
  if (days === 1) return t('utils.yesterday');
  if (days < 7) return t('utils.daysAgo', { count: days });
  return fmtDate(d);
}

export function startOfMonth(): string {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

export function endOfMonth(): string {
  const d = new Date();
  d.setMonth(d.getMonth() + 1, 0);
  d.setHours(23, 59, 59, 999);
  return d.toISOString();
}

export function startOfWeek(): string {
  const d = new Date();
  const day = d.getDay();
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

export type DashboardPeriod = 'this_month' | 'last_month' | 'last_3_months' | 'this_year';

export function getPeriodLabel(period: DashboardPeriod): string {
  const map: Record<DashboardPeriod, string> = {
    this_month: 'utils.periodThisMonth',
    last_month: 'utils.periodLastMonth',
    last_3_months: 'utils.periodLast3Months',
    this_year: 'utils.periodThisYear',
  };
  return i18n.t(map[period]);
}

export const PERIOD_LABELS: Record<DashboardPeriod, string> = {
  this_month: 'This month',
  last_month: 'Last month',
  last_3_months: 'Last 3 months',
  this_year: 'This year',
};

export function getPeriodDateRange(period: DashboardPeriod): { start_date: string; end_date: string } {
  const now = new Date();
  let start: Date;
  let end: Date;
  switch (period) {
    case 'this_month':
      start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
      break;
    case 'last_month':
      start = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
      end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      break;
    case 'last_3_months':
      start = new Date(now.getFullYear(), now.getMonth() - 2, 1, 0, 0, 0, 0);
      end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
      break;
    case 'this_year':
      start = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
      end = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
      break;
  }
  return { start_date: start.toISOString(), end_date: end.toISOString() };
}

export function getPeriodDays(period: DashboardPeriod): number {
  const now = new Date();
  switch (period) {
    case 'this_month':
      return now.getDate();
    case 'last_month':
      return new Date(now.getFullYear(), now.getMonth(), 0).getDate();
    case 'last_3_months': {
      const s = new Date(now.getFullYear(), now.getMonth() - 2, 1);
      const e = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      return Math.round((e.getTime() - s.getTime()) / 86_400_000);
    }
    case 'this_year':
      return Math.round((now.getTime() - new Date(now.getFullYear(), 0, 1).getTime()) / 86_400_000) + 1;
  }
}

export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ');
}

export function truncate(str: string, max: number): string {
  if (str.length <= max) return str;
  return str.slice(0, max) + '…';
}

export function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export const CURRENCIES = [
  'USD', 'EUR', 'GBP', 'JPY', 'CNY', 'AUD', 'CAD', 'CHF', 'HKD', 'SGD',
  'TWD', 'KRW', 'INR', 'BRL', 'MXN', 'SEK', 'NOK', 'DKK', 'NZD', 'ZAR',
  'MYR',
];

export const FREQUENCIES = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'biweekly', label: 'Bi-weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'yearly', label: 'Yearly' },
];

export function getFrequencies(): { value: string; label: string }[] {
  return [
    { value: 'daily', label: i18n.t('utils.freqDaily') },
    { value: 'weekly', label: i18n.t('utils.freqWeekly') },
    { value: 'biweekly', label: i18n.t('utils.freqBiweekly') },
    { value: 'monthly', label: i18n.t('utils.freqMonthly') },
    { value: 'yearly', label: i18n.t('utils.freqYearly') },
  ];
}

export const AI_PROVIDERS = [
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'gemini', label: 'Google Gemini' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'openrouter', label: 'OpenRouter' },
];

export function isEmoji(str: string): boolean {
  if (!str || str.length > 8) return false;
  return /\p{Emoji}/u.test(str);
}
