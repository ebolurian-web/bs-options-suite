"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ParamInput } from "@/components/param-input";
import { StatsGrid, StatTile } from "@/components/stats-grid";
import { TickerSearch } from "@/components/ticker-search";
import { moneynessCall, parityResidual, priceBS } from "@/lib/bs";
import { ApiClientError, fetchChain, fetchHistory } from "@/lib/client";
import type { HistoricalSeries, OptionChain, OptionContract } from "@/lib/types";
import { buildVolSurface, type VolSurface } from "@/lib/vol-surface";
import { PayoffChart } from "./payoff-chart";
import { VolSurfaceSection } from "./vol-surface-section";

const fmt = (n: number | null | undefined, d = 2) =>
  n == null || !Number.isFinite(n) ? "—" : n.toFixed(d);

const fmtUsd = (n: number | null | undefined) =>
  n == null || !Number.isFinite(n) ? "—" : `$${n.toFixed(2)}`;

export function PricerView() {
  // Market data state
  const [chain, setChain] = useState<OptionChain | null>(null);
  const [history, setHistory] = useState<HistoricalSeries | null>(null);
  const [volSurface, setVolSurface] = useState<VolSurface | null>(null);
  const [selectedExpiration, setSelectedExpiration] = useState<string | null>(null);
  const [selectedStrike, setSelectedStrike] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("Enter a ticker to load the live chain.");
  const abortRef = useRef<AbortController | null>(null);

  // Pricing inputs — seeded from live data when available, editable by user
  const [S, setS] = useState(100);
  const [K, setK] = useState(100);
  const [T, setT] = useState(1);
  const [rPct, setRPct] = useState(4.5);
  const [sigmaPct, setSigmaPct] = useState(25);
  const [qPct, setQPct] = useState(0);

  const result = useMemo(
    () => priceBS({ S, K, T, r: rPct / 100, sigma: sigmaPct / 100, q: qPct / 100 }),
    [S, K, T, rPct, sigmaPct, qPct],
  );

  const moneyness = moneynessCall(S, K);
  const parity = result
    ? parityResidual(
        { S, K, T, r: rPct / 100, sigma: sigmaPct / 100, q: qPct / 100 },
        result.call,
        result.put,
      )
    : null;

  // Fetch handler
  const loadTicker = useCallback(async (ticker: string) => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setBusy(true);
    setError(null);
    setStatus(`Loading ${ticker}…`);
    try {
      // Fetch chain (primary) and history (best-effort) in parallel
      const [chainRes, historyRes] = await Promise.allSettled([
        fetchChain(ticker, ctrl.signal),
        fetchHistory(ticker, 365, ctrl.signal),
      ]);
      if (chainRes.status !== "fulfilled") throw chainRes.reason;
      const c = chainRes.value;
      setChain(c);
      const hist = historyRes.status === "fulfilled" ? historyRes.value : null;
      setHistory(hist);

      // Seed inputs from live data
      setS(Number(c.quote.price.toFixed(2)));
      const atmStrike = findNearestStrike(c.contracts, c.quote.price);
      if (atmStrike != null) setK(atmStrike);
      const firstExpiry = c.expirations[0];
      setSelectedExpiration(firstExpiry);
      setSelectedStrike(atmStrike);
      if (firstExpiry) {
        const dte = dteFromExpiration(firstExpiry);
        setT(Number((dte / 365.25).toFixed(4)));
      }
      // Prefer recomputed-from-mid IV at ATM strike; fall back to provider IV; fall back to realized
      const atmContract = findContract(c.contracts, atmStrike, firstExpiry, "call");
      const ivPct =
        atmContract?.iv != null && atmContract.iv > 0
          ? atmContract.iv * 100
          : c.quote.iv30 != null
            ? c.quote.iv30 * 100
            : hist?.realizedVol != null
              ? hist.realizedVol * 100
              : sigmaPct;
      setSigmaPct(Number(Math.min(300, Math.max(0.5, ivPct)).toFixed(2)));

      setStatus(
        `${c.ticker} @ $${c.quote.price.toFixed(2)} · ${c.contracts.length} contracts across ${c.expirations.length} expiries · data age ${Math.round(c.ageMs / 1000)}s`,
      );
    } catch (err) {
      if (ctrl.signal.aborted) return;
      const msg =
        err instanceof ApiClientError
          ? err.code === "not_found"
            ? `Ticker not found.`
            : err.message
          : err instanceof Error
            ? err.message
            : "Unknown error";
      setError(msg);
      setStatus("");
    } finally {
      if (!ctrl.signal.aborted) setBusy(false);
    }
  }, [sigmaPct]);

  // Rebuild vol surface when chain, rate, or dividend yield changes
  useEffect(() => {
    if (!chain) {
      setVolSurface(null);
      return;
    }
    try {
      const surface = buildVolSurface({
        chain,
        riskFreeRate: rPct / 100,
        dividendYield: qPct / 100,
      });
      setVolSurface(surface);
    } catch {
      setVolSurface(null);
    }
  }, [chain, rPct, qPct]);

  // Re-seed inputs when user changes expiration or strike from dropdowns
  useEffect(() => {
    if (!chain || !selectedExpiration) return;
    const dte = dteFromExpiration(selectedExpiration);
    setT(Number(Math.max(0.001, dte / 365.25).toFixed(4)));
    if (selectedStrike != null) {
      setK(selectedStrike);
      const contract = findContract(
        chain.contracts,
        selectedStrike,
        selectedExpiration,
        "call",
      );
      if (contract?.iv != null && contract.iv > 0) {
        setSigmaPct(Number(Math.min(300, contract.iv * 100).toFixed(2)));
      }
    }
  }, [chain, selectedExpiration, selectedStrike]);

  return (
    <div className="grid gap-6 md:grid-cols-[360px_1fr]">
      {/* LEFT: Ticker + Parameters */}
      <section aria-labelledby="h-parameters" className="space-y-5">
        <div
          className="rounded-md border p-4"
          style={{ background: "var(--color-surface-1)", borderColor: "var(--color-border)" }}
        >
          <TickerSearch
            onSubmit={loadTicker}
            busy={busy}
            error={error}
            status={status}
          />
        </div>

        {chain && (
          <div
            className="rounded-md border p-4"
            style={{ background: "var(--color-surface-1)", borderColor: "var(--color-border)" }}
          >
            <h2
              id="h-contract"
              className="mb-3 text-xs font-semibold uppercase tracking-wide"
              style={{ color: "var(--color-fg-muted)" }}
            >
              Contract selection
            </h2>
            <div className="grid gap-3">
              <div className="grid gap-1">
                <label
                  htmlFor="expiry-select"
                  className="text-xs font-medium uppercase tracking-wide"
                  style={{ color: "var(--color-fg-muted)" }}
                >
                  Expiration
                </label>
                <select
                  id="expiry-select"
                  value={selectedExpiration ?? ""}
                  onChange={(e) => setSelectedExpiration(e.target.value)}
                  className="rounded border px-2 py-1.5 text-sm"
                  style={{
                    background: "var(--color-surface-2)",
                    borderColor: "var(--color-border)",
                    color: "var(--color-fg-default)",
                  }}
                >
                  {chain.expirations.map((exp) => {
                    const dte = Math.round(dteFromExpiration(exp));
                    return (
                      <option key={exp} value={exp}>
                        {exp} ({dte}d)
                      </option>
                    );
                  })}
                </select>
              </div>
              <div className="grid gap-1">
                <label
                  htmlFor="strike-select"
                  className="text-xs font-medium uppercase tracking-wide"
                  style={{ color: "var(--color-fg-muted)" }}
                >
                  Strike
                </label>
                <select
                  id="strike-select"
                  value={selectedStrike ?? ""}
                  onChange={(e) => setSelectedStrike(Number(e.target.value))}
                  className="rounded border px-2 py-1.5 text-sm"
                  style={{
                    background: "var(--color-surface-2)",
                    borderColor: "var(--color-border)",
                    color: "var(--color-fg-default)",
                  }}
                >
                  {uniqueStrikesForExpiration(chain.contracts, selectedExpiration).map((k) => (
                    <option key={k} value={k}>
                      ${k.toFixed(2)}
                    </option>
                  ))}
                </select>
              </div>
              {history?.realizedVol != null && (
                <p className="text-[0.7rem]" style={{ color: "var(--color-fg-subtle)" }}>
                  1-year realized vol: {(history.realizedVol * 100).toFixed(1)}%
                  {chain.quote.iv30 != null && (
                    <> · CBOE IV30: {(chain.quote.iv30 * 100).toFixed(1)}%</>
                  )}
                </p>
              )}
            </div>
          </div>
        )}

        <h2
          id="h-parameters"
          className="text-sm font-semibold uppercase tracking-wide"
          style={{ color: "var(--color-fg-muted)" }}
        >
          Parameters
        </h2>
        <div
          className="space-y-4 rounded-md border p-4"
          style={{ background: "var(--color-surface-1)", borderColor: "var(--color-border)" }}
        >
          <ParamInput id="p-S" label="Spot Price" unit="$" value={S} onChange={setS} min={0.01} max={10000} step={0.01} />
          <ParamInput id="p-K" label="Strike" unit="$" value={K} onChange={setK} min={0.01} max={10000} step={0.5} />
          <ParamInput id="p-T" label="Time to Expiry" unit="yr" value={T} onChange={setT} min={0.001} max={5} step={0.01} />
          <ParamInput id="p-r" label="Risk-Free Rate" unit="%" value={rPct} onChange={setRPct} min={0} max={20} step={0.05} />
          <ParamInput id="p-sigma" label="Volatility σ" unit="%" value={sigmaPct} onChange={setSigmaPct} min={0.5} max={300} step={0.5} />
          <ParamInput id="p-q" label="Dividend Yield" unit="%" value={qPct} onChange={setQPct} min={0} max={20} step={0.05} />
        </div>
      </section>

      {/* RIGHT: Results */}
      <section aria-labelledby="h-results" className="min-w-0">
        <h2
          id="h-results"
          className="mb-3 text-sm font-semibold uppercase tracking-wide"
          style={{ color: "var(--color-fg-muted)" }}
        >
          Results
        </h2>

        {/* Prices + context */}
        <section aria-labelledby="h-prices" className="mb-5">
          <h3 id="h-prices" className="sr-only">Option prices</h3>
          <div className="grid grid-cols-2 gap-3">
            <PriceTile label="Call Price" value={fmtUsd(result?.call)} tone="accent" />
            <PriceTile label="Put Price" value={fmtUsd(result?.put)} tone="error" />
          </div>
          <dl
            className="mt-3 grid grid-cols-2 gap-2 text-xs md:grid-cols-4"
            style={{ color: "var(--color-fg-muted)" }}
          >
            <Mini label="Moneyness" value={moneyness} tone={moneyness === "ITM" ? "success" : moneyness === "OTM" ? "error" : "warn"} />
            <Mini label="Call Break-Even" value={result ? fmtUsd(K + result.call) : "—"} />
            <Mini label="Put Break-Even" value={result ? fmtUsd(K - result.put) : "—"} />
            <Mini
              label="Parity Δ"
              value={parity == null ? "—" : parity.toExponential(1)}
              tone={parity != null && Math.abs(parity) < 0.01 ? "success" : "warn"}
            />
          </dl>
        </section>

        {/* Greeks */}
        <section aria-labelledby="h-greeks" className="mb-5">
          <h3
            id="h-greeks"
            className="mb-2 text-sm font-semibold uppercase tracking-wide"
            style={{ color: "var(--color-fg-muted)" }}
          >
            The Greeks
          </h3>
          <StatsGrid labelledBy="h-greeks">
            <StatTile term="Delta (call)" value={result ? fmt(result.greeks.deltaCall, 4) : "—"} tone="accent" hint={`Put: ${result ? fmt(result.greeks.deltaPut, 4) : "—"}`} />
            <StatTile term="Gamma" value={result ? fmt(result.greeks.gamma, 4) : "—"} tone="warn" hint="Shared call/put" />
            <StatTile term="Theta / day (call)" value={result ? fmt(result.greeks.thetaCallPerDay, 4) : "—"} tone="error" hint={`Put: ${result ? fmt(result.greeks.thetaPutPerDay, 4) : "—"}`} />
            <StatTile term="Vega / 1%" value={result ? fmt(result.greeks.vegaPer1Pct, 4) : "—"} tone="accent" hint="Per 1% σ move" />
            <StatTile term="Rho / 1% (call)" value={result ? fmt(result.greeks.rhoCallPer1Pct, 4) : "—"} hint={`Put: ${result ? fmt(result.greeks.rhoPutPer1Pct, 4) : "—"}`} />
          </StatsGrid>
        </section>

        {/* Payoff */}
        <section aria-labelledby="h-payoff" className="mb-6">
          <h3
            id="h-payoff"
            className="mb-2 text-sm font-semibold uppercase tracking-wide"
            style={{ color: "var(--color-fg-muted)" }}
          >
            Payoff at Expiry
          </h3>
          <PayoffChart S={S} K={K} callPremium={result?.call ?? 0} putPremium={result?.put ?? 0} />
        </section>

        {/* Volatility surface — only when a chain is loaded */}
        {volSurface && volSurface.expirations.length > 0 && (
          <VolSurfaceSection surface={volSurface} />
        )}
      </section>
    </div>
  );
}

function PriceTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "accent" | "error";
}) {
  const color = tone === "accent" ? "var(--color-accent)" : "var(--color-error)";
  return (
    <div
      className="rounded-md border p-4 text-center"
      style={{ background: "var(--color-surface-1)", borderColor: "var(--color-border)" }}
    >
      <div
        className="text-[0.68rem] font-semibold uppercase tracking-[0.08em]"
        style={{ color: "var(--color-fg-muted)" }}
      >
        {label}
      </div>
      <div
        className="mt-1 text-3xl font-bold tabular-nums"
        style={{ color, fontFamily: "var(--font-libre), serif" }}
      >
        {value}
      </div>
    </div>
  );
}

function Mini({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "success" | "warn" | "error" | "accent";
}) {
  const toneColor =
    tone === "success"
      ? "var(--color-success)"
      : tone === "warn"
        ? "var(--color-warn)"
        : tone === "error"
          ? "var(--color-error)"
          : tone === "accent"
            ? "var(--color-accent)"
            : "var(--color-fg-default)";
  return (
    <div className="rounded border px-3 py-2" style={{ borderColor: "var(--color-border)" }}>
      <dt className="uppercase tracking-wide">{label}</dt>
      <dd className="mt-0.5 font-mono font-semibold tabular-nums" style={{ color: toneColor }}>
        {value}
      </dd>
    </div>
  );
}

