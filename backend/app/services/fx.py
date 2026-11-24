from __future__ import annotations

import logging
import time

import httpx

logger = logging.getLogger(__name__)

_RATES_TTL = 3600.0
_rates_cache: dict[str, tuple[dict[str, float], float]] = {}


class FxUnavailableError(Exception):
    pass


async def get_rates(base: str) -> dict[str, float]:
    """Latest rates as units of each quote currency per one ``base``.

    Serves a stale cached entry when the rate API fails, so a short outage doesn't break callers.
    """
    cached = _rates_cache.get(base)
    if cached and time.time() - cached[1] < _RATES_TTL:
        return cached[0]
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(f"https://api.frankfurter.dev/v2/rates?base={base}")
        resp.raise_for_status()
        rates = {item["quote"]: float(item["rate"]) for item in resp.json()}
    except (httpx.HTTPError, ValueError, KeyError, TypeError) as e:
        if cached:
            logger.warning("Exchange rate fetch for %s failed, using stale rates: %s", base, e)
            return cached[0]
        msg = f"Exchange rates for {base} are unavailable"
        raise FxUnavailableError(msg) from e
    _rates_cache[base] = (rates, time.time())
    return rates
