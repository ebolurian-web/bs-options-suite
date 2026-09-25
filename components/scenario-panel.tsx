"use client";

import { useMemo } from "react";
import { addDays, fmtDate, fmtShort, fmtSigned, parseIso } from "@/lib/format";
import { scenarioPnl, type PositionLeg } from "@/lib/position";
import { PnlChart } from "./pnl-chart";

export type Scenario = { price: number; day: number; iv: number };

/**
 * P&L chart plus the three scenario sliders (stock price, date, implied vol)
 * and a plain-English readout. Shared by Trade ideas, the Option explorer
 * and the Strategy builder.
 */
export function ScenarioPanel({
  title,
  headerExtra,
  legs,
  ticker,
  spot,
  target,
  expiry,
  daysLeft,
  T,
  atmIv,
  expectedMove,
  r,
  scenario,
  onScenario,
  subject = "this trade",
  children,
}: {
  title: string;
  /** Rendered at the right of the header row (e.g. a chart-type toggle). */
  headerExtra?: React.ReactNode;
  legs: PositionLeg[];
  ticker: string;
  spot: number;
  target?: number | null;
  /** Reference (earliest) expiry, ISO. */
  expiry: string;
  daysLeft: number;
  T: number;
  /** Shown in the IV slider readout; null = legs keep their own IVs. */
  atmIv: number | null;
  expectedMove: number;
  r: number;
  scenario: Scenario;
  onScenario: (patch: Partial<Scenario>) => void;
  /** Noun used in the readout: "this trade", "this call", "the position". */
  subject?: string;
  /** Replaces the chart when set (e.g. an alternate chart view). */
  children?: React.ReactNode;
}) {
  const { price, day, iv: ivShiftPts } = scenario;

  const domain = useMemo(() => {
    const ks = legs.filter((l) => l.type !== "stock").map((l) => l.strike);
    const reach = Math.max(expectedMove * 2.2, spot * 0.04);
    const extra = target != null ? [target - expectedMove * 0.4] : [];
    const extraHi = target != null ? [target + expectedMove * 0.4] : [];
    const lo = Math.min(spot - reach, ...ks.map((k) => k - expectedMove * 0.6), ...extra);
    const hi = Math.max(spot + reach, ...ks.map((k) => k + expectedMove * 0.6), ...extraHi);
    return { lo: Math.max(0.01, lo), hi };
  }, [legs, spot, target, expectedMove]);

  const tRemaining = Math.max(0, T - day / 365.25);
  const ivShift = ivShiftPts / 100;
  const scenarioDate = addDays(day);
  const atExpiry = day >= daysLeft;
  const scenarioLabel = atExpiry ? fmtDate(expiry) : fmtShort(scenarioDate);
  const pnl = scenarioPnl(legs, price, atExpiry ? 0 : tRemaining, ivShift, r);
  const pnlExp = scenarioPnl(legs, price, 0, ivShift, r);
  const priceStep = spot >= 100 ? 0.5 : spot >= 20 ? 0.1 : 0.05;
  const baseIv = atmIv ?? 0;
  const ivMin = atmIv != null ? -Math.floor(atmIv * 100 - 1) : -10;
  const shiftText = `${ivShiftPts > 0 ? "+" : "−"}${Math.abs(ivShiftPts).toFixed(1)} pts`;
  const ivText =
    atmIv != null
      ? ivShiftPts === 0
        ? `${(baseIv * 100).toFixed(1)}% · unchanged`
        : `${((baseIv + ivShift) * 100).toFixed(1)}% · ${shiftText}`
      : ivShiftPts === 0
        ? "each leg · unchanged"
        : `each leg · ${shiftText}`;

  return (
    <section aria-labelledby="h-chart" className="surface-1 flex flex-col gap-3 p-4 md:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 id="h-chart" className="text-[0.95rem] font-semibold">
          {title}
        </h3>
        {headerExtra ?? (
          <div className="flex flex-wrap gap-4 text-xs" style={{ color: "var(--color-fg-muted)" }} aria-hidden="true">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-4" style={{ background: "var(--color-accent)" }} />
              On {scenarioLabel}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-4 border-t-2 border-dashed" style={{ borderColor: "var(--chart-4)" }} />
              At expiry
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-3" style={{ background: "var(--color-fg-default)", opacity: 0.1 }} />
              1σ expected move
            </span>
          </div>
        )}
      </div>

      {children ?? (
        <PnlChart
          legs={legs}
          name={title}
          spot={spot}
          target={target}
          expectedMove={expectedMove}
          breakEvens={breakEvensOf(legs, r, ivShift, domain)}
          tRemaining={atExpiry ? 0 : tRemaining}
          ivShift={ivShift}
          r={r}
          scenarioPrice={price}
          scenarioLabel={scenarioLabel}
          domain={domain}
        />
      )}

      <div className="grid gap-4 border-t pt-3 md:grid-cols-3 md:gap-5" style={{ borderColor: "var(--color-border)" }}>
        <Slider
          id="sc-price"
          label="Stock price"
          valueText={`$${price.toFixed(2)}`}
          min={+domain.lo.toFixed(2)}
          max={+domain.hi.toFixed(2)}
          step={priceStep}
          value={price}
          onChange={(v) => onScenario({ price: v })}
        />
        <Slider
          id="sc-date"
          label="Date"
          valueText={atExpiry ? `${fmtShort(scenarioDate)} · expiry` : `${fmtShort(scenarioDate)} · ${daysLeft - day}d left`}
          min={0}
          max={Math.max(0, daysLeft)}
          step={1}
          value={day}
          onChange={(v) => onScenario({ day: v })}
        />
        <Slider
          id="sc-iv"
          label="Implied vol"
          valueText={ivText}
          min={ivMin}
          max={30}
          step={0.5}
          value={ivShiftPts}
          onChange={(v) => onScenario({ iv: v })}
        />
      </div>

      <p className="text-[0.85rem] leading-relaxed" style={{ color: "var(--color-fg-muted)" }}>
        If {ticker} is at <strong style={{ color: "var(--color-fg-default)" }}>${price.toFixed(2)}</strong> on{" "}
        <strong style={{ color: "var(--color-fg-default)" }}>{scenarioLabel}</strong>
        {atExpiry
          ? ""
          : ivShiftPts === 0
            ? " with implied vol unchanged"
            : ` with implied vol ${ivShiftPts > 0 ? "up" : "down"} ${Math.abs(ivShiftPts)} pts`}
        , {subject} is {atExpiry ? "" : "worth about "}
        <strong style={{ color: pnl >= 0 ? "var(--color-accent)" : "var(--color-error)" }}>{fmtSigned(pnl)}</strong>.
        {!atExpiry && (
          <>
            {" "}
            Held to {fmtShort(parseIso(expiry))} at that price:{" "}
            <strong style={{ color: "var(--color-fg-default)" }}>{fmtSigned(pnlExp)}</strong>.
          </>
        )}
      </p>
    </section>
  );
}

/** Zero crossings of the reference-expiry curve inside the chart domain. */
function breakEvensOf(legs: PositionLeg[], r: number, ivShift: number, d: { lo: number; hi: number }): number[] {
  const out: number[] = [];
  const N = 400;
  let px = d.lo;
  let py = scenarioPnl(legs, px, 0, ivShift, r);
  for (let i = 1; i <= N; i++) {
    const x = d.lo + ((d.hi - d.lo) * i) / N;
    const y = scenarioPnl(legs, x, 0, ivShift, r);
    if ((py < 0 && y >= 0) || (py > 0 && y <= 0)) out.push(px + (py / (py - y)) * (x - px));
    px = x;
    py = y;
  }
  return out;
}

export function Slider({
  id,
  label,
  valueText,
  min,
  max,
  step,
  value,
  onChange,
}: {
  id: string;
  label: string;
  valueText: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between gap-2 text-xs">
        <label htmlFor={id} className="font-semibold" style={{ color: "var(--color-fg-muted)" }}>
          {label}
        </label>
        <span className="font-mono tabular-nums" aria-hidden="true">
          {valueText}
        </span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-valuetext={valueText}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-6 w-full"
        style={{ accentColor: "var(--color-accent)" }}
      />
    </div>
  );
}