// ── helpers ─────────────────────────────────────────────────────────────

function dteFromExpiration(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1, d, 20, 0, 0));
  return Math.max(0.001, (target.getTime() - Date.now()) / 86400_000);
}

function findNearestStrike(contracts: OptionContract[], price: number): number | null {
  if (!contracts.length) return null;
  const strikes = Array.from(new Set(contracts.map((c) => c.strike))).sort((a, b) => a - b);
  let best = strikes[0];
  let bestDiff = Math.abs(price - best);
  for (const k of strikes) {
    const d = Math.abs(price - k);
    if (d < bestDiff) {
      best = k;
      bestDiff = d;
    }
  }
  return best;
}

function findContract(
  contracts: OptionContract[],
  strike: number | null,
  expiration: string | null,
  type: "call" | "put",
): OptionContract | undefined {
  if (strike == null || !expiration) return undefined;
  return contracts.find(
    (c) => c.strike === strike && c.expiration === expiration && c.type === type,
  );
}

function uniqueStrikesForExpiration(
  contracts: OptionContract[],
  expiration: string | null,
): number[] {
  if (!expiration) return [];
  const set = new Set<number>();
  for (const c of contracts) {
    if (c.expiration === expiration) set.add(c.strike);
  }
  return Array.from(set).sort((a, b) => a - b);
}
