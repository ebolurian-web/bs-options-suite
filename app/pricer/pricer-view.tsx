"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ParamInput } from "@/components/param-input";
import { StatsGrid, StatTile } from "@/components/stats-grid";
import { moneynessCall, parityResidual, priceBS } from "@/lib/bs";
import { ApiClientError, fetchChain, fetchHistory } from "@/lib/client";
import type { HistoricalSeries, OptionChain, OptionContract } from "@/lib/types";
import { buildVolSurface, type VolSurface } from "@/lib/vol-surface";
import { ContractBar } from "./contract-bar";
import { HeroQuote } from "./hero-quote";
import { PayoffChart } from "./payoff-chart";
import { VolSurfaceSection } from "./vol-surface-section";

const fmt = (n: number | null | undefined, d = 2) =>
  n == null || !Number.isFinite(n) ? "—" : n.toFixed(d);
const fmtUsd = (n: number | null | undefined) =>
  n == null || !Number.isFinite(n) ? "—" : `$${n.toFixed(2)}`;
const formatParity = (p: number): string =>
  Math.abs(p) < 1e-10 ? "0.0e+0" : p.toExponential(1);

export function PricerView() {
  // ── Market data state ─────────────────────────────────────────────
  const [chain, setChain] = useState<OptionChain | null>(null);
  const [history, setHistory] = useState<HistoricalSeries | null>(null);
  const [volSurface, setVolSurface] = useState<VolSurface | null>(null);
  const [selectedExpiration, setSelectedExpiration] = useState<string | null>(null);
  const [selectedStrike, setSelectedStrike] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // ── Pricing inputs ────────────────────────────────────────────────
  // Seeded from live data when available; editable via Manual overrides.
  const [S, setS] = useState(100);
  const [K, setK] = useState(100);
  const [T, setT] = useState(1);
  const [rPct, setRPct] = useState(4.5);
  const [sigmaPct, setSigmaPct] = useState(25);
  const [qPct, setQPct] = useState(0);

  // σ override baseline — the "market" IV we compare user edits against
  const [baselineSigmaPct, setBaselineSigmaPct] = useState<number | null>(null);

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

  // ── Ticker load ───────────────────────────────────────────────────
  const loadTicker = useCallback(async (ticker: string) => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setBusy(true);
    setError(null);
    try {
      const [chainRes, historyRes] = await Promise.allSettled([
        fetchChain(ticker, ctrl.signal),
        fetchHistory(ticker, 365, ctrl.signal),
      ]);
      if (chainRes.status !== "fulfilled") throw chainRes.reason;
      const c = chainRes.value;
      setChain(c);
      const hist = historyRes.status === "fulfilled" ? historyRes.value : null;
      setHistory(hist);

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
      const atmContract = findContract(c.contracts, atmStrike, firstExpiry, "call");
      const ivPct =
        atmContract?.iv != null && atmContract.iv > 0
          ? atmContract.iv * 100
          : c.quote.iv30 != null
            ? c.quote.iv30 * 100
            : hist?.realizedVol != null
              ? hist.realizedVol * 100
              : 25;
      const clamped = Math.min(300, Math.max(0.5, ivPct));
      setSigmaPct(Number(clamped.toFixed(2)));
      setBaselineSigmaPct(Number(clamped.toFixed(2)));
    } catch (err) {
      if (ctrl.signal.aborted) return;
      const msg =
        err instanceof ApiClientError
          ? err.code === "not_found"
            ? "Ticker not found."
            : err.message
          : err instanceof Error
            ? err.message
            : "Unknown error";
      setError(msg);
    } finally {
      if (!ctrl.signal.aborted) setBusy(false);
    }
  }, []);

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

  // When user changes expiry or strike: update K, T, and seed σ from the
  // newly-selected contract's IV (re-seating the baseline too).
  useEffect(() => {
    if (!chain || !selectedExpiration) return;
    const dte = dteFromExpiration(selectedExpiration);
    setT(Number(Math.max(0.001, dte / 365.25).toFixed(4)));
    if (selectedStrike != null) {
      setK(selectedStrike);
      const contract = findContract(chain.contracts, selectedStrike, selectedExpiration, "call");
      if (contract?.iv != null && contract.iv > 0) {
        const ivPct = Number(Math.min(300, contract.iv * 100).toFixed(2));
        setSigmaPct(ivPct);
        setBaselineSigmaPct(ivPct);
      }
    }
  }, [chain, selectedExpiration, selectedStrike]);

  const strikes = useMemo(
    () => (chain ? uniqueStrikesForExpiration(chain.contracts, selectedExpiration) : []),
    [chain, selectedExpiration],
  );

  const contractLoaded = chain != null;
  const callBE = result ? K + result.call : null;
  const putBE = result ? K - result.put : null;

  return (
    <div className="flex flex-col gap-5">
      {/* HERO ───────────────────────────────────────────────────────── */}
      <HeroQuote
        ticker={chain?.ticker ?? null}
        companyName={null}
        price={chain?.quote.price ?? null}
        previousClose={chain?.quote.previousClose ?? null}
        callPrice={result?.call ?? null}
        putPrice={result?.put ?? null}
        strike={contractLoaded ? K : null}
        dte={contractLoaded ? T * 365.25 : null}
        moneyness={contractLoaded ? moneyness : null}
      />

      {/* CONTRACT BAR ───────────────────────────────────────────────── */}
      <ContractBar
        onSubmit={loadTicker}
        busy={busy}
        error={error}
        expirations={chain?.expirations ?? []}
        selectedExpiration={selectedExpiration}
        onExpirationChange={setSelectedExpiration}
        strikes={strikes}
        selectedStrike={selectedStrike}
        onStrikeChange={setSelectedStrike}
        dataTimestamp={chain?.timestamp ?? null}
        ageMs={chain?.ageMs ?? null}
      />

      {/* GREEKS ─────────────────────────────────────────────────────── */}
      <section aria-labelledby="h-greeks">
        <h2
          id="h-greeks"
          className="mb-2 text-xs font-semibold uppercase tracking-[0.1em]"
          style={{ color: "var(--color-fg-muted)" }}
        >
          The Greeks
        </h2>
        <StatsGrid labelledBy="h-greeks">
          <StatTile
            term="Delta (call)"
            value={result ? fmt(result.greeks.deltaCall, 4) : "—"}
            tone="accent"
            hint={`Put: ${result ? fmt(result.greeks.deltaPut, 4) : "—"}`}
          />
          <StatTile
            term="Gamma"
            value={result ? fmt(result.greeks.gamma, 4) : "—"}
            tone="warn"
            hint="Shared call/put"
          />
          <StatTile
            term="Theta / day (call)"
            value={result ? fmt(result.greeks.thetaCallPerDay, 4) : "—"}
            tone="error"
            hint={`Put: ${result ? fmt(result.greeks.thetaPutPerDay, 4) : "—"}`}
          />
          <StatTile
            term="Vega / 1%"
            value={result ? fmt(result.greeks.vegaPer1Pct, 4) : "—"}
            tone="accent"
            hint="Per 1% σ move"
          />
          <StatTile
            term="Rho / 1% (call)"
            value={result ? fmt(result.greeks.rhoCallPer1Pct, 4) : "—"}
            hint={`Put: ${result ? fmt(result.greeks.rhoPutPer1Pct, 4) : "—"}`}
          />
        </StatsGrid>
      </section>

      {/* σ OVERRIDE STRIP ──────────────────────────────────────────── */}
      <SigmaOverrideStrip
        sigmaPct={sigmaPct}
        onSigmaChange={setSigmaPct}
        baselineSigmaPct={baselineSigmaPct}
      />

      {/* CONTEXT ROW ────────────────────────────────────────────────── */}
      <section
        aria-labelledby="h-context"
        className="rounded-md border p-3"
        style={{ background: "var(--color-surface-1)", borderColor: "var(--color-border)" }}
      >
        <h2 id="h-context" className="sr-only">
          Pricing context
        </h2>
        <dl
          className="grid grid-cols-2 gap-3 text-xs md:grid-cols-4"
          style={{ color: "var(--color-fg-muted)" }}
        >
          <Mini
            label="Moneyness"
            value={moneyness}
            tone={moneyness === "ITM" ? "success" : moneyness === "OTM" ? "error" : "warn"}
          />
          <Mini label="Call Break-Even" value={callBE != null ? fmtUsd(callBE) : "—"} />
          <Mini label="Put Break-Even" value={putBE != null ? fmtUsd(putBE) : "—"} />
          <Mini
            label="Put-Call Parity Δ"
            value={parity == null ? "—" : formatParity(parity)}
            tone={parity != null && Math.abs(parity) < 0.01 ? "success" : "warn"}
          />
        </dl>
      </section>

      {/* PAYOFF ─────────────────────────────────────────────────────── */}
      <section aria-labelledby="h-payoff">
        <h2
          id="h-payoff"
          className="mb-2 text-xs font-semibold uppercase tracking-[0.1em]"
          style={{ color: "var(--color-fg-muted)" }}
        >
          Payoff at Expiry
        </h2>
        <PayoffChart S={S} K={K} callPremium={result?.call ?? 0} putPremium={result?.put ?? 0} />
      </section>

      {/* VOL SURFACE ────────────────────────────────────────────────── */}
      {volSurface && volSurface.expirations.length > 0 && <VolSurfaceSection surface={volSurface} />}

      {/* REALIZED VOL CONTEXT ───────────────────────────────────────── */}
      {history?.realizedVol != null && (
        <p
          className="text-center text-[0.72rem]"
          style={{ color: "var(--color-fg-subtle)" }}
        >
          1-year realized volatility: {(history.realizedVol * 100).toFixed(1)}%
          {chain?.quote.iv30 != null && (
            <> · CBOE IV30: {(chain.quote.iv30 * 100).toFixed(1)}%</>
          )}
        </p>
      )}

      {/* MANUAL OVERRIDES ───────────────────────────────────────────── */}
      <details
        className="rounded-md border"
        style={{ background: "var(--color-surface-1)", borderColor: "var(--color-border)" }}
      >
        <summary
          className="cursor-pointer px-4 py-3 text-xs font-semibold uppercase tracking-[0.1em]"
          style={{ color: "var(--color-fg-muted)" }}
        >
          Manual overrides — Spot / Strike / Time / r / q
        </summary>
        <div
          className="grid gap-4 border-t p-4 md:grid-cols-2 lg:grid-cols-3"
          style={{ borderColor: "var(--color-border)" }}
        >
          <ParamInput id="p-S" label="Spot Price" unit="$" value={S} onChange={setS} min={0.01} max={10000} step={0.01} />
          <ParamInput id="p-K" label="Strike" unit="$" value={K} onChange={setK} min={0.01} max={10000} step={0.5} />
          <ParamInput id="p-T" label="Time to Expiry" unit="yr" value={T} onChange={setT} min={0.001} max={5} step={0.01} />
          <ParamInput id="p-r" label="Risk-Free Rate" unit="%" value={rPct} onChange={setRPct} min={0} max={20} step={0.05} />
          <ParamInput id="p-q" label="Dividend Yield" unit="%" value={qPct} onChange={setQPct} min={0} max={20} step={0.05} />
        </div>
      </details>
    </div>
  );
}

