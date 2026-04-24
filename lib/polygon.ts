/**
 * Polygon.io client — used for historical stock aggregates to compute realized
 * volatility and for reference/ticker details. Free-tier key works for all of
 * these endpoints. Options endpoints are not available on the free plan.
 */

import { cached } from "./cache";
import { env } from "./env";
import type { HistoricalBar, HistoricalSeries } from "./types";

const CACHE_TTL_MS = 10 * 60_000; // 10 min — historical doesn't change intraday

type PolygonAggsResponse = {
  status?: string;
  results?: Array<{
    t: number; // unix ms
    o: number;
    h: number;
    l: number;
    c: number;
    v: number;
  }>;
};

/** Fetch daily aggregates for the last N calendar days (default 365). */
export async function fetchHistoricalSeries(
  ticker: string,
  days = 365,
): Promise<HistoricalSeries> {
  const t = ticker.toUpperCase().trim();
  if (!/^[A-Z]{1,6}(\.[A-Z])?$/.test(t)) {
    throw new Error(`Invalid ticker: ${t}`);
  }
  const key = env.polygonApiKey();
  const now = new Date();
  const from = new Date(now.getTime() - days * 86400_000);
  const fmtDate = (d: Date) => d.toISOString().slice(0, 10);
  const url = `https://api.polygon.io/v2/aggs/ticker/${t}/range/1/day/${fmtDate(from)}/${fmtDate(now)}?adjusted=true&sort=asc&limit=500&apiKey=${key}`;

  return cached(`polygon:agg:${t}:${days}`, CACHE_TTL_MS, async () => {
    const res = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (res.status === 429) throw new Error("Polygon rate limit hit");
    if (!res.ok) throw new Error(`Polygon returned ${res.status}`);
    const data = (await res.json()) as PolygonAggsResponse;
    const bars: HistoricalBar[] =
      data.results?.map((r) => ({
        date: new Date(r.t).toISOString().slice(0, 10),
        open: r.o,
        high: r.h,
        low: r.l,
        close: r.c,
        volume: r.v,
      })) ?? [];
    return {
      ticker: t,
      bars,
      realizedVol: computeAnnualizedVol(bars),
      source: "polygon",
    };
  });
}

/** Annualized realized volatility from log returns. */
export function computeAnnualizedVol(bars: HistoricalBar[]): number | null {
  if (bars.length < 10) return null;
  const rets: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    const prev = bars[i - 1].close;
    const cur = bars[i].close;
    if (prev > 0 && cur > 0) rets.push(Math.log(cur / prev));
  }
  if (rets.length < 5) return null;
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const variance =
    rets.reduce((a, b) => a + (b - mean) ** 2, 0) / (rets.length - 1);
  return Math.sqrt(variance * 252);
}
