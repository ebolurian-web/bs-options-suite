import { NextResponse } from "next/server";
import { fetchCboeChain } from "@/lib/cboe";
import type { ApiError, StockQuote } from "@/lib/types";

/**
 * GET /api/quote?ticker=AAPL
 * Light endpoint returning just the underlying quote (pulled from the CBOE
 * options snapshot so we stay on one free-tier source).
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const ticker = searchParams.get("ticker");
  if (!ticker) {
    return NextResponse.json<ApiError>(
      { error: { code: "bad_request", message: "Missing ?ticker" } },
      { status: 400 },
    );
  }
  try {
    const chain = await fetchCboeChain(ticker);
    const payload: { quote: StockQuote; timestamp: string; ageMs: number } = {
      quote: chain.quote,
      timestamp: chain.timestamp,
      ageMs: chain.ageMs,
    };
    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown";
    const isNotFound = /not found/i.test(msg);
    return NextResponse.json<ApiError>(
      {
        error: {
          code: isNotFound ? "not_found" : "upstream_failed",
          message: msg,
        },
      },
      { status: isNotFound ? 404 : 502 },
    );
  }
}
