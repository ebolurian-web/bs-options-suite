"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GreeksCard, Stat } from "@/components/position-cards";
import { ScenarioPanel, type Scenario } from "@/components/scenario-panel";
import { priceBS } from "@/lib/bs";
import { ApiClientError, fetchChain } from "@/lib/client";
import { fmtShort, fmtSigned, fmtStrike, parseIso, usd } from "@/lib/format";
import {
  daysToExpiration,
  dollarGreeks,
  netCost,
  payoffProfile,
  priceDensity,
  probabilityOfProfit,
  scenarioPnl,
  type PositionLeg,
} from "@/lib/position";
import { buildPreset, type Preset, type StrategyLeg } from "@/lib/strategy";
import {
  decodeStrategy,
  encodeStrategy,
  listSaved,
  removeSaved,
  saveStrategy,
  type SavedStrategy,
} from "@/lib/strategy-codec";
import { atmImpliedVol, contractIv, defaultExpiration, priceOf } from "@/lib/trade-ideas";
import type { OptionChain, OptionContract } from "@/lib/types";

const DEFAULT_TICKER = "SPY";
const DEFAULT_TEMPLATE: Preset = "iron-condor";

const TEMPLATE_GROUPS: Array<{ label: string; items: Array<{ id: Preset; name: string }> }> = [
  { label: "Bullish", items: [{ id: "long-call", name: "Long call" }, { id: "bull-call", name: "Bull call spread" }] },
  { label: "Bearish", items: [{ id: "long-put", name: "Long put" }, { id: "bear-put", name: "Bear put spread" }] },
  {
    label: "Neutral",
    items: [
      { id: "iron-condor", name: "Iron condor" },
      { id: "iron-butterfly", name: "Iron butterfly" },
      { id: "butterfly", name: "Long call butterfly" },
    ],
  },
  { label: "Big move", items: [{ id: "long-straddle", name: "Long straddle" }, { id: "long-strangle", name: "Long strangle" }] },
  { label: "Income", items: [{ id: "covered-call", name: "Covered call" }, { id: "cash-put", name: "Cash-secured put" }] },
];
const templateName = (id: Preset) =>
  TEMPLATE_GROUPS.flatMap((g) => g.items).find((t) => t.id === id)?.name ?? "Custom position";

type BuilderLeg = {
  id: number;
  action: "buy" | "sell";
  type: "call" | "put" | "stock";
  qty: number;
  /** Option strike; ignored for stock. */
  strike: number;
  expiry: string;
  /** Typed-in price; null = follow the live market. */
  override: number | null;
};

type Priced = BuilderLeg & {
  premium: number;
  iv: number;
  status: "live" | "edited" | "model";
  contract: OptionContract | null;
};

const eyebrow = "text-[0.68rem] font-semibold uppercase tracking-[0.12em]";
const inputStyle = {
  background: "var(--color-surface-2)",
  borderColor: "var(--color-border-strong)",
  color: "var(--color-fg-default)",
} as const;

