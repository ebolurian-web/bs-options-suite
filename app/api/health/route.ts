import { NextResponse } from "next/server";
import { env } from "@/lib/env";

type ProbeResult = {
  name: string;
  url: string;
  ok: boolean;
  status: number | null;
  durationMs: number;
  note?: string;
};

async function probe(name: string, url: string, note?: string): Promise<ProbeResult> {
  const started = Date.now();
  try {
    const res = await fetch(url, {
      cache: "no-store",
      headers: { "User-Agent": "bs-options-suite/0.1 (health-check)" },
      signal: AbortSignal.timeout(5000),
    });
    return {
      name,
      url: url.replace(/apiKey=[^&]+/i, "apiKey=***"),
      ok: res.ok,
      status: res.status,
      durationMs: Date.now() - started,
      note,
    };
  } catch (err) {
    return {
      name,
      url: url.replace(/apiKey=[^&]+/i, "apiKey=***"),
      ok: false,
      status: null,
      durationMs: Date.now() - started,
      note: err instanceof Error ? err.message : "unknown error",
    };
  }
}

export async function GET() {
  let polygonKey: string | null = null;
  try {
    polygonKey = env.polygonApiKey();
  } catch {
    polygonKey = null;
  }

  const probes = await Promise.all([
    probe(
      "cboe.options",
      "https://cdn.cboe.com/api/global/delayed_quotes/options/AAPL.json",
      "primary options data source",
    ),
    polygonKey
      ? probe(
          "polygon.ticker",
          `https://api.polygon.io/v3/reference/tickers/AAPL?apiKey=${polygonKey}`,
          "stock reference data",
        )
      : Promise.resolve<ProbeResult>({
          name: "polygon.ticker",
          url: "(skipped — no POLYGON_API_KEY)",
          ok: false,
          status: null,
          durationMs: 0,
          note: "Add POLYGON_API_KEY to .env.local",
        }),
    probe(
      "marketdata.options",
      "https://api.marketdata.app/v1/options/expirations/AAPL/",
      "fallback options data source",
    ),
  ]);

  const allOk = probes.every((p) => p.ok);

  return NextResponse.json(
    {
      ok: allOk,
      service: "bs-options-suite",
      timestamp: new Date().toISOString(),
      env: {
        node: process.version,
        liveDataEnabled: env.liveDataEnabled(),
        hasPolygonKey: polygonKey !== null,
        hasMarketdataToken: env.marketdataToken() !== null,
      },
      probes,
    },
    { status: allOk ? 200 : 503 },
  );
}