// ── SIGMA OVERRIDE STRIP ────────────────────────────────────────────

function SigmaOverrideStrip({
  sigmaPct,
  onSigmaChange,
  baselineSigmaPct,
}: {
  sigmaPct: number;
  onSigmaChange: (n: number) => void;
  baselineSigmaPct: number | null;
}) {
  const delta = baselineSigmaPct != null ? sigmaPct - baselineSigmaPct : null;
  const divergence =
    delta == null ? null : Math.abs(delta) < 0.05 ? "match" : delta > 0 ? "above" : "below";
  const canReset = baselineSigmaPct != null && Math.abs(sigmaPct - baselineSigmaPct) > 0.01;

  return (
    <section
      aria-labelledby="h-sigma"
      className="rounded-md border p-3"
      style={{
        background: "var(--color-surface-1)",
        borderColor: "var(--color-border)",
      }}
    >
      <h2
        id="h-sigma"
        className="mb-2 text-xs font-semibold uppercase tracking-[0.1em]"
        style={{ color: "var(--color-fg-muted)" }}
      >
        σ — Volatility override
      </h2>
      <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
        <ParamInput
          id="sigma-override"
          label="Volatility σ"
          unit="%"
          value={sigmaPct}
          onChange={onSigmaChange}
          min={0.5}
          max={300}
          step={0.5}
          helpText="This value drives the BS model price and Greeks."
        />
        {baselineSigmaPct != null && (
          <div className="flex items-center gap-3 text-xs">
            <div className="flex flex-col">
              <span
                className="text-[0.62rem] font-semibold uppercase tracking-[0.1em]"
                style={{ color: "var(--color-fg-subtle)" }}
              >
                Market IV
              </span>
              <span
                className="font-mono tabular-nums"
                style={{ color: "var(--color-fg-default)" }}
              >
                {baselineSigmaPct.toFixed(2)}%
              </span>
            </div>
            {delta != null && divergence !== "match" && (
              <div className="flex flex-col">
                <span
                  className="text-[0.62rem] font-semibold uppercase tracking-[0.1em]"
                  style={{ color: "var(--color-fg-subtle)" }}
                >
                  Δ vs market
                </span>
                <span
                  className="font-mono tabular-nums"
                  style={{
                    color: divergence === "above" ? "var(--color-accent)" : "var(--color-error)",
                  }}
                >
                  {delta > 0 ? "+" : ""}
                  {delta.toFixed(2)}pp
                </span>
              </div>
            )}
            <button
              type="button"
              onClick={() => onSigmaChange(baselineSigmaPct)}
              disabled={!canReset}
              className="rounded border px-2 py-1 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-50"
              style={{
                borderColor: "var(--color-border)",
                color: "var(--color-fg-muted)",
              }}
            >
              Reset
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

// ── MINI TILE ───────────────────────────────────────────────────────

function Mini({
  label,
  value,
  tone,
}: {
  label: string;
  value: React.ReactNode;
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
    <div
      className="rounded border px-3 py-2"
      style={{
        borderColor: "var(--color-border)",
        background: "var(--color-surface-2)",
      }}
    >
      <dt
        className="text-[0.62rem] font-semibold uppercase tracking-[0.1em]"
        style={{ color: "var(--color-fg-muted)" }}
      >
        {label}
      </dt>
      <dd
        className="mt-0.5 font-mono font-semibold tabular-nums"
        style={{ color: toneColor }}
      >
        {value}
      </dd>
    </div>
  );
}

// ── HELPERS ─────────────────────────────────────────────────────────

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
  for (const c of contracts) if (c.expiration === expiration) set.add(c.strike);
  return Array.from(set).sort((a, b) => a - b);
}