export function BuilderView() {
  const [tickerInput, setTickerInput] = useState(DEFAULT_TICKER);
  const [chain, setChain] = useState<OptionChain | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const [legs, setLegs] = useState<BuilderLeg[]>([]);
  const idRef = useRef(0);
  const [templateId, setTemplateId] = useState<Preset | "">("");
  const [rPct, setRPct] = useState(4.5);
  const [chartMode, setChartMode] = useState<"pnl" | "dist">("pnl");
  const [scenario, setScenario] = useState<(Scenario & { key: string }) | null>(null);

  const [saved, setSaved] = useState<SavedStrategy[]>([]);
  const [name, setName] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const [shareState, setShareState] = useState<{ copied: boolean; url: string | null }>({ copied: false, url: null });

  const r = rPct / 100;
  const newId = () => idRef.current++;

  // ── Chain helpers ──
  const listed = useCallback(
    (type: "call" | "put", expiry: string) =>
      chain
        ? Array.from(
            new Set(
              chain.contracts.filter((c) => c.type === type && c.expiration === expiry && priceOf(c) != null).map((c) => c.strike),
            ),
          ).sort((a, b) => a - b)
        : [],
    [chain],
  );

  /** Move a leg onto a listed contract: nearest listed expiry, then nearest listed strike. */
  const snap = useCallback(
    (l: BuilderLeg, c: OptionChain): BuilderLeg => {
      if (l.type === "stock" || !c.expirations.length) return l;
      const target = daysToExpiration(l.expiry);
      const expiry = c.expirations.includes(l.expiry)
        ? l.expiry
        : c.expirations.reduce((a, b) =>
            Math.abs(daysToExpiration(b) - target) < Math.abs(daysToExpiration(a) - target) ? b : a,
          );
      const ks = Array.from(
        new Set(c.contracts.filter((x) => x.type === l.type && x.expiration === expiry && priceOf(x) != null).map((x) => x.strike)),
      );
      if (!ks.length) return { ...l, expiry };
      const strike = ks.reduce((a, b) => (Math.abs(b - l.strike) < Math.abs(a - l.strike) ? b : a));
      return { ...l, expiry, strike };
    },
    [],
  );

  const fromTemplate = useCallback(
    (id: Preset, c: OptionChain): BuilderLeg[] => {
      const exp = defaultExpiration(c.expirations) ?? c.expirations[0];
      return buildPreset(id, c.quote.price, exp).map((l) =>
        snap(
          {
            id: newId(),
            action: l.action,
            type: l.type,
            qty: l.qty,
            strike: l.strike,
            expiry: exp,
            override: null,
          },
          c,
        ),
      );
    },
    [snap],
  );

  // ── Load ──
  const pendingRef = useRef<{ legs: StrategyLeg[]; note: string } | null>(null);

  const loadTicker = useCallback(
    async (raw: string, opts: { keepLegs?: boolean } = {}) => {
      const t = raw.trim().toUpperCase();
      if (!t) return;
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setBusy(true);
      setError(null);
      try {
        const c = await fetchChain(t, ctrl.signal);
        setChain(c);
        setTickerInput(c.ticker);
        const pending = pendingRef.current;
        pendingRef.current = null;
        if (pending) {
          // Shared link / saved strategy / hand-off: snap to listed contracts,
          // follow live prices where the contract still exists.
          let moved = 0;
          const next = pending.legs.map((l) => {
            const base: BuilderLeg = {
              id: newId(),
              action: l.action,
              type: l.type,
              qty: l.qty,
              strike: l.strike,
              expiry: l.expiry,
              override: null,
            };
            const s = snap(base, c);
            if (s.strike !== base.strike || s.expiry !== base.expiry) moved++;
            return s;
          });
          setLegs(next);
          setTemplateId("");
          setAnnouncement(
            `${pending.note} ${next.length} leg${next.length === 1 ? "" : "s"} on ${c.ticker}.` +
              (moved ? ` ${moved} moved to the nearest listed contract.` : ""),
          );
        } else if (!opts.keepLegs) {
          setLegs(fromTemplate(DEFAULT_TEMPLATE, c));
          setTemplateId(DEFAULT_TEMPLATE);
        } else {
          setLegs((prev) => prev.map((l) => snap(l, c)));
        }
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
    },
    [fromTemplate, snap],
  );

  // Hydrate: ?s= shared strategy (also used by Trade ideas / Option explorer hand-offs), else SPY.
  useEffect(() => {
    // One-time sync from localStorage and the URL on mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSaved(listSaved());
    const s = new URLSearchParams(window.location.search).get("s");
    const decoded = s ? decodeStrategy(s) : null;
    if (decoded && decoded.legs.length) {
      pendingRef.current = { legs: decoded.legs, note: "Loaded shared strategy:" };
      if (decoded.rPct >= 0 && decoded.rPct <= 20) setRPct(decoded.rPct);
      void loadTicker(decoded.ticker ?? DEFAULT_TICKER);
      return;
    }
    if (s) setAnnouncement("That shared strategy link could not be read. Loaded the default instead.");
    void loadTicker(DEFAULT_TICKER);
  }, [loadTicker]);

  // ── Pricing ──
  const spot = chain?.quote.price ?? 0;

  const priced = useMemo<Priced[]>(() => {
    if (!chain) return [];
    return legs.map((l) => {
      if (l.type === "stock") {
        const premium = l.override ?? spot;
        return { ...l, strike: premium, premium, iv: 0, status: l.override != null ? "edited" : "live", contract: null };
      }
      const contract =
        chain.contracts.find((c) => c.type === l.type && c.strike === l.strike && c.expiration === l.expiry) ?? null;
      const T = Math.max(1 / 365.25, daysToExpiration(l.expiry) / 365.25);
      const atm = atmImpliedVol(chain, l.expiry, r) ?? chain.quote.iv30 ?? 0.25;
      const iv = (contract && contractIv(contract, spot, T, r, 0)) ?? atm;
      const mid = contract ? priceOf(contract) : null;
      let premium = l.override ?? mid;
      let status: Priced["status"] = l.override != null ? "edited" : "live";
      if (premium == null) {
        const res = priceBS({ S: spot, K: l.strike, T, r, sigma: iv });
        premium = res ? (l.type === "call" ? res.call : res.put) : 0;
        status = "model";
      }
      return { ...l, premium, iv, status, contract };
    });
  }, [legs, chain, spot, r]);

  // Reference expiry = the earliest option leg (or ~45 days out with no options).
  const ref = useMemo(() => {
    const opts = priced.filter((l) => l.type !== "stock");
    const refExpiry = opts.length
      ? opts.reduce((a, b) => (daysToExpiration(b.expiry) < daysToExpiration(a.expiry) ? b : a)).expiry
      : chain
        ? defaultExpiration(chain.expirations)
        : null;
    const refDays = refExpiry ? daysToExpiration(refExpiry) : 30;
    const T = Math.max(1 / 365.25, refDays / 365.25);
    const atmIv = chain && refExpiry ? (atmImpliedVol(chain, refExpiry, r) ?? chain.quote.iv30 ?? 0.25) : 0.25;
    return { refExpiry, refDays, T, atmIv, expectedMove: spot * atmIv * Math.sqrt(T) };
  }, [priced, chain, spot, r]);
  const { refExpiry, refDays, T, atmIv, expectedMove } = ref;

  const posLegs: PositionLeg[] = useMemo(
    () =>
      priced.map((l) => ({
        action: l.action,
        type: l.type,
        strike: l.type === "stock" ? l.premium : l.strike,
        qty: l.qty,
        premium: l.premium,
        iv: l.iv,
        tExtra: l.type === "stock" ? 0 : Math.max(0, (daysToExpiration(l.expiry) - ref.refDays) / 365.25),
      })),
    [priced, ref],
  );

  const stats = useMemo(() => {
    if (!posLegs.length || !spot) return null;
    return {
      cost: netCost(posLegs),
      profile: payoffProfile(posLegs, r),
      pop: probabilityOfProfit(posLegs, spot, ref.atmIv, ref.T, r),
      greeks: dollarGreeks(posLegs, spot, ref.T, r),
    };
  }, [posLegs, spot, ref, r]);

  // ── Scenario ──
  const daysLeft = Math.floor(refDays);
  const scenarioKey = `${chain?.ticker}|${legs.map((l) => `${l.action}${l.type}${l.strike}${l.expiry}${l.qty}`).join(",")}`;
  const sc: Scenario =
    scenario?.key === scenarioKey ? scenario : { price: +spot.toFixed(2), day: Math.floor(daysLeft / 2), iv: 0 };

  // ── Leg edits ──
  const update = (id: number, patch: Partial<BuilderLeg>) => {
    setLegs((prev) =>
      prev.map((l) => {
        if (l.id !== id) return l;
        const next = { ...l, ...patch };
        // Changing contract details re-follows the market for that leg.
        if (patch.strike != null || patch.type != null || patch.expiry != null) next.override = null;
        return patch.expiry != null && chain ? snap(next, chain) : next;
      }),
    );
    setTemplateId("");
  };

  const addLeg = (type: "call" | "put" | "stock") => {
    if (!chain) return;
    const exp = refExpiry ?? defaultExpiration(chain.expirations) ?? chain.expirations[0];
    const leg: BuilderLeg = {
      id: newId(),
      action: "buy",
      type,
      qty: type === "stock" ? 100 : 1,
      strike: spot,
      expiry: exp,
      override: null,
    };
    setLegs((prev) => [...prev, snap(leg, chain)]);
    setTemplateId("");
    setAnnouncement(`Added ${type === "stock" ? "100 shares" : `a ${type}`}.`);
  };

  const applyTemplate = (id: Preset) => {
    setTemplateId(id);
    if (!chain) return;
    const next = fromTemplate(id, chain);
    setLegs(next);
    setAnnouncement(`Loaded ${templateName(id)} — ${next.length} leg${next.length === 1 ? "" : "s"}.`);
  };

  const hasEdits = legs.some((l) => l.override != null);

  // ── Save / share ──
  const asStrategyLegs = (): StrategyLeg[] =>
    priced.map((l, i) => ({
      id: i,
      action: l.action,
      type: l.type,
      qty: l.qty,
      strike: l.type === "stock" ? +l.premium.toFixed(2) : l.strike,
      premium: +l.premium.toFixed(2),
      expiry: l.expiry,
    }));

  const share = async () => {
    if (!chain || !legs.length) return;
    const s = encodeStrategy({ ticker: chain.ticker, spot, volPct: atmIv * 100, rPct, legs: asStrategyLegs() });
    const url = `${window.location.origin}${window.location.pathname}?s=${s}`;
    window.history.replaceState(null, "", `${window.location.pathname}?s=${s}`);
    try {
      await navigator.clipboard.writeText(url);
      setShareState({ copied: true, url: null });
      setAnnouncement("Share link copied to clipboard.");
      setTimeout(() => setShareState({ copied: false, url: null }), 2000);
    } catch {
      setShareState({ copied: false, url });
      setAnnouncement("Clipboard unavailable. Copy the link shown below.");
    }
  };

  const save = () => {
    if (!chain || !legs.length) return;
    const label = name.trim() || `${chain.ticker} ${templateId ? templateName(templateId) : "position"}`;
    saveStrategy({ name: label.slice(0, 80), ticker: chain.ticker, spot, volPct: atmIv * 100, rPct, legs: asStrategyLegs() });
    setSaved(listSaved());
    setName("");
    setAnnouncement(`Saved “${label}”.`);
  };

  const loadSaved = (s: SavedStrategy) => {
    pendingRef.current = { legs: s.legs, note: `Loaded “${s.name}”:` };
    if (s.rPct >= 0 && s.rPct <= 20) setRPct(s.rPct);
    void loadTicker(s.ticker ?? DEFAULT_TICKER);
  };

  const positionName = templateId ? templateName(templateId) : legs.length ? "Custom position" : "No position";
  const change =
    chain?.quote.previousClose ? ((chain.quote.price - chain.quote.previousClose) / chain.quote.previousClose) * 100 : null;

  return (
    <div className="grid gap-5 lg:grid-cols-[420px_minmax(0,1fr)] xl:grid-cols-[420px_minmax(0,1fr)_300px]">
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>

      {/* ── 1 · BUILD ────────────────────────────────────────────── */}
      <aside aria-labelledby="h-build" className="surface-1 flex flex-col gap-4 p-4 md:p-5 lg:row-span-2 xl:row-span-1">
        <h2 id="h-build" className={eyebrow} style={{ color: "var(--color-fg-muted)" }}>
          1 · Build the position
        </h2>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void loadTicker(tickerInput, { keepLegs: false });
          }}
          className="flex flex-col gap-1.5"
        >
          <label htmlFor="sb-ticker" className="text-[0.72rem] font-semibold" style={{ color: "var(--color-fg-muted)" }}>
            Ticker
          </label>
          <div className="flex gap-2">
            <input
              id="sb-ticker"
              value={tickerInput}
              onChange={(e) => setTickerInput(e.target.value.toUpperCase())}
              maxLength={10}
              autoComplete="off"
              spellCheck={false}
              aria-invalid={error ? "true" : "false"}
              aria-describedby={error ? "sb-ticker-error" : "sb-ticker-quote"}
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
            <p id="sb-ticker-error" role="alert" className="text-xs" style={{ color: "var(--color-error)" }}>
              {error}
            </p>
          ) : (
            <p id="sb-ticker-quote" className="flex justify-between font-mono text-[0.82rem]">
              <span>{chain ? `$${spot.toFixed(2)}` : busy ? "Loading…" : "—"}</span>
              {change != null && (
                <span style={{ color: change >= 0 ? "var(--color-success)" : "var(--color-error)" }}>
                  {change >= 0 ? "+" : "−"}
                  {Math.abs(change).toFixed(2)}%
                </span>
              )}
            </p>
          )}
        </form>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="sb-template" className="text-[0.72rem] font-semibold" style={{ color: "var(--color-fg-muted)" }}>
            Start from a template
          </label>
          <select
            id="sb-template"
            value={templateId}
            onChange={(e) => e.target.value && applyTemplate(e.target.value as Preset)}
            disabled={!chain}
            aria-describedby="sb-template-hint"
            className="h-11 rounded-md border px-2.5 text-sm"
            style={inputStyle}
          >
            <option value="">{legs.length ? "Custom (edited)" : "Choose a template…"}</option>
            {TEMPLATE_GROUPS.map((g) => (
              <optgroup key={g.label} label={g.label}>
                {g.items.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <p id="sb-template-hint" className="text-xs" style={{ color: "var(--color-fg-subtle)" }}>
            Replaces your legs. Strikes snap to listed contracts near today&apos;s price, ~45 days out.
          </p>
        </div>

        <LegsEditor
          priced={priced}
          chain={chain}
          listed={listed}
          onUpdate={update}
          onRemove={(id) => {
            setLegs((prev) => prev.filter((l) => l.id !== id));
            setTemplateId("");
            setAnnouncement("Leg removed.");
          }}
        />

        <div className="grid grid-cols-3 gap-2" role="group" aria-label="Add a leg">
          {(["call", "put", "stock"] as const).map((t) => (
            <button
              key={t}
              type="button"
              disabled={!chain}
              onClick={() => addLeg(t)}
              className="h-10 rounded-md border border-dashed text-sm disabled:opacity-50"
              style={{ borderColor: "var(--color-border-strong)", color: "var(--color-fg-default)" }}
            >
              + {t === "stock" ? "100 shares" : t === "call" ? "Call" : "Put"}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs leading-relaxed" style={{ color: "var(--color-fg-subtle)" }}>
            Prices fill from live bid/ask mids. Type over one to test a different fill.
          </p>
          {hasEdits && (
            <button
              type="button"
              onClick={() => {
                setLegs((prev) => prev.map((l) => ({ ...l, override: null })));
                setAnnouncement("Prices reset to the live market.");
              }}
              className="h-9 rounded-md border px-3 text-xs font-semibold"
              style={{ borderColor: "var(--color-warn)", color: "var(--color-warn)" }}
            >
              Reset prices
            </button>
          )}
        </div>
      </aside>

      {/* ── 2 · WHAT IT DOES ─────────────────────────────────────── */}
      <section aria-labelledby="h-does" className="flex min-w-0 flex-col gap-4">
        <h2 id="h-does" className={eyebrow} style={{ color: "var(--color-fg-muted)" }}>
          2 · What it does
        </h2>

        {!chain || !refExpiry ? (
          <div className="surface-1 p-6 text-sm" style={{ color: "var(--color-fg-muted)" }}>
            {busy ? `Loading ${tickerInput} option chain…` : "Load a ticker to start building."}
          </div>
        ) : !stats ? (
          <div className="surface-1 p-6 text-sm" style={{ color: "var(--color-fg-muted)" }}>
            Pick a template or add a leg to see what the position does.
          </div>
        ) : (
          <>
            <dl className="grid grid-cols-2 gap-3 md:grid-cols-5">
              <Stat label={stats.cost >= 0 ? "Net cost" : "Net credit"} value={usd(Math.abs(stats.cost))} />
              <Stat label="Max gain" value={fmtSigned(stats.profile.maxGain)} tone="gain" />
              <Stat label="Max loss" value={fmtSigned(-stats.profile.maxLoss)} tone="loss" />
              <Stat
                label={`Break-even${stats.profile.breakEvens.length > 1 ? "s" : ""}`}
                value={stats.profile.breakEvens.length ? stats.profile.breakEvens.map((b) => b.toFixed(2)).join(" / ") : "—"}
                small
              />
              <Stat
                label="Chance of profit"
                value={`${Math.round(stats.pop * 100)}%`}
                sub={stats.profile.exact ? undefined : `at ${fmtShort(parseIso(refExpiry))} (estimate)`}
              />
            </dl>

            <ScenarioPanel
              title={`${positionName} · ${fmtShort(parseIso(refExpiry))}`}
              headerExtra={
                <div role="group" aria-label="Chart" className="flex overflow-hidden rounded-md border" style={{ borderColor: "var(--color-border-strong)" }}>
                  {(
                    [
                      ["pnl", "Profit & loss"],
                      ["dist", "Where it could land"],
                    ] as const
                  ).map(([id, text]) => (
                    <button
                      key={id}
                      type="button"
                      aria-pressed={chartMode === id}
                      onClick={() => setChartMode(id)}
                      className="h-8 px-3 text-xs"
                      style={{
                        background: chartMode === id ? "var(--color-surface-3)" : "var(--color-surface-2)",
                        color: chartMode === id ? "var(--color-fg-default)" : "var(--color-fg-muted)",
                        fontWeight: chartMode === id ? 600 : 500,
                      }}
                    >
                      {text}
                    </button>
                  ))}
                </div>
              }
              legs={posLegs}
              ticker={chain.ticker}
              spot={spot}
              expiry={refExpiry}
              daysLeft={daysLeft}
              T={T}
              atmIv={null}
              expectedMove={expectedMove}
              r={r}
              scenario={sc}
              onScenario={(patch) => setScenario({ ...sc, ...patch, key: scenarioKey })}
              subject="the position"
            >
              {chartMode === "dist" ? (
                <LandingChart legs={posLegs} spot={spot} sigma={atmIv} T={T} r={r} expectedMove={expectedMove} pop={stats.pop} />
              ) : undefined}
            </ScenarioPanel>
          </>
        )}
      </section>

      {/* ── 3 · RISKS & SAVING ───────────────────────────────────── */}
      <aside aria-labelledby="h-risks" className="flex flex-col gap-4 lg:col-start-2 xl:col-start-auto">
        <h2 id="h-risks" className={eyebrow} style={{ color: "var(--color-fg-muted)" }}>
          3 · Risks &amp; saving
        </h2>
        {stats && chain && (
          <GreeksCard title="What moves this position" ticker={chain.ticker} greeks={stats.greeks} note={characterize(stats.greeks, spot)} />
        )}

        <section aria-labelledby="h-save" className="surface-1 flex flex-col gap-2.5 p-4">
          <h3 id="h-save" className="text-xs font-semibold" style={{ color: "var(--color-fg-muted)" }}>
            Save &amp; share
          </h3>
          <label htmlFor="sb-name" className="text-[0.7rem]" style={{ color: "var(--color-fg-subtle)" }}>
            Name
          </label>
          <input
            id="sb-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={chain ? `${chain.ticker} ${positionName}` : "My strategy"}
            maxLength={80}
            className="h-10 rounded-md border px-2.5 text-sm"
            style={inputStyle}
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={save}
              disabled={!legs.length}
              className="press-scale h-11 flex-1 rounded-md text-sm font-semibold disabled:opacity-50"
              style={{ background: "var(--color-accent)", color: "#0a0a0a" }}
            >
              Save
            </button>
            <button
              type="button"
              onClick={share}
              disabled={!legs.length}
              className="press-scale h-11 flex-1 rounded-md border text-sm font-semibold disabled:opacity-50"
              style={{ borderColor: "var(--color-border-strong)", background: "var(--color-surface-2)" }}
            >
              {shareState.copied ? "Copied" : "Share link"}
            </button>
          </div>
          {shareState.url && (
            <div className="flex flex-col gap-1">
              <label htmlFor="sb-share-url" className="text-[0.7rem]" style={{ color: "var(--color-fg-subtle)" }}>
                Copy this link
              </label>
              <input
                id="sb-share-url"
                readOnly
                value={shareState.url}
                onFocus={(e) => e.currentTarget.select()}
                className="h-9 rounded-md border px-2 font-mono text-xs"
                style={inputStyle}
              />
            </div>
          )}
          <p className="text-[0.72rem]" style={{ color: "var(--color-fg-subtle)" }}>
            Saved strategies stay in this browser and reopen at the day&apos;s live prices.
          </p>
        </section>

        {saved.length > 0 && (
          <section aria-labelledby="h-saved" className="surface-1 flex flex-col gap-1 p-4">
            <h3 id="h-saved" className="mb-1 text-xs font-semibold" style={{ color: "var(--color-fg-muted)" }}>
              Saved
            </h3>
            <ul className="flex flex-col">
              {saved.map((s) => (
                <li key={s.id} className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => loadSaved(s)}
                    className="flex min-h-10 flex-1 items-center justify-between gap-2 text-left text-[0.82rem] hover:underline"
                  >
                    <span className="truncate">{s.name}</span>
                    <span className="shrink-0 text-xs" style={{ color: "var(--color-fg-subtle)" }}>
                      {s.ticker ?? "—"} · {s.legs.length} leg{s.legs.length === 1 ? "" : "s"}
                    </span>
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete ${s.name}`}
                    onClick={() => {
                      removeSaved(s.id);
                      setSaved(listSaved());
                      setAnnouncement(`Deleted “${s.name}”.`);
                    }}
                    className="h-10 w-8 text-lg"
                    style={{ color: "var(--color-fg-subtle)" }}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        <details className="surface-1 p-4 text-xs" style={{ color: "var(--color-fg-muted)" }}>
          <summary className="cursor-pointer font-semibold">Assumptions</summary>
          <div className="mt-3 flex flex-col gap-1">
            <label htmlFor="sb-r" className="text-[0.7rem]" style={{ color: "var(--color-fg-subtle)" }}>
              Interest rate %
            </label>
            <input
              id="sb-r"
              type="number"
              inputMode="decimal"
              min={0}
              max={20}
              step={0.05}
              value={rPct}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (Number.isFinite(n) && n >= 0 && n <= 20) setRPct(n);
              }}
              className="h-10 rounded-md border px-2.5 font-mono text-sm"
              style={inputStyle}
            />
            <p className="mt-1 leading-relaxed" style={{ color: "var(--color-fg-subtle)" }}>
              Each leg is marked at its own implied volatility. Chance of profit uses the at-the-money IV of the first
              expiry.
            </p>
          </div>
        </details>
      </aside>
    </div>
  );
}

// ── Legs editor ────────────────────────────────────────────────────────

function LegsEditor({
  priced,
  chain,
  listed,
  onUpdate,
  onRemove,
}: {
  priced: Priced[];
  chain: OptionChain | null;
  listed: (type: "call" | "put", expiry: string) => number[];
  onUpdate: (id: number, patch: Partial<BuilderLeg>) => void;
  onRemove: (id: number) => void;
}) {
  if (!priced.length) {
    return (
      <p className="rounded-md border border-dashed p-4 text-center text-sm" style={{ borderColor: "var(--color-border)", color: "var(--color-fg-subtle)" }}>
        No legs yet. Pick a template or add one below.
      </p>
    );
  }
  const cols = "grid grid-cols-[48px_38px_minmax(0,1fr)_60px_60px_22px] items-center gap-1 sm:grid-cols-[52px_42px_minmax(0,1fr)_66px_64px_24px]";
  return (
    <div className="flex flex-col gap-2" role="table" aria-label="Legs">
      <div role="row" className={`${cols} text-[0.6rem] font-semibold uppercase tracking-[0.08em]`} style={{ color: "var(--color-fg-subtle)" }}>
        <span role="columnheader">Side</span>
        <span role="columnheader">Qty</span>
        <span role="columnheader">Contract</span>
        <span role="columnheader">Expiry</span>
        <span role="columnheader" className="text-right">
          Price
        </span>
        <span role="columnheader">
          <span className="sr-only">Remove</span>
        </span>
      </div>
      {priced.map((l, i) => {
        const n = i + 1;
        const buy = l.action === "buy";
        return (
          <div key={l.id} role="row" className={cols}>
            <span role="cell">
              <button
                type="button"
                aria-label={`Leg ${n}: ${buy ? "buying" : "selling"}. Switch to ${buy ? "sell" : "buy"}`}
                onClick={() => onUpdate(l.id, { action: buy ? "sell" : "buy" })}
                className="h-10 w-full rounded-md border text-xs font-semibold"
                style={{
                  borderColor: buy ? "var(--color-success)" : "var(--color-error)",
                  color: buy ? "var(--color-success)" : "var(--color-error)",
                  background: buy
                    ? "color-mix(in oklab, var(--color-success) 10%, transparent)"
                    : "color-mix(in oklab, var(--color-error) 10%, transparent)",
                }}
              >
                {buy ? "Buy" : "Sell"}
              </button>
            </span>
            <span role="cell">
              <input
                aria-label={`Leg ${n} quantity${l.type === "stock" ? " (shares)" : " (contracts)"}`}
                type="number"
                inputMode="numeric"
                min={1}
                step={l.type === "stock" ? 100 : 1}
                value={l.qty}
                onChange={(e) => {
                  const q = Math.floor(Number(e.target.value));
                  if (q >= 1 && q <= 100000) onUpdate(l.id, { qty: q });
                }}
                className="h-10 w-full rounded-md border px-1.5 font-mono text-sm"
                style={inputStyle}
              />
            </span>
            <span role="cell">
              {l.type === "stock" ? (
                <span className="flex h-10 items-center px-1 text-sm">Shares</span>
              ) : (
                <select
                  aria-label={`Leg ${n} contract`}
                  value={`${l.type}:${l.strike}`}
                  onChange={(e) => {
                    const [type, k] = e.target.value.split(":");
                    onUpdate(l.id, { type: type as "call" | "put", strike: Number(k) });
                  }}
                  className="h-10 w-full rounded-md border px-1.5 font-mono text-[0.82rem]"
                  style={inputStyle}
                >
                  {(["call", "put"] as const).map((t) => {
                    const ks = listed(t, l.expiry);
                    const withCurrent = l.type === t && !ks.includes(l.strike) ? [...ks, l.strike].sort((a, b) => a - b) : ks;
                    return (
                      <optgroup key={t} label={t === "call" ? "Calls" : "Puts"}>
                        {withCurrent.map((k) => (
                          <option key={k} value={`${t}:${k}`}>
                            {fmtStrike(k)}
                            {t === "call" ? "C" : "P"}
                          </option>
                        ))}
                      </optgroup>
                    );
                  })}
                </select>
              )}
            </span>
            <span role="cell">
              {l.type === "stock" ? (
                <span className="flex h-10 items-center px-1 text-xs" style={{ color: "var(--color-fg-subtle)" }}>
                  —
                </span>
              ) : (
                <select
                  aria-label={`Leg ${n} expiry`}
                  value={l.expiry}
                  onChange={(e) => onUpdate(l.id, { expiry: e.target.value })}
                  className="h-10 w-full rounded-md border px-1 text-xs"
                  style={inputStyle}
                >
                  {!chain?.expirations.includes(l.expiry) && <option value={l.expiry}>{fmtShort(parseIso(l.expiry))}</option>}
                  {(chain?.expirations ?? []).map((e) => (
                    <option key={e} value={e}>
                      {fmtShort(parseIso(e))}
                    </option>
                  ))}
                </select>
              )}
            </span>
            <span role="cell" className="flex flex-col items-end">
              <PriceInput
                label={`Leg ${n} price per share`}
                value={l.premium}
                onCommit={(v) => onUpdate(l.id, { override: v })}
              />
              <span
                className="text-[0.62rem]"
                style={{
                  color: l.status === "live" ? "var(--color-success)" : l.status === "edited" ? "var(--color-warn)" : "var(--color-fg-subtle)",
                }}
              >
                {l.status === "live" ? (l.type === "stock" ? "live" : "live mid") : l.status === "edited" ? "edited" : "model"}
              </span>
            </span>
            <span role="cell">
              <button
                type="button"
                aria-label={`Remove leg ${n}`}
                onClick={() => onRemove(l.id)}
                className="h-10 w-6 text-lg"
                style={{ color: "var(--color-fg-subtle)" }}
              >
                ×
              </button>
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** Text input that shows the live price but only overrides on commit (blur / Enter). */
function PriceInput({ label, value, onCommit }: { label: string; value: number; onCommit: (v: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft == null) return;
    const n = Number(draft.replace(/[$,\s]/g, ""));
    if (Number.isFinite(n) && n >= 0 && Math.abs(n - value) > 1e-9) onCommit(n);
    setDraft(null);
  };
  return (
    <input
      aria-label={label}
      inputMode="decimal"
      value={draft ?? value.toFixed(2)}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
        if (e.key === "Escape") setDraft(null);
      }}
      className="h-7 w-full rounded border bg-transparent px-1 text-right font-mono text-[0.82rem]"
      style={{ borderColor: "var(--color-border)" }}
    />
  );
}

// ── "Where it could land" chart ────────────────────────────────────────

function LandingChart({
  legs,
  spot,
  sigma,
  T,
  r,
  expectedMove,
  pop,
}: {
  legs: PositionLeg[];
  spot: number;
  sigma: number;
  T: number;
  r: number;
  expectedMove: number;
  pop: number;
}) {
  const W = 760;
  const H = 300;
  const pad = { l: 16, r: 16, t: 24, b: 30 };
  const lo = Math.max(0.01, spot - expectedMove * 3);
  const hi = spot + expectedMove * 3;
  const N = 200;
  const pts = Array.from({ length: N + 1 }, (_, i) => {
    const x = lo + ((hi - lo) * i) / N;
    return { x, d: priceDensity(x, spot, sigma, T, r), win: scenarioPnl(legs, x, 0, 0, r) > 0 };
  });
  const maxD = Math.max(...pts.map((p) => p.d)) || 1;
  const sx = (x: number) => pad.l + ((x - lo) / (hi - lo)) * (W - pad.l - pad.r);
  const sy = (d: number) => H - pad.b - (d / maxD) * (H - pad.t - pad.b);
  const base = H - pad.b;
  // Contiguous win/lose runs become filled areas that share their boundary point.
  const runs: Array<{ win: boolean; d: string }> = [];
  let start = 0;
  for (let i = 1; i <= N + 1; i++) {
    if (i === N + 1 || pts[i].win !== pts[start].win) {
      const seg = pts.slice(start, Math.min(i + 1, N + 1));
      const top = seg.map((p, j) => `${j ? "L" : "M"}${sx(p.x).toFixed(1)},${sy(p.d).toFixed(1)}`).join(" ");
      const last = seg[seg.length - 1];
      runs.push({
        win: pts[start].win,
        d: `${top} L${sx(last.x).toFixed(1)},${base} L${sx(seg[0].x).toFixed(1)},${base} Z`,
      });
      start = i;
    }
  }
  const ticks = [-2, -1, 0, 1, 2].map((k) => spot + k * expectedMove).filter((x) => x > lo && x < hi);
  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full"
        role="img"
        aria-label={`Likely stock prices at the first expiry. The position profits in the green zones, about ${Math.round(pop * 100)}% of outcomes.`}
      >
        {runs.map((run, i) => (
          <path
            key={i}
            d={run.d}
            style={{
              fill: run.win ? "var(--color-accent)" : "var(--color-error)",
              fillOpacity: 0.3,
              stroke: run.win ? "var(--color-accent)" : "var(--color-error)",
              strokeWidth: 1.5,
            }}
          />
        ))}
        <line x1={pad.l} x2={W - pad.r} y1={base} y2={base} style={{ stroke: "var(--color-border-strong)" }} />
        <line x1={sx(spot)} x2={sx(spot)} y1={pad.t - 10} y2={base} style={{ stroke: "var(--color-fg-muted)", strokeDasharray: "2 4" }} />
        <text x={sx(spot) + 4} y={pad.t - 2} style={{ fill: "var(--color-fg-muted)", fontSize: 11, fontWeight: 600 }}>
          Today ${spot.toFixed(2)}
        </text>
        {ticks.map((t) => (
          <text key={t} x={sx(t)} y={H - 8} textAnchor="middle" className="font-mono" style={{ fill: "var(--color-fg-subtle)", fontSize: 11 }}>
            {t.toFixed(0)}
          </text>
        ))}
      </svg>
      <p className="mt-1 text-xs" style={{ color: "var(--color-fg-muted)" }}>
        <span style={{ color: "var(--color-accent)" }}>■</span> Profit {Math.round(pop * 100)}% ·{" "}
        <span style={{ color: "var(--color-error)" }}>■</span> Loss {100 - Math.round(pop * 100)}% — based on the
        market&apos;s implied volatility. Ticks mark ±1σ and ±2σ.
      </p>
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────

/** One plain-English line on what the position is betting on. */
function characterize(g: { perDollar: number; perDay: number; perVolPoint: number }, spot: number): string {
  const parts: string[] = [];
  const dirThreshold = Math.max(5, spot * 0.0005 * 100);
  if (g.perDollar > dirThreshold) parts.push("Mostly a bet on the stock going up.");
  else if (g.perDollar < -dirThreshold) parts.push("Mostly a bet on the stock going down.");
  else parts.push("Roughly neutral on direction today.");
  if (g.perDay > 0.5 && g.perVolPoint < -0.5) parts.push("You earn from time passing and lose if volatility jumps — a short-volatility trade.");
  else if (g.perDay < -0.5 && g.perVolPoint > 0.5) parts.push("Time works against you; a jump in volatility helps — a long-volatility trade.");
  else if (g.perDay > 0.5) parts.push("Time passing works in your favour.");
  else if (g.perDay < -0.5) parts.push("Time passing costs you money each day.");
  return parts.join(" ");
}
