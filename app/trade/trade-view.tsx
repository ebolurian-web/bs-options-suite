"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ApiClientError, fetchChain, fetchHistory } from "@/lib/client";
import { encodeStrategy } from "@/lib/strategy-codec";
import {
  VIEWS,
  buildIdeas,
  daysToExpiration,
  defaultExpiration,
  defaultTarget,
  dollarGreeks,
  expiryPnl,
  scenarioPnl,
  volVerdict,
  type IdeaLeg,
  type TradeIdea,
  type View,
} from "@/lib/trade-ideas";
import type { HistoricalSeries, OptionChain } from "@/lib/types";
import { PnlChart, fmtSigned } from "./pnl-chart";

/** Risk-free rate used for scenario pricing. Editable on the Pricer page. */
const R = 0.045;
const DEFAULT_TICKER = "SPY";

const label = "text-[0.72rem] font-semibold";
const eyebrow = "text-[0.68rem] font-semibold uppercase tracking-[0.12em]";
const inputCls = "h-11 w-full rounded-md border px-3 font-mono text-[0.95rem]";
const inputStyle = {
  background: "var(--color-surface-2)",
  borderColor: "var(--color-border-strong)",
  color: "var(--color-fg-default)",
} as const;

export function TradeView() {
  // ── Market data ──
  const [tickerInput, setTickerInput] = useState(DEFAULT_TICKER);
  const [chain, setChain] = useState<OptionChain | null>(null);
  const [history, setHistory] = useState<HistoricalSeries | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // ── The user's view ──
  const [view, setView] = useState<View>("up");
  const [expiry, setExpiry] = useState<string | null>(null);
  /** null = use the default target for the current view. */
  const [targetInput, setTargetInput] = useState<string | null>(null);
  const [maxRiskText, setMaxRiskText] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // ── Scenario sliders (tagged with the trade they belong to; stale = defaults) ──
  const [scenario, setScenario] = useState<{ key: string; price: number; day: number; iv: number } | null>(null);

  const [announcement, setAnnouncement] = useState("");
  const [copied, setCopied] = useState(false);
  // Target/expiry to apply once the next chain arrives (from the URL on first load).
  const pendingRef = useRef<{ target?: number; expiry?: string } | null>(null);

  // ── Derived: ATM IV / expected move (needed for default targets) ──
  const base = useMemo(() => {
    if (!chain || !expiry) return null;
    return buildIdeas({ chain, expiry, view: "up", target: chain.quote.price, maxRisk: null, r: R });
  }, [chain, expiry]);

  const targetText =
    targetInput ?? (base ? String(defaultTarget(view, base.spot, base.expectedMove)) : "");
  const target = Number(targetText.replace(/[$,\s]/g, ""));
  const targetValid = Number.isFinite(target) && target > 0;
  const maxRisk = maxRiskText.trim() ? Number(maxRiskText.replace(/[$,\s]/g, "")) : null;

  // ── Load a ticker ──
  const loadTicker = useCallback(async (raw: string) => {
    const t = raw.trim().toUpperCase();
    if (!t) return;
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setBusy(true);
    setError(null);
    try {
      const [chainRes, histRes] = await Promise.allSettled([
        fetchChain(t, ctrl.signal),
        fetchHistory(t, 365, ctrl.signal),
      ]);
      if (chainRes.status !== "fulfilled") throw chainRes.reason;
      const c = chainRes.value;
      const pending = pendingRef.current;
      pendingRef.current = null;
      const exp =
        pending?.expiry && c.expirations.includes(pending.expiry)
          ? pending.expiry
          : defaultExpiration(c.expirations);
      setChain(c);
      setHistory(histRes.status === "fulfilled" ? histRes.value : null);
      setTickerInput(c.ticker);
      setExpiry(exp);
      setSelectedId(null);
      setTargetInput(pending?.target != null ? String(pending.target) : null);
    } catch (err) {
      if (ctrl.signal.aborted) return;
      setError(
        err instanceof ApiClientError
          ? err.code === "not_found"
            ? `No options found for ${t}.`
            : err.message
          : err instanceof Error
            ? err.message
            : "Unknown error",
      );
    } finally {
      if (!ctrl.signal.aborted) setBusy(false);
    }
  }, []);

  // Hydrate from the URL (?t=SPY&v=up&k=600&e=2026-11-20), else preload SPY.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const v = p.get("v");
    // Reading the URL is a one-time sync from an external source on mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (v && VIEWS.some((x) => x.id === v)) setView(v as View);
    const k = Number(p.get("k"));
    const e = p.get("e");
    pendingRef.current = {
      target: Number.isFinite(k) && k > 0 ? k : undefined,
      expiry: e && /^\d{4}-\d{2}-\d{2}$/.test(e) ? e : undefined,
    };
    const t = p.get("t");
    void loadTicker(t && /^[A-Za-z.^]{1,10}$/.test(t) ? t : DEFAULT_TICKER);
  }, [loadTicker]);

  const result = useMemo(() => {
    if (!chain || !expiry || !targetValid) return null;
    return buildIdeas({ chain, expiry, view, target, maxRisk, r: R });
  }, [chain, expiry, view, target, targetValid, maxRisk]);

  const ideas = result?.ideas ?? [];
  const selected: TradeIdea | null =
    ideas.find((i) => i.id === selectedId) ?? ideas.find((i) => i.best) ?? ideas[0] ?? null;

  const daysLeft = result ? Math.floor(result.daysToExpiry) : 0;

  // The scenario resets whenever the trade or its inputs change.
  const scenarioKey = `${chain?.ticker}|${expiry}|${view}|${targetText}|${selected?.id}`;
  const sc =
    scenario?.key === scenarioKey
      ? scenario
      : { key: scenarioKey, price: targetValid ? target : (result?.spot ?? 0), day: Math.floor(daysLeft / 2), iv: 0 };
  const patchScenario = (patch: Partial<{ price: number; day: number; iv: number }>) =>
    setScenario({ ...sc, ...patch });

  // Keep the URL shareable.
  useEffect(() => {
    if (!chain || !expiry) return;
    const p = new URLSearchParams({ t: chain.ticker, v: view, e: expiry });
    if (targetValid) p.set("k", String(target));
    window.history.replaceState(null, "", `${window.location.pathname}?${p.toString()}`);
  }, [chain, view, expiry, target, targetValid]);

  // Announce new idea sets politely (not on every slider move).
  const ideasSummary = result
    ? `${ideas.length} trade ideas for ${chain?.ticker}. Best fit: ${ideas.find((i) => i.best)?.name ?? "none"}.`
    : "";
  useEffect(() => {
    if (!ideasSummary) return;
    const id = setTimeout(() => setAnnouncement(ideasSummary), 600);
    return () => clearTimeout(id);
  }, [ideasSummary]);

  const changeView = (v: View) => {
    if (v === view) return;
    setView(v);
    setTargetInput(null);
    setSelectedId(null);
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setAnnouncement("Link copied to clipboard.");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setAnnouncement("Clipboard unavailable. Copy the address bar URL instead.");
    }
  };

  const spot = chain?.quote.price ?? null;
  const change =
    chain?.quote.previousClose && spot != null
      ? ((spot - chain.quote.previousClose) / chain.quote.previousClose) * 100
      : null;

  return (
    <div className="grid gap-5 lg:grid-cols-[280px_minmax(0,1fr)] xl:grid-cols-[280px_minmax(0,1fr)_340px]">
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>

      {/* ── 1 · YOUR VIEW ─────────────────────────────────────────── */}
      <aside aria-labelledby="h-view" className="surface-1 flex flex-col gap-5 p-5 lg:row-span-2 xl:row-span-1">
        <h2 id="h-view" className={eyebrow} style={{ color: "var(--color-fg-muted)" }}>
          1 · Your view
        </h2>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void loadTicker(tickerInput);
          }}
          className="flex flex-col gap-1.5"
        >
          <label htmlFor="tv-ticker" className={label} style={{ color: "var(--color-fg-muted)" }}>
            Ticker
          </label>
          <div className="flex gap-2">
            <input
              id="tv-ticker"
              value={tickerInput}
              onChange={(e) => setTickerInput(e.target.value.toUpperCase())}
              maxLength={10}
              autoComplete="off"
              spellCheck={false}
              aria-invalid={error ? "true" : "false"}
              aria-describedby={error ? "tv-ticker-error" : "tv-ticker-quote"}
              className={`${inputCls} font-semibold uppercase tracking-wider`}
              style={{ ...inputStyle, borderColor: error ? "var(--color-error)" : inputStyle.borderColor }}
            />
            <button
              type="submit"
              disabled={busy || !tickerInput.trim()}
              className="press-scale h-11 rounded-md px-4 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
              style={{ background: "var(--color-accent)", color: "#0a0a0a" }}
            >
              {busy ? "…" : "Load"}
            </button>
          </div>
          {error ? (
            <p id="tv-ticker-error" role="alert" className="text-xs" style={{ color: "var(--color-error)" }}>
              {error}
            </p>
          ) : (
            <p id="tv-ticker-quote" className="flex justify-between font-mono text-[0.82rem]">
              <span>{spot != null ? `$${spot.toFixed(2)}` : busy ? "Loading…" : "—"}</span>
              {change != null && (
                <span style={{ color: change >= 0 ? "var(--color-success)" : "var(--color-error)" }}>
                  {change >= 0 ? "+" : "−"}
                  {Math.abs(change).toFixed(2)}%
                </span>
              )}
            </p>
          )}
        </form>

        <fieldset className="flex flex-col gap-2">
          <legend className={`${label} mb-2`} style={{ color: "var(--color-fg-muted)" }}>
            I think it will…
          </legend>
          <div className="grid grid-cols-4 gap-2 lg:grid-cols-2">
            {VIEWS.map((v) => {
              const on = v.id === view;
              return (
                <button
                  key={v.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => changeView(v.id)}
                  className="press-scale h-11 rounded-md border text-sm transition-colors"
                  style={{
                    borderColor: on ? "var(--color-accent)" : "var(--color-border)",
                    background: on ? "var(--color-accent-soft)" : "var(--color-surface-2)",
                    color: on ? "var(--color-fg-default)" : "var(--color-fg-muted)",
                    fontWeight: on ? 600 : 500,
                  }}
                >
                  <span className="lg:hidden">{v.short}</span>
                  <span className="hidden lg:inline">{v.label}</span>
                </button>
              );
            })}
          </div>
        </fieldset>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="tv-target" className={label} style={{ color: "var(--color-fg-muted)" }}>
            {view === "flat" ? "Stays near" : view === "big" ? "Moves at least to (either way)" : "Target price"}
          </label>
          <input
            id="tv-target"
            inputMode="decimal"
            value={targetText}
            onChange={(e) => setTargetInput(e.target.value)}
            aria-describedby="tv-target-hint"
            aria-invalid={targetText !== "" && !targetValid ? "true" : "false"}
            className={inputCls}
            style={inputStyle}
          />
          <p id="tv-target-hint" className="text-xs" style={{ color: "var(--color-fg-subtle)" }}>
            {targetHint(view, spot, targetValid ? target : null, result?.expectedMove ?? base?.expectedMove ?? null)}
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="tv-expiry" className={label} style={{ color: "var(--color-fg-muted)" }}>
            By
          </label>
          <select
            id="tv-expiry"
            value={expiry ?? ""}
            onChange={(e) => {
              setExpiry(e.target.value);
              setSelectedId(null);
            }}
            disabled={!chain}
            className="h-11 w-full rounded-md border px-2.5 text-sm"
            style={inputStyle}
          >
            {(chain?.expirations ?? []).map((e) => (
              <option key={e} value={e}>
                {fmtDate(e)} · {Math.round(daysToExpiration(e))} days
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="tv-risk" className={label} style={{ color: "var(--color-fg-muted)" }}>
            Max I&apos;m willing to lose
          </label>
          <input
            id="tv-risk"
            inputMode="decimal"
            placeholder="No limit"
            value={maxRiskText}
            onChange={(e) => setMaxRiskText(e.target.value)}
            className={inputCls}
            style={inputStyle}
          />
        </div>

        <p className="mt-auto text-xs leading-relaxed" style={{ color: "var(--color-fg-subtle)" }}>
          Trades update as you change your view. Prices use live bid/ask mids and each strike&apos;s own
          implied volatility. Quotes are delayed ~15 minutes.
        </p>
      </aside>

      {/* ── 2 · TRADES + CHART ────────────────────────────────────── */}
      <section aria-labelledby="h-trades" className="flex min-w-0 flex-col gap-4">
        <h2 id="h-trades" className={eyebrow} style={{ color: "var(--color-fg-muted)" }}>
          2 · Trades that fit your view
        </h2>

        {!result ? (
          <div className="surface-1 p-6 text-sm" style={{ color: "var(--color-fg-muted)" }}>
            {busy ? `Loading ${tickerInput} option chain…` : error ? "Load a ticker to see trade ideas." : !targetValid && chain ? "Enter a target price." : "Loading…"}
          </div>
        ) : ideas.length === 0 ? (
          <div className="surface-1 p-6 text-sm" style={{ color: "var(--color-fg-muted)" }}>
            No listed strikes fit this view for {fmtDate(expiry!)}. Try another expiration or target.
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" role="group" aria-label="Trade ideas">
            {ideas.map((idea) => (
              <IdeaCard
                key={idea.id}
                idea={idea}
                view={view}
                selected={idea.id === selected?.id}
                onSelect={() => setSelectedId(idea.id)}
              />
            ))}
          </div>
        )}
        {result && ideas.length > 0 && ideas.every((i) => i.overBudget) && (
          <p className="text-xs" style={{ color: "var(--color-warn)" }}>
            Every trade here can lose more than {usd(maxRisk ?? 0)}. Try a target closer to today or a nearer expiration.
          </p>
        )}

        {result && selected && chain && (
          <ScenarioPanel
            idea={selected}
            ticker={chain.ticker}
            spot={result.spot}
            target={targetValid ? target : result.spot}
            view={view}
            expiry={expiry!}
            daysLeft={daysLeft}
            T={result.T}
            atmIv={result.atmIv}
            expectedMove={result.expectedMove}
            scenarioPrice={sc.price}
            setScenarioPrice={(price) => patchScenario({ price })}
            dayOffset={sc.day}
            setDayOffset={(day) => patchScenario({ day })}
            ivShiftPts={sc.iv}
            setIvShiftPts={(iv) => patchScenario({ iv })}
          />
        )}
      </section>

      {/* ── 3 · IS IT WORTH IT? ───────────────────────────────────── */}
      <aside aria-labelledby="h-worth" className="flex flex-col gap-4 lg:col-start-2 xl:col-start-auto">
        <h2 id="h-worth" className={eyebrow} style={{ color: "var(--color-fg-muted)" }}>
          3 · Is it worth it?
        </h2>
        {result && <VerdictCard atmIv={result.atmIv} history={history} view={view} />}
        {result && selected && chain && (
          <>
            <SummaryCard idea={selected} ticker={chain.ticker} expiry={expiry!} spot={result.spot} T={result.T} />
            <LegsCard
              idea={selected}
              expiry={expiry!}
              ticker={chain.ticker}
              spot={result.spot}
              atmIv={result.atmIv}
              onCopyLink={copyLink}
              copied={copied}
            />
          </>
        )}
      </aside>
    </div>
  );
}

// ── Idea card ──────────────────────────────────────────────────────────

function IdeaCard({
  idea,
  view,
  selected,
  onSelect,
}: {
  idea: TradeIdea;
  view: View;
  selected: boolean;
  onSelect: () => void;
}) {
  const credit = idea.cost < 0;
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className="surface-1 surface-interactive flex flex-col gap-2 p-4 text-left"
      style={{
        borderColor: selected ? "var(--color-accent)" : undefined,
        boxShadow: selected ? "0 0 0 3px var(--color-accent-soft)" : undefined,
      }}
    >
      <span className="flex w-full items-center justify-between gap-2">
        <span className="text-[0.95rem] font-semibold">{idea.name}</span>
        <span className="flex gap-1.5">
          {idea.best && (
            <span className="rounded-full px-2 py-0.5 text-[0.68rem] font-semibold" style={{ background: "var(--color-accent)", color: "#0a0a0a" }}>
              Best fit
            </span>
          )}
          {idea.overBudget && (
            <span className="rounded-full border px-2 py-0.5 text-[0.68rem] font-semibold" style={{ borderColor: "var(--color-warn)", color: "var(--color-warn)" }}>
              Over budget
            </span>
          )}
        </span>
      </span>
      <span className="font-mono text-xs" style={{ color: "var(--color-fg-muted)" }}>
        {idea.legs.map(legShort).join(" · ")}
      </span>
      <span className="text-xs leading-snug" style={{ color: "var(--color-fg-subtle)" }}>
        {idea.blurb}
      </span>
      <span className="mt-1 grid w-full grid-cols-3 gap-1.5 font-mono text-[0.82rem] tabular-nums">
        <span className="flex flex-col">
          <span className="font-sans text-[0.68rem]" style={{ color: "var(--color-fg-subtle)" }}>
            {credit ? "Credit" : "Cost"}
          </span>
          {usd(Math.abs(idea.cost))}
        </span>
        <span className="flex flex-col">
          <span className="font-sans text-[0.68rem]" style={{ color: "var(--color-fg-subtle)" }}>
            {view === "big" ? "If it moves" : "If right"}
          </span>
          <span style={{ color: idea.pnlIfRight >= 0 ? "var(--color-success)" : "var(--color-error)" }}>
            {fmtSigned(idea.pnlIfRight)}
          </span>
        </span>
        <span className="flex flex-col">
          <span className="font-sans text-[0.68rem]" style={{ color: "var(--color-fg-subtle)" }}>
            Win odds
          </span>
          {Math.round(idea.pop * 100)}%
        </span>
      </span>
    </button>
  );
}

