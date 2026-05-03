const cache = new Map<string, { rate: number; ts: number }>();
const TTL = 60 * 60 * 1000; // 1 hour

let currenciesCache: string[] | null = null;

export async function getSupportedCurrencies(): Promise<string[]> {
  if (currenciesCache) return currenciesCache;
  try {
    const res = await fetch('https://open.er-api.com/v6/latest/USD');
    if (!res.ok) return [];
    const data = await res.json() as { result: string; rates: Record<string, number> };
    if (data.result !== 'success') return [];
    currenciesCache = Object.keys(data.rates).sort();
    return currenciesCache;
  } catch {
    return [];
  }
}

export async function getExchangeRate(from: string, to: string): Promise<number | null> {
  if (from === to) return 1;

  const key = `${from}:${to}`;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.ts < TTL) return cached.rate;

  try {
    const res = await fetch(`https://open.er-api.com/v6/latest/${from}`);
    if (!res.ok) return null;
    const data = await res.json() as { result: string; rates: Record<string, number> };
    if (data.result !== 'success') return null;
    const rate = data.rates[to];
    if (rate == null) return null;
    cache.set(key, { rate, ts: Date.now() });
    return rate;
  } catch {
    return null;
  }
}
