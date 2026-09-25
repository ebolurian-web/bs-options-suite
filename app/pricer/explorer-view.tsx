"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GreeksCard, Stat, VerdictCard } from "@/components/position-cards";
import { ScenarioPanel, type Scenario } from "@/components/scenario-panel";
import { normCdf, priceBS } from "@/lib/bs";
import { ApiClientError, fetchChain, fetchHistory } from "@/lib/client";
import { fmtDate, fmtPct, fmtShort, fmtSigned, fmtStrike, parseIso, usd } from "@/lib/format";
import {
  daysToExpiration,
  dollarGreeks,
  payoffProfile,
  probabilityOfProfit,
  type PositionLeg,
} from "@/lib/position";
import { encodeStrategy } from "@/lib/strategy-codec";
import { atmImpliedVol, contractIv, defaultExpiration, priceOf } from "@/lib/trade-ideas";
import type { HistoricalSeries, OptionChain, OptionContract } from "@/lib/types";
import { buildVolSurface } from "@/lib/vol-surface";
import { VolConeChart } from "./vol-cone-chart";
import { VolSurfaceSection } from "./vol-surface-section";

const DEFAULT_TICKER = "SPY";
const WINDOW = 6; // strikes shown each side of spot before "Show all"

const eyebrow = "text-[0.68rem] font-semibold uppercase tracking-[0.12em]";
const labelCls = "text-[0.72rem] font-semibold";
const inputStyle = {
  background: "var(--color-surface-2)",
  borderColor: "var(--color-border-strong)",
  color: "var(--color-fg-default)",
} as const;

type OptType = "call" | "put";
type Side = "buy" | "sell";

