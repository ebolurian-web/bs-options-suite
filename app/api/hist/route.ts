import { NextResponse } from "next/server";
import { fetchHistoricalSeries } from "@/lib/polygon";
import type { ApiError } from "@/lib/types";

/**
 * GET /api/hist?ticker=AAPL&days=365
 * Daily historical aggregates + annualized realized volatility via Polygon.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const ticker = searchParams.get("ticker");
  const daysParam = searchParams.get("days");
  const days = daysParam ? Math.max(30, Math.min(1825, Number(daysParam))) : 365;

  if (!ticker) {
    return NextResponse.json<ApiError>(
      { error: { code: "bad_request", message: "Missing ?ticker" } },
      { status: 400 },
    );
  }
  try {
    const series = await fetchHistoricalSeries(ticker, days);
    return NextResponse.json(series, {
      headers: {
        "Cache-Control": "public, s-maxage=600, stale-while-revalidate=1200",
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown";
    const isRate = /rate limit/i.test(msg);
    return NextResponse.json<ApiError>(
      {
        error: {
          code: isRate ? "rate_limited" : "upstream_failed",
          message: msg,
        },
      },
      { status: isRate ? 429 : 502 },
    );
  }
}
