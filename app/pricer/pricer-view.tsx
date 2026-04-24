"use client";

import { useMemo, useState } from "react";
import { ParamInput } from "@/components/param-input";
import { StatsGrid, StatTile } from "@/components/stats-grid";
import { moneynessCall, parityResidual, priceBS } from "@/lib/bs";
import { PayoffChart } from "./payoff-chart";

const fmt = (n: number | null | undefined, d = 2) =>
  n == null || !Number.isFinite(n) ? "—" : n.toFixed(d);

const fmtUsd = (n: number | null | undefined) =>
  n == null || !Number.isFinite(n) ? "—" : `$${n.toFixed(2)}`;

export function PricerView() {
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
    ? parityResidual({ S, K, T, r: rPct / 100, sigma: sigmaPct / 100, q: qPct / 100 }, result.call, result.put)
    : null;

  return (
    <div className="grid gap-6 md:grid-cols-[360px_1fr]">
      {/* PARAMETERS */}
      <section aria-labelledby="h-parameters">
        <h2
          id="h-parameters"
          className="mb-3 text-sm font-semibold uppercase tracking-wide"
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

      {/* RESULTS */}
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
          <h3 id="h-prices" className="sr-only">
            Option prices
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <div
              className="rounded-md border p-4 text-center"
              style={{ background: "var(--color-surface-1)", borderColor: "var(--color-border)" }}
            >
              <div
                className="text-[0.68rem] font-semibold uppercase tracking-[0.08em]"
                style={{ color: "var(--color-fg-muted)" }}
              >
                Call Price
              </div>
              <div
                className="mt-1 text-3xl font-bold tabular-nums"
                style={{ color: "var(--color-success)", fontFamily: "var(--font-libre), serif" }}
              >
                {fmtUsd(result?.call)}
              </div>
            </div>
            <div
              className="rounded-md border p-4 text-center"
              style={{ background: "var(--color-surface-1)", borderColor: "var(--color-border)" }}
            >
              <div
                className="text-[0.68rem] font-semibold uppercase tracking-[0.08em]"
                style={{ color: "var(--color-fg-muted)" }}
              >
                Put Price
              </div>
              <div
                className="mt-1 text-3xl font-bold tabular-nums"
                style={{ color: "var(--color-error)", fontFamily: "var(--font-libre), serif" }}
              >
                {fmtUsd(result?.put)}
              </div>
            </div>
          </div>

          <dl
            className="mt-3 grid grid-cols-2 gap-2 text-xs md:grid-cols-4"
            style={{ color: "var(--color-fg-muted)" }}
          >
            <div className="rounded border px-3 py-2" style={{ borderColor: "var(--color-border)" }}>
              <dt className="uppercase tracking-wide">Moneyness</dt>
              <dd
                className="mt-0.5 font-semibold"
                style={{
                  color:
                    moneyness === "ITM"
                      ? "var(--color-success)"
                      : moneyness === "OTM"
                        ? "var(--color-error)"
                        : "var(--color-warn)",
                }}
              >
                {moneyness}
              </dd>
            </div>
            <div className="rounded border px-3 py-2" style={{ borderColor: "var(--color-border)" }}>
              <dt className="uppercase tracking-wide">Call Break-Even</dt>
              <dd className="mt-0.5 font-mono font-semibold tabular-nums" style={{ color: "var(--color-fg-default)" }}>
                {result ? fmtUsd(K + result.call) : "—"}
              </dd>
            </div>
            <div className="rounded border px-3 py-2" style={{ borderColor: "var(--color-border)" }}>
              <dt className="uppercase tracking-wide">Put Break-Even</dt>
              <dd className="mt-0.5 font-mono font-semibold tabular-nums" style={{ color: "var(--color-fg-default)" }}>
                {result ? fmtUsd(K - result.put) : "—"}
              </dd>
            </div>
            <div className="rounded border px-3 py-2" style={{ borderColor: "var(--color-border)" }}>
              <dt className="uppercase tracking-wide">Parity Δ</dt>
              <dd
                className="mt-0.5 font-mono font-semibold tabular-nums"
                style={{
                  color: parity != null && Math.abs(parity) < 0.01
                    ? "var(--color-success)"
                    : "var(--color-warn)",
                }}
              >
                {parity == null ? "—" : parity.toExponential(1)}
              </dd>
            </div>
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
            <StatTile
              term="Delta (call)"
              value={result ? fmt(result.greeks.deltaCall, 4) : "—"}
              tone="success"
              hint={`Put: ${result ? fmt(result.greeks.deltaPut, 4) : "—"}`}
            />
            <StatTile
              term="Gamma"
              value={result ? fmt(result.greeks.gamma, 4) : "—"}
              tone="accent"
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
              tone="default"
              hint={`Put: ${result ? fmt(result.greeks.rhoPutPer1Pct, 4) : "—"}`}
            />
          </StatsGrid>
        </section>

        {/* Payoff */}
        <section aria-labelledby="h-payoff">
          <h3
            id="h-payoff"
            className="mb-2 text-sm font-semibold uppercase tracking-wide"
            style={{ color: "var(--color-fg-muted)" }}
          >
            Payoff at Expiry
          </h3>
          <PayoffChart S={S} K={K} callPremium={result?.call ?? 0} putPremium={result?.put ?? 0} />
        </section>
      </section>
    </div>
  );
}