export function ExplorerView() {
  const [tickerInput, setTickerInput] = useState(DEFAULT_TICKER);
  const [chain, setChain] = useState<OptionChain | null>(null);
  const [history, setHistory] = useState<HistoricalSeries | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const [expiry, setExpiry] = useState<string | null>(null);
  const [pick, setPick] = useState<{ type: OptType; strike: number } | null>(null);
  const [side, setSide] = useState<Side>("buy");
  const [showAll, setShowAll] = useState(false);
  const [rPct, setRPct] = useState(4.5);
  const [qPct, setQPct] = useState(0);
  const [scenario, setScenario] = useState<(Scenario & { key: string }) | null>(null);
  const pendingRef = useRef<{ expiry?: string; strike?: number; type?: OptType } | null>(null);

  const r = rPct / 100;
  const q = qPct / 100;

  // ── Load ──
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
        pending?.expiry && c.expirations.includes(pending.expiry) ? pending.expiry : defaultExpiration(c.expirations);
      setChain(c);
      setHistory(histRes.status === "fulfilled" ? histRes.value : null);
      setTickerInput(c.ticker);
      setExpiry(exp);
      setShowAll(false);
      setPick(pending?.strike != null ? { type: pending.type ?? "call", strike: pending.strike } : null);
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

  // Hydrate from ?t=SPY&e=2026-11-20&k=590&c=call&s=buy, else preload SPY.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const k = Number(p.get("k"));
    const e = p.get("e");
    const c = p.get("c");
    pendingRef.current = {
      expiry: e && /^\d{4}-\d{2}-\d{2}$/.test(e) ? e : undefined,
      strike: Number.isFinite(k) && k > 0 ? k : undefined,
      type: c === "put" ? "put" : c === "call" ? "call" : undefined,
    };
    // One-time sync from the URL on mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (p.get("s") === "sell") setSide("sell");
    const t = p.get("t");
    void loadTicker(t && /^[A-Za-z.^]{1,10}$/.test(t) ? t : DEFAULT_TICKER);
  }, [loadTicker]);

  // ── Chain for the chosen expiry ──
  const book = useMemo(() => {
    if (!chain || !expiry) return null;
    const rows = new Map<number, { call?: OptionContract; put?: OptionContract }>();
    for (const c of chain.contracts) {
      if (c.expiration !== expiry || priceOf(c) == null) continue;
      const row = rows.get(c.strike) ?? {};
      row[c.type] = c;
      rows.set(c.strike, row);
    }
    const strikes = Array.from(rows.keys()).sort((a, b) => a - b);
    const spot = chain.quote.price;
    const days = daysToExpiration(expiry);
    const T = Math.max(1 / 365.25, days / 365.25);
    const atmIv = atmImpliedVol(chain, expiry, r, q) ?? chain.quote.iv30 ?? 0.25;
    let atmIdx = 0;
    strikes.forEach((k, i) => {
      if (Math.abs(k - spot) < Math.abs(strikes[atmIdx] - spot)) atmIdx = i;
    });
    return { rows, strikes, spot, days, T, atmIv, atmIdx };
  }, [chain, expiry, r, q]);

  // Default pick: at-the-money call. A stale pick (strike not listed) falls back too.
  const selected = useMemo(() => {
    if (!book) return null;
    const want = pick && book.rows.get(pick.strike)?.[pick.type] ? pick : null;
    if (want) return want;
    const k = book.strikes[book.atmIdx];
    const row = book.rows.get(k);
    if (pick && row?.[pick.type]) return { type: pick.type, strike: k };
    return row?.call ? { type: "call" as const, strike: k } : row?.put ? { type: "put" as const, strike: k } : null;
  }, [book, pick]);

  const contract = selected && book ? (book.rows.get(selected.strike)?.[selected.type] ?? null) : null;

  const analysis = useMemo(() => {
    if (!book || !contract || !chain) return null;
    const mid = priceOf(contract)!;
    const iv = contractIv(contract, book.spot, book.T, r, q) ?? book.atmIv;
    const model = priceBS({ S: book.spot, K: contract.strike, T: book.T, r, q, sigma: book.atmIv });
    const own = priceBS({ S: book.spot, K: contract.strike, T: book.T, r, q, sigma: iv });
    const leg: PositionLeg = {
      action: side,
      type: contract.type,
      strike: contract.strike,
      qty: 1,
      premium: mid,
      iv,
    };
    const legs = [leg];
    const profile = payoffProfile(legs);
    const pop = probabilityOfProfit(legs, book.spot, iv, book.T, r, q);
    const probItm = own ? (contract.type === "call" ? normCdf(own.d2) : normCdf(-own.d2)) : null;
    const be = contract.type === "call" ? contract.strike + mid : contract.strike - mid;
    return {
      legs,
      mid,
      iv,
      modelPrice: model ? (contract.type === "call" ? model.call : model.put) : null,
      profile,
      pop,
      probItm,
      be,
      greeks: dollarGreeks(legs, book.spot, book.T, r, q),
      delta: own ? (contract.type === "call" ? own.greeks.deltaCall : own.greeks.deltaPut) : null,
      expectedMove: book.spot * book.atmIv * Math.sqrt(book.T),
    };
  }, [book, contract, chain, side, r, q]);

  const volSurface = useMemo(() => {
    if (!chain) return null;
    try {
      return buildVolSurface({ chain, riskFreeRate: r, dividendYield: q });
    } catch {
      return null;
    }
  }, [chain, r, q]);

  // Scenario resets whenever the contract changes.
  const daysLeft = book ? Math.floor(book.days) : 0;
  const scenarioKey = `${chain?.ticker}|${expiry}|${selected?.type}|${selected?.strike}|${side}`;
  const sc: Scenario =
    scenario?.key === scenarioKey
      ? scenario
      : {
          price: book ? +(book.spot + (analysis?.expectedMove ?? 0) * (selected?.type === "put" ? -0.6 : 0.6) * (side === "buy" ? 1 : 0)).toFixed(2) : 0,
          day: Math.floor(daysLeft / 2),
          iv: 0,
        };

  // Keep the URL shareable.
  useEffect(() => {
    if (!chain || !expiry || !selected) return;
    const p = new URLSearchParams({ t: chain.ticker, e: expiry, k: String(selected.strike), c: selected.type, s: side });
    window.history.replaceState(null, "", `${window.location.pathname}?${p.toString()}${window.location.hash}`);
  }, [chain, expiry, selected, side]);

  const visibleStrikes = useMemo(() => {
    if (!book) return [];
    if (showAll) return book.strikes;
    const lo = Math.max(0, book.atmIdx - WINDOW);
    return book.strikes.slice(lo, book.atmIdx + WINDOW + 1);
  }, [book, showAll]);

  const change =
    chain?.quote.previousClose ? ((chain.quote.price - chain.quote.previousClose) / chain.quote.previousClose) * 100 : null;
  const typeWord = selected?.type === "put" ? "Put" : "Call";
  const builderHref =
    chain && expiry && analysis && contract
      ? `/strategies?s=${encodeStrategy({
          ticker: chain.ticker,
          spot: chain.quote.price,
          volPct: analysis.iv * 100,
          rPct,
          legs: [
            {
              id: 0,
              action: side,
              type: contract.type,
              qty: 1,
              strike: contract.strike,
              premium: +analysis.mid.toFixed(2),
              expiry,
            },
          ],
        })}`
      : null;

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-5 lg:grid-cols-[380px_minmax(0,1fr)] xl:grid-cols-[400px_minmax(0,1fr)_320px]">
        {/* ── 1 · PICK A CONTRACT ─────────────────────────────────── */}
        <aside aria-labelledby="h-pick" className="surface-1 flex flex-col gap-4 p-4 md:p-5 lg:row-span-2 xl:row-span-1">
          <h2 id="h-pick" className={eyebrow} style={{ color: "var(--color-fg-muted)" }}>
            1 · Pick a contract
          </h2>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void loadTicker(tickerInput);
            }}
            className="flex flex-col gap-1.5"
          >
            <label htmlFor="ex-ticker" className={labelCls} style={{ color: "var(--color-fg-muted)" }}>
              Ticker
            </label>
            <div className="flex gap-2">
              <input
                id="ex-ticker"
                value={tickerInput}
                onChange={(e) => setTickerInput(e.target.value.toUpperCase())}
                maxLength={10}
                autoComplete="off"
                spellCheck={false}
                aria-invalid={error ? "true" : "false"}
                aria-describedby={error ? "ex-ticker-error" : "ex-ticker-quote"}
                className="h-11 w-full rounded-md border px-3 font-mono text-[0.95rem] font-semibold uppercase tracking-wider"
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
              <p id="ex-ticker-error" role="alert" className="text-xs" style={{ color: "var(--color-error)" }}>
                {error}
              </p>
            ) : (
              <p id="ex-ticker-quote" className="flex justify-between font-mono text-[0.82rem]">
                <span>{chain ? `$${chain.quote.price.toFixed(2)}` : busy ? "Loading…" : "—"}</span>
                {change != null && (
                  <span style={{ color: change >= 0 ? "var(--color-success)" : "var(--color-error)" }}>{fmtPct(change)}</span>
                )}
              </p>
            )}
          </form>

          {chain && (
            <ExpiryPicker
              expirations={chain.expirations}
              value={expiry}
              onChange={(e) => {
                setExpiry(e);
                setShowAll(false);
              }}
            />
          )}

          {book && selected && (
            <ChainLadder
              book={book}
              strikes={visibleStrikes}
              selected={selected}
              expiryLabel={fmtShort(parseIso(expiry!))}
              r={r}
              q={q}
              onPick={(type, strike) => setPick({ type, strike })}
            />
          )}
          {book && book.strikes.length > visibleStrikes.length && (
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className="h-10 rounded-md border text-sm font-semibold"
              style={{ borderColor: "var(--color-border)", background: "var(--color-surface-2)", color: "var(--color-fg-muted)" }}
            >
              Show all {book.strikes.length} strikes
            </button>
          )}
          <p className="text-xs leading-relaxed" style={{ color: "var(--color-fg-subtle)" }}>
            Tinted prices are in the money. Click any price to analyse that contract. Quotes are delayed ~15 minutes.
          </p>
        </aside>

        {/* ── 2 · THE CONTRACT ─────────────────────────────────────── */}
        <section aria-labelledby="h-contract" className="flex min-w-0 flex-col gap-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="flex flex-col gap-1">
              <p className={eyebrow} style={{ color: "var(--color-fg-muted)" }}>
                2 · The contract
              </p>
              <h2 id="h-contract" className="text-2xl font-bold" style={{ fontFamily: "var(--font-libre), serif" }}>
                {chain && expiry && selected ? (
                  <>
                    {chain.ticker} {fmtShort(parseIso(expiry))}{" "}
                    <span style={{ color: "var(--color-accent)" }}>
                      {fmtStrike(selected.strike)} {typeWord}
                    </span>
                  </>
                ) : busy ? (
                  "Loading…"
                ) : (
                  "Pick a contract"
                )}
              </h2>
            </div>
            <div className="flex gap-2">
              <Segmented
                label="Buy or sell"
                options={[
                  { id: "buy", label: "Buy" },
                  { id: "sell", label: "Sell" },
                ]}
                value={side}
                onChange={(v) => setSide(v as Side)}
              />
              <Segmented
                label="Call or put"
                options={[
                  { id: "call", label: "Call" },
                  { id: "put", label: "Put" },
                ]}
                value={selected?.type ?? "call"}
                onChange={(v) => selected && setPick({ type: v as OptType, strike: selected.strike })}
              />
            </div>
          </div>

          {analysis && contract && book && chain && expiry && selected && (
            <>
              <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <Stat
                  label={side === "buy" ? "You pay (mid)" : "You collect (mid)"}
                  value={usd(analysis.mid * 100)}
                  sub={
                    contract.bid != null && contract.ask != null
                      ? `bid ${contract.bid.toFixed(2)} · ask ${contract.ask.toFixed(2)}`
                      : `$${analysis.mid.toFixed(2)} per share`
                  }
                />
                <Stat
                  label="Break-even"
                  value={`$${analysis.be.toFixed(2)}`}
                  sub={`${fmtPct(((analysis.be - book.spot) / book.spot) * 100, 1)} from today`}
                />
                <Stat
                  label="Chance of profit"
                  value={`${Math.round(analysis.pop * 100)}%`}
                  sub={analysis.probItm != null ? `${Math.round(analysis.probItm * 100)}% it finishes in the money` : undefined}
                />
                <Stat
                  label="Max loss"
                  value={fmtSigned(-analysis.profile.maxLoss)}
                  tone="loss"
                  sub={`Max gain ${Number.isFinite(analysis.profile.maxGain) ? fmtSigned(analysis.profile.maxGain) : "unlimited"}`}
                />
              </dl>

              <ScenarioPanel
                title="Profit & loss"
                legs={analysis.legs}
                ticker={chain.ticker}
                spot={book.spot}
                expiry={expiry}
                daysLeft={daysLeft}
                T={book.T}
                atmIv={analysis.iv}
                expectedMove={analysis.expectedMove}
                r={r}
                scenario={sc}
                onScenario={(patch) => setScenario({ ...sc, ...patch, key: scenarioKey })}
                subject={`this ${typeWord.toLowerCase()}`}
              />
            </>
          )}
        </section>

        {/* ── 3 · IS THE PRICE FAIR? ───────────────────────────────── */}
        <aside aria-labelledby="h-fair" className="flex flex-col gap-4 lg:col-start-2 xl:col-start-auto">
          <h2 id="h-fair" className={eyebrow} style={{ color: "var(--color-fg-muted)" }}>
            3 · Is the price fair?
          </h2>
          {analysis && book && chain && (
            <>
              <VerdictCard
                atmIv={analysis.iv}
                bars={history?.bars ?? null}
                view={side === "buy" ? "up" : "flat"}
                showConeLink={false}
              >
                <div className="flex flex-col gap-1.5 text-[0.82rem]">
                  <div className="flex justify-between">
                    <span style={{ color: "var(--color-fg-muted)" }}>Market mid</span>
                    <span className="font-mono">${analysis.mid.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span style={{ color: "var(--color-fg-muted)" }}>
                      Black-Scholes at ATM IV ({(book.atmIv * 100).toFixed(1)}%)
                    </span>
                    <span className="font-mono">{analysis.modelPrice != null ? `$${analysis.modelPrice.toFixed(2)}` : "—"}</span>
                  </div>
                  <p className="text-xs leading-relaxed" style={{ color: "var(--color-fg-subtle)" }}>
                    {skewNote(analysis.iv, book.atmIv, selected!.type, selected!.strike, book.spot)}
                  </p>
                </div>
              </VerdictCard>

              <GreeksCard
                title="What moves it (per contract)"
                ticker={chain.ticker}
                greeks={analysis.greeks}
              >
                <div className="flex justify-between gap-3">
                  <span style={{ color: "var(--color-fg-muted)" }}>
                    Delta change per +$1<span style={{ color: "var(--color-fg-subtle)" }}> · Γ</span>
                  </span>
                  <span className="font-mono tabular-nums">
                    {analysis.greeks.gammaShares >= 0 ? "+" : "\u2212"}
                    {Math.abs(analysis.greeks.gammaShares / 100).toFixed(3)}
                  </span>
                </div>
                <p className="font-mono text-[0.72rem]" style={{ color: "var(--color-fg-subtle)" }}>
                  Δ {analysis.delta != null ? (side === "buy" ? analysis.delta : -analysis.delta).toFixed(2) : "—"} · IV{" "}
                  {(analysis.iv * 100).toFixed(1)}%
                </p>
                <GreekExplainer />
              </GreeksCard>

              <section aria-labelledby="h-assume" className="surface-1 flex flex-col gap-3 p-4">
                <h3 id="h-assume" className="text-xs font-semibold" style={{ color: "var(--color-fg-muted)" }}>
                  Assumptions
                </h3>
                <div className="grid grid-cols-2 gap-2">
                  <NumberField id="ex-r" label="Interest rate %" value={rPct} onChange={setRPct} step={0.05} />
                  <NumberField id="ex-q" label="Dividend yield %" value={qPct} onChange={setQPct} step={0.05} />
                </div>
                {builderHref && (
                  <Link href={builderHref} className="text-sm underline" style={{ color: "var(--color-accent)" }}>
                    Open this contract in the Strategy builder →
                  </Link>
                )}
              </section>
            </>
          )}
        </aside>
      </div>

      {/* ── 4 · VOLATILITY ─────────────────────────────────────────── */}
      {chain && (
        <section id="volatility" aria-labelledby="h-vol" className="flex scroll-mt-20 flex-col gap-4">
          <h2 id="h-vol" className={eyebrow} style={{ color: "var(--color-fg-muted)" }}>
            4 · Volatility for {chain.ticker}
          </h2>
          {volSurface && volSurface.expirations.length > 0 && <VolSurfaceSection surface={volSurface} />}
          {history && history.bars.length > 130 && <VolConeChart history={history} currentIV={book?.atmIv ?? null} />}
          {history?.realizedVol != null && (
            <p className="text-center text-[0.72rem]" style={{ color: "var(--color-fg-subtle)" }}>
              1-year realized volatility: {(history.realizedVol * 100).toFixed(1)}%
              {chain.quote.iv30 != null && <> · CBOE IV30: {(chain.quote.iv30 * 100).toFixed(1)}%</>}
            </p>
          )}
        </section>
      )}
    </div>
  );
}