// ── Chart + scenario sliders ───────────────────────────────────────────

function ScenarioPanel(props: {
  idea: TradeIdea;
  ticker: string;
  spot: number;
  target: number;
  view: View;
  expiry: string;
  daysLeft: number;
  T: number;
  atmIv: number;
  expectedMove: number;
  scenarioPrice: number;
  setScenarioPrice: (n: number) => void;
  dayOffset: number;
  setDayOffset: (n: number) => void;
  ivShiftPts: number;
  setIvShiftPts: (n: number) => void;
}) {
  const { idea, ticker, spot, target, expiry, daysLeft, T, atmIv, expectedMove } = props;
  const { scenarioPrice, dayOffset, ivShiftPts } = props;

  const domain = useMemo(() => {
    const ks = idea.legs.map((l) => l.strike);
    const reach = Math.max(expectedMove * 2.2, spot * 0.04);
    const lo = Math.min(spot - reach, ...ks.map((k) => k - expectedMove * 0.6), target - expectedMove * 0.4);
    const hi = Math.max(spot + reach, ...ks.map((k) => k + expectedMove * 0.6), target + expectedMove * 0.4);
    return { lo: Math.max(0.01, lo), hi };
  }, [idea, spot, target, expectedMove]);

  const tRemaining = Math.max(0, T - dayOffset / 365.25);
  const ivShift = ivShiftPts / 100;
  const scenarioDate = addDays(dayOffset);
  const atExpiry = dayOffset >= daysLeft;
  const scenarioLabel = atExpiry ? fmtDate(expiry) : fmtShort(scenarioDate);
  const pnl = scenarioPnl(idea.legs, scenarioPrice, atExpiry ? 0 : tRemaining, ivShift, R);
  const pnlExp = expiryPnl(idea.legs, scenarioPrice);
  const priceStep = spot >= 100 ? 0.5 : spot >= 20 ? 0.1 : 0.05;
  const ivMin = -Math.floor(atmIv * 100 - 1);
  const ivText =
    ivShiftPts === 0
      ? `${(atmIv * 100).toFixed(1)}% · unchanged`
      : `${((atmIv + ivShift) * 100).toFixed(1)}% · ${ivShiftPts > 0 ? "+" : "−"}${Math.abs(ivShiftPts).toFixed(1)} pts`;

  return (
    <section aria-labelledby="h-chart" className="surface-1 flex flex-col gap-3 p-4 md:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 id="h-chart" className="text-[0.95rem] font-semibold">
          Profit &amp; loss · {idea.name}
        </h3>
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
      </div>

      <PnlChart
        legs={idea.legs}
        name={idea.name}
        spot={spot}
        target={target}
        expectedMove={expectedMove}
        breakEvens={idea.breakEvens}
        tRemaining={atExpiry ? 0 : tRemaining}
        ivShift={ivShift}
        r={R}
        scenarioPrice={scenarioPrice}
        scenarioLabel={scenarioLabel}
        domain={domain}
      />

      <div className="grid gap-4 border-t pt-3 md:grid-cols-3 md:gap-5" style={{ borderColor: "var(--color-border)" }}>
        <Slider
          id="sc-price"
          label="Stock price"
          valueText={`$${scenarioPrice.toFixed(2)}`}
          min={+domain.lo.toFixed(2)}
          max={+domain.hi.toFixed(2)}
          step={priceStep}
          value={scenarioPrice}
          onChange={props.setScenarioPrice}
        />
        <Slider
          id="sc-date"
          label="Date"
          valueText={atExpiry ? `${fmtShort(scenarioDate)} · expiry` : `${fmtShort(scenarioDate)} · ${daysLeft - dayOffset}d left`}
          min={0}
          max={Math.max(0, daysLeft)}
          step={1}
          value={dayOffset}
          onChange={props.setDayOffset}
        />
        <Slider
          id="sc-iv"
          label="Implied vol"
          valueText={ivText}
          min={ivMin}
          max={30}
          step={0.5}
          value={ivShiftPts}
          onChange={props.setIvShiftPts}
        />
      </div>

      <p className="text-[0.85rem] leading-relaxed" style={{ color: "var(--color-fg-muted)" }}>
        If {ticker} is at <strong style={{ color: "var(--color-fg-default)" }}>${scenarioPrice.toFixed(2)}</strong> on{" "}
        <strong style={{ color: "var(--color-fg-default)" }}>{scenarioLabel}</strong>
        {atExpiry ? "" : ivShiftPts === 0 ? " with implied vol unchanged" : ` with implied vol ${ivShiftPts > 0 ? "up" : "down"} ${Math.abs(ivShiftPts)} pts`}, this trade is{" "}
        {atExpiry ? "" : "worth about "}
        <strong style={{ color: pnl >= 0 ? "var(--color-accent)" : "var(--color-error)" }}>{fmtSigned(pnl)}</strong>.
        {!atExpiry && (
          <>
            {" "}
            Held to {fmtShort(parseIso(expiry))} at that price: <strong style={{ color: "var(--color-fg-default)" }}>{fmtSigned(pnlExp)}</strong>.
          </>
        )}
      </p>
    </section>
  );
}

