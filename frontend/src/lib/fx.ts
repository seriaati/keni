const rateCache = new Map<string, { rate: number; ts: number }>();
const RATE_TTL = 60 * 60 * 1000; // 1 hour

let currenciesCache: { codes: string[]; ts: number } | null = null;
const CURRENCY_TTL = 24 * 60 * 60 * 1000; // 24 hours

const BASE = 'https://api.frankfurter.dev/v2';

type RateEntry = { date: string; base: string; quote: string; rate: number };

export async function getSupportedCurrencies(): Promise<string[]> {
  if (currenciesCache && Date.now() - currenciesCache.ts < CURRENCY_TTL) {
    return currenciesCache.codes;
  }
  try {
    const res = await fetch(`${BASE}/currencies`);
    if (!res.ok) return [];
    const data = await res.json() as { iso_code: string }[];
    if (!Array.isArray(data)) return [];
    const codes = data.map((c) => c.iso_code).sort();
    currenciesCache = { codes, ts: Date.now() };
    return codes;
  } catch {
    return [];
  }
}

export async function getExchangeRate(from: string, to: string, date?: string): Promise<number | null> {
  if (from === to) return 1;

  const key = date ? `${from}:${to}:${date}` : `${from}:${to}`;
  const cached = rateCache.get(key);
  if (cached && Date.now() - cached.ts < RATE_TTL) return cached.rate;

  try {
    const params = date
      ? `date=${date}&base=${from}&quotes=${to}`
      : `base=${from}&quotes=${to}`;
    const res = await fetch(`${BASE}/rates?${params}`);
    if (!res.ok) return null;
    const data = await res.json() as RateEntry[];
    if (!Array.isArray(data) || data.length === 0) return null;
    const rate = data[0].rate;
    rateCache.set(key, { rate, ts: Date.now() });
    return rate;
  } catch {
    return null;
  }
}