// ── Pieces ─────────────────────────────────────────────────────────────

function ExpiryPicker({
  expirations,
  value,
  onChange,
}: {
  expirations: string[];
  value: string | null;
  onChange: (e: string) => void;
}) {
  const quick = expirations.slice(0, 6);
  const inQuick = value != null && quick.includes(value);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Expiration">
        {quick.map((e) => {
          const on = e === value;
          return (
            <button
              key={e}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(e)}
              className="h-9 rounded-md border px-2.5 text-xs"
              style={{
                borderColor: on ? "var(--color-accent)" : "var(--color-border)",
                background: on ? "var(--color-accent-soft)" : "var(--color-surface-2)",
                color: on ? "var(--color-fg-default)" : "var(--color-fg-muted)",
                fontWeight: on ? 600 : 500,
              }}
            >
              {fmtShort(parseIso(e))} · {Math.round(daysToExpiration(e))}d
            </button>
          );
        })}
      </div>
      {expirations.length > quick.length && (
        <div className="flex items-center gap-2">
          <label htmlFor="ex-more-exp" className="text-xs" style={{ color: "var(--color-fg-subtle)" }}>
            Later dates
          </label>
          <select
            id="ex-more-exp"
            value={inQuick ? "" : (value ?? "")}
            onChange={(e) => e.target.value && onChange(e.target.value)}
            className="h-9 flex-1 rounded-md border px-2 text-xs"
            style={inputStyle}
          >
            <option value="">Choose…</option>
            {expirations.slice(quick.length).map((e) => (
              <option key={e} value={e}>
                {fmtDate(e)} · {Math.round(daysToExpiration(e))} days
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}

type Book = {
  rows: Map<number, { call?: OptionContract; put?: OptionContract }>;
  strikes: number[];
  spot: number;
  T: number;
  atmIv: number;
};

function ChainLadder({
  book,
  strikes,
  selected,
  expiryLabel,
  r,
  q,
  onPick,
}: {
  book: Book;
  strikes: number[];
  selected: { type: OptType; strike: number };
  expiryLabel: string;
  r: number;
  q: number;
  onPick: (type: OptType, strike: number) => void;
}) {
  const spotIdx = strikes.findIndex((k) => k > book.spot);
  return (
    <table className="w-full table-fixed border-separate font-mono text-[0.75rem] tabular-nums" style={{ borderSpacing: "0 2px" }}>
      <caption className="sr-only">
        Option chain for {expiryLabel}. Calls on the left, puts on the right. Each price is a button that selects that
        contract.
      </caption>
      <thead>
        <tr className="font-sans text-[0.62rem] font-semibold uppercase tracking-[0.08em]" style={{ color: "var(--color-fg-subtle)" }}>
          <th scope="col" className="pb-1 pr-2 text-right">
            Call · IV · Δ
          </th>
          <th scope="col" className="w-14 pb-1 text-center">
            Strike
          </th>
          <th scope="col" className="pb-1 pl-2 text-right">
            Put · IV · Δ
          </th>
        </tr>
      </thead>
      <tbody>
        {strikes.map((k, i) => {
          const row = book.rows.get(k)!;
          return (
            <FragmentRow key={k} showSpot={i === spotIdx} spot={book.spot}>
              <tr>
                <td className="p-0">
                  <QuoteButton
                    c={row.call}
                    itm={k < book.spot}
                    on={selected.type === "call" && selected.strike === k}
                    onClick={() => onPick("call", k)}
                    book={book}
                    r={r}
                    q={q}
                    label={`${expiryLabel} ${fmtStrike(k)} call`}
                  />
                </td>
                <th scope="row" className="text-center text-[0.78rem] font-semibold">
                  {fmtStrike(k)}
                </th>
                <td className="p-0">
                  <QuoteButton
                    c={row.put}
                    itm={k > book.spot}
                    on={selected.type === "put" && selected.strike === k}
                    onClick={() => onPick("put", k)}
                    book={book}
                    r={r}
                    q={q}
                    label={`${expiryLabel} ${fmtStrike(k)} put`}
                  />
                </td>
              </tr>
            </FragmentRow>
          );
        })}
      </tbody>
    </table>
  );
}

function FragmentRow({ showSpot, spot, children }: { showSpot: boolean; spot: number; children: React.ReactNode }) {
  return (
    <>
      {showSpot && (
        <tr aria-hidden="true">
          <td colSpan={3} className="py-1">
            <div className="flex items-center gap-2 text-[0.7rem]" style={{ color: "var(--color-accent)" }}>
              <span className="h-px flex-1" style={{ background: "var(--color-accent)" }} />
              Stock ${spot.toFixed(2)}
              <span className="h-px flex-1" style={{ background: "var(--color-accent)" }} />
            </div>
          </td>
        </tr>
      )}
      {children}
    </>
  );
}

function QuoteButton({
  c,
  itm,
  on,
  onClick,
  book,
  r,
  q,
  label,
}: {
  c: OptionContract | undefined;
  itm: boolean;
  on: boolean;
  onClick: () => void;
  book: Book;
  r: number;
  q: number;
  label: string;
}) {
  if (!c) return <div className="h-8 text-center" style={{ color: "var(--color-fg-subtle)" }}>—</div>;
  const px = priceOf(c)!;
  const iv = contractIv(c, book.spot, book.T, r, q);
  let delta = c.delta;
  if (delta == null && iv != null) {
    const res = priceBS({ S: book.spot, K: c.strike, T: book.T, r, q, sigma: iv });
    delta = res ? (c.type === "call" ? res.greeks.deltaCall : res.greeks.deltaPut) : null;
  }
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={`${label}, mid $${px.toFixed(2)}${iv != null ? `, IV ${(iv * 100).toFixed(1)}%` : ""}`}
      onClick={onClick}
      className="grid h-8 w-full grid-cols-3 items-center rounded-md px-1.5 text-right transition-colors"
      style={{
        background: on ? "var(--color-accent-soft)" : itm ? "color-mix(in oklab, var(--color-accent) 6%, transparent)" : "transparent",
        outline: on ? "1px solid var(--color-accent)" : undefined,
      }}
    >
      <span style={{ fontWeight: on ? 700 : 500 }}>{px.toFixed(2)}</span>
      <span style={{ color: "var(--color-fg-muted)" }}>{iv != null ? (iv * 100).toFixed(1) : "—"}</span>
      <span style={{ color: "var(--color-fg-muted)" }}>{delta != null ? delta.toFixed(2).replace(/^(-?)0\./, "$1.") : "—"}</span>
    </button>
  );
}

function Segmented({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: Array<{ id: string; label: string }>;
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <div role="group" aria-label={label} className="flex overflow-hidden rounded-md border" style={{ borderColor: "var(--color-border-strong)" }}>
      {options.map((o) => {
        const on = o.id === value;
        return (
          <button
            key={o.id}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(o.id)}
            className="h-10 px-4 text-sm"
            style={{
              background: on ? "var(--color-accent)" : "var(--color-surface-2)",
              color: on ? "#0a0a0a" : "var(--color-fg-muted)",
              fontWeight: on ? 600 : 500,
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function NumberField({
  id,
  label,
  value,
  onChange,
  step,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (n: number) => void;
  step: number;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-[0.7rem]" style={{ color: "var(--color-fg-subtle)" }}>
        {label}
      </label>
      <input
        id={id}
        type="number"
        inputMode="decimal"
        min={0}
        max={20}
        step={step}
        value={value}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n) && n >= 0 && n <= 20) onChange(n);
        }}
        className="h-10 rounded-md border px-2.5 font-mono text-sm"
        style={inputStyle}
      />
    </div>
  );
}

function GreekExplainer() {
  return (
    <details className="text-xs" style={{ color: "var(--color-fg-muted)" }}>
      <summary className="cursor-pointer py-1" style={{ color: "var(--color-fg-subtle)" }}>
        What do these mean?
      </summary>
      <dl className="mt-1 flex flex-col gap-2 leading-relaxed">
        <div>
          <dt className="font-semibold" style={{ color: "var(--color-fg-default)" }}>Delta (Δ)</dt>
          <dd>
            How much the option&apos;s price moves for every $1 change in the stock. A call with Δ = 0.50 gains about
            $0.50 per share if the stock rises $1. It&apos;s also a rough guide to the odds of finishing in the money.
          </dd>
        </div>
        <div>
          <dt className="font-semibold" style={{ color: "var(--color-fg-default)" }}>Gamma (Γ)</dt>
          <dd>
            How fast Delta changes as the stock moves. High gamma near expiry means small moves can flip the option
            quickly between in and out of the money.
          </dd>
        </div>
        <div>
          <dt className="font-semibold" style={{ color: "var(--color-fg-default)" }}>Theta (Θ)</dt>
          <dd>
            How much value the option loses each day from the clock ticking, holding everything else constant. It&apos;s
            the &quot;rent&quot; of owning an option — and the income for selling one.
          </dd>
        </div>
        <div>
          <dt className="font-semibold" style={{ color: "var(--color-fg-default)" }}>Vega (ν)</dt>
          <dd>
            How sensitive the price is to implied volatility — the market&apos;s expectation of how much the stock will
            move. Rising IV helps option buyers and hurts sellers.
          </dd>
        </div>
      </dl>
    </details>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────

function skewNote(iv: number, atmIv: number, type: OptType, strike: number, spot: number): string {
  const diff = (iv - atmIv) * 100;
  const where = type === "call" ? (strike >= spot ? "Upside calls" : "In-the-money calls") : strike <= spot ? "Downside puts" : "In-the-money puts";
  if (Math.abs(diff) < 0.3) return "This contract trades at about the same IV as at-the-money options, so the flat-vol model and the market agree.";
  return diff < 0
    ? `${where} trade at lower IV than at-the-money (skew), so this one is cheaper than a flat-vol model says.`
    : `${where} trade at higher IV than at-the-money (skew), so this one costs more than a flat-vol model says.`;
}
