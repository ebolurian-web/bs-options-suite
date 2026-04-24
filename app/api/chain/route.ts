import { NextResponse } from "next/server";
import { fetchCboeChain } from "@/lib/cboe";
import type { ApiError } from "@/lib/types";

/**
 * GET /api/chain?ticker=AAPL
 * Returns the full options chain + underlying quote via CBOE public feed.
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
    return NextResponse.json(chain, {
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120",
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