function Slider({
  id,
  label: text,
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
          {text}
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

// ── Right rail cards ───────────────────────────────────────────────────

function VerdictCard({ atmIv, history, view }: { atmIv: number; history: HistoricalSeries | null; view: View }) {
  const v = useMemo(() => volVerdict(atmIv, history?.bars ?? null, view), [atmIv, history, view]);
  const badge =
    v.tone === "pricey"
      ? { bg: "var(--color-warn)", fg: "#0a0a0a" }
      : v.tone === "cheap"
        ? { bg: "var(--color-accent)", fg: "#0a0a0a" }
        : { bg: "var(--color-surface-3)", fg: "var(--color-fg-default)" };
  return (
    <section aria-labelledby="h-verdict" className="surface-1 flex flex-col gap-3 p-4">
      <span className="self-start rounded-full px-2.5 py-0.5 text-xs font-bold" style={{ background: badge.bg, color: badge.fg }}>
        {v.label}
      </span>
      <h3 id="h-verdict" className="text-[1.02rem] font-bold leading-snug" style={{ fontFamily: "var(--font-libre), serif" }}>
        {v.headline}
      </h3>
      <dl className="grid grid-cols-3 gap-2 font-mono text-sm tabular-nums">
        <Chip term="Implied" value={`${(v.impliedVol * 100).toFixed(1)}%`} />
        <Chip term="Realized 20d" value={v.realizedVol20 != null ? `${(v.realizedVol20 * 100).toFixed(1)}%` : "—"} />
        <Chip term="IV rank" value={v.ivRank != null ? Math.round(v.ivRank).toString() : "—"} />
      </dl>
      <p className="text-[0.82rem] leading-relaxed" style={{ color: "var(--color-fg-muted)" }}>
        {v.advice}{" "}
        <Link href="/pricer" className="underline" style={{ color: "var(--color-accent)" }}>
          See the vol surface &amp; cone
        </Link>
      </p>
    </section>
  );
}

function Chip({ term, value }: { term: string; value: string }) {
  return (
    <div className="rounded-md px-2 py-1.5" style={{ background: "var(--color-surface-2)" }}>
      <dt className="font-sans text-[0.68rem]" style={{ color: "var(--color-fg-subtle)" }}>
        {term}
      </dt>
      <dd>{value}</dd>
    </div>
  );
}

function SummaryCard({
  idea,
  ticker,
  expiry,
  spot,
  T,
}: {
  idea: TradeIdea;
  ticker: string;
  expiry: string;
  spot: number;
  T: number;
}) {
  const g = useMemo(() => dollarGreeks(idea.legs, spot, T, R), [idea, spot, T]);
  const stat = "font-mono text-lg font-semibold tabular-nums";
  return (
    <section aria-labelledby="h-summary" className="surface-1 flex flex-col gap-3 p-4">
      <h3 id="h-summary" className="text-[0.95rem] font-semibold">
        {idea.name} · {fmtShort(parseIso(expiry))}
      </h3>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
        <div>
          <dt className="text-[0.7rem]" style={{ color: "var(--color-fg-subtle)" }}>Max loss</dt>
          <dd className={stat} style={{ color: "var(--color-error)" }}>{fmtSigned(-idea.maxLoss)}</dd>
        </div>
        <div>
          <dt className="text-[0.7rem]" style={{ color: "var(--color-fg-subtle)" }}>Max gain</dt>
          <dd className={stat} style={{ color: "var(--color-success)" }}>{fmtSigned(idea.maxGain)}</dd>
        </div>
        <div>
          <dt className="text-[0.7rem]" style={{ color: "var(--color-fg-subtle)" }}>
            Break-even{idea.breakEvens.length > 1 ? "s" : ""}
          </dt>
          <dd className={idea.breakEvens.length > 1 ? "font-mono text-sm font-semibold tabular-nums" : stat}>
            {idea.breakEvens.length ? idea.breakEvens.map((b) => `$${b.toFixed(2)}`).join(" / ") : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-[0.7rem]" style={{ color: "var(--color-fg-subtle)" }}>Chance of profit</dt>
          <dd className={stat}>{Math.round(idea.pop * 100)}%</dd>
        </div>
      </dl>
      <div className="flex flex-col gap-2 border-t pt-3 text-[0.82rem]" style={{ borderColor: "var(--color-border)" }}>
        <h4 className="text-xs font-semibold" style={{ color: "var(--color-fg-muted)" }}>
          What moves this position today
        </h4>
        <GreekRow label={`${ticker} +$1`} value={g.perDollar} />
        <GreekRow label="Each day that passes" value={g.perDay} />
        <GreekRow label="Implied vol +1 point" value={g.perVolPoint} />
      </div>
    </section>
  );
}

function GreekRow({ label: text, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between">
      <span style={{ color: "var(--color-fg-muted)" }}>{text}</span>
      <span className="font-mono tabular-nums" style={{ color: value < -0.5 ? "var(--color-error)" : "var(--color-fg-default)" }}>
        {fmtSigned(value)}
      </span>
    </div>
  );
}

function LegsCard({
  idea,
  expiry,
  ticker,
  spot,
  atmIv,
  onCopyLink,
  copied,
}: {
  idea: TradeIdea;
  expiry: string;
  ticker: string;
  spot: number;
  atmIv: number;
  onCopyLink: () => void;
  copied: boolean;
}) {
  const builderHref = useMemo(() => {
    const s = encodeStrategy({
      ticker,
      spot,
      volPct: atmIv * 100,
      rPct: R * 100,
      legs: idea.legs.map((l, i) => ({
        id: i,
        action: l.action,
        type: l.type,
        qty: l.qty,
        strike: l.strike,
        premium: +l.premium.toFixed(2),
        expiry,
      })),
    });
    return `/strategies?s=${s}`;
  }, [idea, expiry, ticker, spot, atmIv]);

  return (
    <section aria-labelledby="h-legs" className="surface-1 flex flex-col gap-2 p-4">
      <h3 id="h-legs" className="text-xs font-semibold" style={{ color: "var(--color-fg-muted)" }}>
        Legs · market mid vs. Black-Scholes at ATM IV
      </h3>
      <table className="w-full font-mono text-[0.82rem] tabular-nums">
        <thead className="sr-only">
          <tr>
            <th scope="col">Leg</th>
            <th scope="col">Market mid</th>
            <th scope="col">Black-Scholes at ATM IV</th>
          </tr>
        </thead>
        <tbody>
          {idea.legs.map((l) => (
            <tr key={`${l.type}${l.strike}${l.action}`}>
              <th scope="row" className="py-0.5 text-left font-normal">
                {l.action === "buy" ? "+" : "−"}
                {l.qty} {strikeLabel(l)}
              </th>
              <td className="py-0.5 text-right">${l.premium.toFixed(2)}</td>
              <td className="w-16 py-0.5 text-right" style={{ color: "var(--color-fg-subtle)" }}>
                {l.modelPrice != null ? l.modelPrice.toFixed(2) : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-[0.72rem] leading-relaxed" style={{ color: "var(--color-fg-subtle)" }}>
        Gaps between the two are volatility skew: the market prices each strike at its own IV.
      </p>
      <div className="mt-1 flex gap-2">
        <Link
          href={builderHref}
          className="press-scale flex h-11 flex-1 items-center justify-center rounded-md text-sm font-semibold"
          style={{ background: "var(--color-accent)", color: "#0a0a0a" }}
        >
          Edit legs
        </Link>
        <button
          type="button"
          onClick={onCopyLink}
          className="press-scale h-11 flex-1 rounded-md border text-sm font-semibold"
          style={{ borderColor: "var(--color-border-strong)", background: "var(--color-surface-2)" }}
        >
          {copied ? "Copied" : "Share link"}
        </button>
      </div>
    </section>
  );
}

// ── Formatting helpers ─────────────────────────────────────────────────

function usd(n: number): string {
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

function strikeLabel(l: IdeaLeg): string {
  const k = Number.isInteger(l.strike) ? String(l.strike) : l.strike.toFixed(2).replace(/0$/, "");
  return `${k}${l.type === "call" ? "C" : "P"}`;
}

function legShort(l: IdeaLeg): string {
  return `${l.action === "buy" ? "Buy" : "Sell"}${l.qty > 1 ? ` ${l.qty}×` : ""} ${strikeLabel(l)}`;
}

function parseIso(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12));
}

function addDays(n: number): Date {
  return new Date(Date.now() + n * 86400_000);
}

function fmtDate(iso: string): string {
  return parseIso(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

function fmtShort(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

function targetHint(view: View, spot: number | null, target: number | null, em: number | null): string {
  if (spot == null || em == null) return " ";
  const emText = `1σ expected move ±$${em.toFixed(2)}`;
  if (target == null) return emText;
  const pct = ((target - spot) / spot) * 100;
  const dist = Math.abs(target - spot);
  const inside = dist <= em ? "inside" : "outside";
  if (view === "flat") return `Trades are centred on this price · ${emText}`;
  if (view === "big") return `A ±$${dist.toFixed(2)} move · ${inside} the ${emText}`;
  return `${pct >= 0 ? "+" : "−"}${Math.abs(pct).toFixed(1)}% from today · ${inside} the ${emText}`;
}
