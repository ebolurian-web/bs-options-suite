"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ParamInput } from "@/components/param-input";
import { StatsGrid, StatTile } from "@/components/stats-grid";
import { ApiClientError, fetchChain, fetchHistory } from "@/lib/client";
import { PRESETS, buildPreset, computeNetGreeks, computeStats } from "@/lib/strategy";
import type { Preset, StrategyLeg } from "@/lib/strategy";
import {
  decodeStrategy,
  encodeStrategy,
  listSaved,
  removeSaved,
  saveStrategy,
  type SavedStrategy,
} from "@/lib/strategy-codec";
import type { OptionChain } from "@/lib/types";
import { CombinedPayoffChart } from "./combined-payoff-chart";
import { DistributionChart } from "./distribution-chart";

const fmt = (n: number | null | undefined, d = 2) =>
  n == null || !Number.isFinite(n) ? "—" : n.toFixed(d);
const fmtUsd = (n: number) =>
  `${n >= 0 ? "+" : "-"}$${Math.abs(n).toFixed(2)}`;
const fmtUsdAbs = (n: number) => `$${n.toFixed(2)}`;

type ExpiryOption = { iso: string; label: string };

function defaultExpiryOptions(): ExpiryOption[] {
  const today = new Date();
  const mkDate = (days: number) => {
    const d = new Date(today);
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  };
  return [7, 14, 30, 60, 90, 180, 365].map((days) => ({
    iso: mkDate(days),
    label: `${mkDate(days)} (${days}d)`,
  }));
}

export function StrategiesView() {
  const [legs, setLegs] = useState<StrategyLeg[]>([]);
  const legIdRef = useRef(0);
  const [saved, setSaved] = useState<SavedStrategy[]>([]);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const shareInputRef = useRef<HTMLInputElement | null>(null);

  // Market / assumptions
  const [ticker, setTicker] = useState("");
  const [spot, setSpot] = useState(100);
  const [volPct, setVolPct] = useState(25);
  const [rPct, setRPct] = useState(4.5);
  const [chain, setChain] = useState<OptionChain | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadedPresetName, setLoadedPresetName] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState<string>("");
  const abortRef = useRef<AbortController | null>(null);

  // Expiry options: real (from chain) or synthetic (7/14/30/…/365 days)
  const expiryOptions: ExpiryOption[] = useMemo(() => {
    if (chain?.expirations.length) {
      return chain.expirations.map((iso) => {
        const days = Math.max(0, Math.round((Date.parse(`${iso}T20:00:00Z`) - Date.now()) / 86400_000));
        return { iso, label: `${iso} (${days}d)` };
      });
    }
    return defaultExpiryOptions();
  }, [chain]);

  const defaultExpiry = expiryOptions[0]?.iso ?? new Date().toISOString().slice(0, 10);

  // ── Leg mutations ──
  const addLeg = useCallback(
    (action: "buy" | "sell", type: "call" | "put" | "stock") => {
      setLegs((prev) => {
        const id = legIdRef.current++;
        const K = Math.round(spot / 5) * 5;
        const leg: StrategyLeg = {
          id,
          action,
          type,
          qty: type === "stock" ? 100 : 1,
          strike: type === "stock" ? +spot.toFixed(2) : +K.toFixed(2),
          premium: type === "stock" ? +spot.toFixed(2) : +(spot * 0.03).toFixed(2),
          expiry: defaultExpiry,
        };
        return [...prev, leg];
      });
      setLoadedPresetName(null);
    },
    [spot, defaultExpiry],
  );

  const removeLeg = useCallback((id: number) => {
    setLegs((prev) => prev.filter((l) => l.id !== id));
    setLoadedPresetName(null);
  }, []);

  const updateLeg = useCallback((id: number, patch: Partial<StrategyLeg>) => {
    setLegs((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  }, []);

  const applyPreset = useCallback(
    (id: Preset) => {
      const preset = PRESETS.find((p) => p.id === id);
      if (!preset) return;
      const built = buildPreset(id, spot, defaultExpiry);
      // Re-id from our counter to avoid collisions with legs.push() later
      const reIded = built.map((l) => ({ ...l, id: legIdRef.current++ }));
      setLegs(reIded);
      setLoadedPresetName(preset.name);
      setAnnouncement(
        reIded.length
          ? `Loaded ${preset.name} — ${reIded.length} leg${reIded.length === 1 ? "" : "s"} replaced.`
          : `Cleared — ${preset.name} has no pre-built legs.`,
      );
    },
    [spot, defaultExpiry],
  );

  const clearAll = useCallback(() => {
    const n = legs.length;
    setLegs([]);
    setLoadedPresetName(null);
    if (n) setAnnouncement(`Cleared — ${n} leg${n === 1 ? "" : "s"} removed.`);
  }, [legs.length]);

  // ── Load live ticker (for spot + realistic expiries) ──
  const loadTicker = useCallback(async () => {
    const t = ticker.trim().toUpperCase();
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
      setChain(c);
      setSpot(Number(c.quote.price.toFixed(2)));
      const hist = histRes.status === "fulfilled" ? histRes.value : null;
      if (hist?.realizedVol != null) {
        setVolPct(Number((hist.realizedVol * 100).toFixed(2)));
      } else if (c.quote.iv30 != null) {
        setVolPct(Number((c.quote.iv30 * 100).toFixed(2)));
      }
      // If legs already exist with default synthetic expiries, swap them to the nearest real expiry
      if (c.expirations.length) {
        const realFirst = c.expirations[0];
        setLegs((prev) =>
          prev.map((l) =>
            l.type === "stock" ? l : { ...l, expiry: realFirst },
          ),
        );
      }
      const volForAnnouncement =
        hist?.realizedVol != null
          ? (hist.realizedVol * 100).toFixed(1)
          : c.quote.iv30 != null
            ? (c.quote.iv30 * 100).toFixed(1)
            : volPct.toFixed(1);
      setAnnouncement(
        `${c.ticker} loaded. Spot $${c.quote.price.toFixed(2)}, volatility ${volForAnnouncement}%, rate ${rPct.toFixed(2)}%.`,
      );
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
  }, [ticker]);

  // ── Load market prices for current legs (bid-ask mid from chain) ──
  const loadMarketPrices = useCallback(() => {
    if (!chain || !legs.length) return;
    let updated = 0;
    const next = legs.map((l) => {
      if (l.type === "stock") return l;
      const matches = chain.contracts.filter(
        (c) => c.type === l.type && c.expiration === l.expiry,
      );
      if (!matches.length) return l;
      // Nearest strike
      let best = matches[0];
      let bestDiff = Math.abs(best.strike - l.strike);
      for (const c of matches) {
        const d = Math.abs(c.strike - l.strike);
        if (d < bestDiff) {
          best = c;
          bestDiff = d;
        }
      }
      const px = best.mid ?? best.last;
      if (px == null || px <= 0) return l;
      updated++;
      return { ...l, strike: best.strike, premium: +px.toFixed(2) };
    });
    setLegs(next);
    setAnnouncement(
      updated
        ? `Market prices applied to ${updated} leg${updated === 1 ? "" : "s"}.`
        : "No matching contracts in the loaded chain.",
    );
  }, [chain, legs]);

  // ── Stats + Greeks ──
  const { stats, netGreeks } = useMemo(() => {
    const strikes = legs.filter((l) => l.type !== "stock").map((l) => l.strike);
    const minK = strikes.length ? Math.min(...strikes, spot) : spot;
    const maxK = strikes.length ? Math.max(...strikes, spot) : spot;
    const stats = computeStats({
      legs,
      spot,
      volatility: volPct / 100,
      priceRange: { lo: Math.max(0.01, minK * 0.55), hi: maxK * 1.7, steps: 240 },
    });
    const netGreeks = computeNetGreeks({
      legs,
      spot,
      volatility: volPct / 100,
      riskFreeRate: rPct / 100,
    });
    return { stats, netGreeks };
  }, [legs, spot, volPct, rPct]);

  // ── Saved strategies + URL sharing ──
  useEffect(() => {
    setSaved(listSaved());
  }, []);

  // URL hydration on mount
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const s = params.get("s");
    if (!s) return;
    const decoded = decodeStrategy(s);
    if (!decoded) {
      setAnnouncement("Shared strategy link could not be decoded.");
      return;
    }
    setSpot(decoded.spot);
    setVolPct(decoded.volPct);
    setRPct(decoded.rPct);
    setTicker(decoded.ticker ?? "");
    setLegs(decoded.legs.map((l) => ({ ...l, id: legIdRef.current++ })));
    setAnnouncement(
      `Loaded shared strategy — ${decoded.legs.length} leg${decoded.legs.length === 1 ? "" : "s"}${decoded.ticker ? `, ${decoded.ticker}` : ""}.`,
    );
    if (decoded.ticker) document.title = `${decoded.ticker} shared strategy — BS Options Suite`;
  }, []);

  const handleShare = useCallback(async () => {
    const encoded = encodeStrategy({
      ticker: ticker || null,
      spot,
      volPct,
      rPct,
      legs,
    });
    const url = `${window.location.origin}${window.location.pathname}?s=${encoded}`;
    try {
      await navigator.clipboard.writeText(url);
      setShareUrl(null);
      setAnnouncement("Share link copied to clipboard.");
    } catch {
      setShareUrl(url);
      setAnnouncement("Clipboard unavailable. Select the URL below to copy manually.");
      // Auto-select the input on next paint
      setTimeout(() => {
        shareInputRef.current?.focus();
        shareInputRef.current?.select();
      }, 0);
    }
  }, [ticker, spot, volPct, rPct, legs]);

  const handleSave = useCallback(() => {
    if (!legs.length) return;
    const name = window.prompt(
      "Name this strategy:",
      loadedPresetName
        ? `${loadedPresetName}${ticker ? " · " + ticker : ""}`
        : `Strategy · ${legs.length} leg${legs.length === 1 ? "" : "s"}`,
    );
    if (!name) return;
    saveStrategy({
      name: name.trim().slice(0, 80),
      ticker: ticker || null,
      spot,
      volPct,
      rPct,
      legs,
    });
    setSaved(listSaved());
    setAnnouncement(`Saved "${name}".`);
  }, [legs, ticker, spot, volPct, rPct, loadedPresetName]);

  const handleLoadSaved = useCallback((entry: SavedStrategy) => {
    setTicker(entry.ticker ?? "");
    setSpot(entry.spot);
    setVolPct(entry.volPct);
    setRPct(entry.rPct);
    setLegs(entry.legs.map((l) => ({ ...l, id: legIdRef.current++ })));
    setLoadedPresetName(null);
    setAnnouncement(`Loaded "${entry.name}" — ${entry.legs.length} leg${entry.legs.length === 1 ? "" : "s"}.`);
  }, []);

  const handleDeleteSaved = useCallback((entry: SavedStrategy) => {
    const ok = window.confirm(`Delete "${entry.name}"? This cannot be undone.`);
    if (!ok) return;
    removeSaved(entry.id);
    setSaved(listSaved());
    setAnnouncement(`Deleted "${entry.name}".`);
  }, []);

  // Debounced strategy-summary announcement
  const announceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (announceTimerRef.current) clearTimeout(announceTimerRef.current);
    if (!legs.length) return;
    announceTimerRef.current = setTimeout(() => {
      const msg =
        `Strategy updated. ${legs.length} leg${legs.length === 1 ? "" : "s"}, ` +
        `net premium ${fmtUsd(stats.netPremium)}, ` +
        `max loss ${stats.unlimitedLoss ? "unlimited" : fmtUsd(stats.maxLoss)}, ` +
        `max profit ${stats.unlimitedProfit ? "unlimited" : fmtUsd(stats.maxProfit)}.`;
      setAnnouncement(msg);
    }, 900);
    return () => {
      if (announceTimerRef.current) clearTimeout(announceTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [legs, stats.netPremium, stats.maxLoss, stats.maxProfit]);

  return (
    <div className="flex flex-col gap-5">
      {/* Underlying — ticker search + live read-only badges */}
      <section
        aria-labelledby="h-underlying"
        className="rounded-md border p-4"
        style={{ background: "var(--color-surface-1)", borderColor: "var(--color-border)" }}
      >
        <h2
          id="h-underlying"
          className="mb-3 text-xs font-semibold uppercase tracking-[0.1em]"
          style={{ color: "var(--color-fg-muted)" }}
        >
          Underlying
        </h2>
        <div className="flex flex-wrap items-end gap-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              loadTicker();
            }}
            className="flex flex-1 min-w-[240px] items-end gap-2"
          >
            <div className="flex-1">
              <label
                htmlFor="strat-ticker"
                className="block text-[0.65rem] font-semibold uppercase tracking-[0.1em]"
                style={{ color: "var(--color-fg-muted)" }}
              >
                Ticker
              </label>
              <input
                id="strat-ticker"
                type="text"
                value={ticker}
                onChange={(e) => setTicker(e.target.value.toUpperCase())}
                placeholder="SPY"
                maxLength={10}
                aria-describedby={error ? "strat-ticker-error" : undefined}
                aria-invalid={error ? "true" : "false"}
                className="mt-1 w-full rounded border px-3 py-1.5 font-mono text-sm uppercase tracking-wider"
                style={{
                  background: "var(--color-surface-2)",
                  borderColor: error ? "var(--color-error)" : "var(--color-border)",
                  color: "var(--color-fg-default)",
                }}
              />
            </div>
            <button
              type="submit"
              disabled={busy || !ticker.trim()}
              className="rounded px-3 py-1.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60"
              style={{ background: "var(--color-accent)", color: "#0a0a0a" }}
            >
              {busy ? "Loading…" : "Load"}
            </button>
          </form>

          {/* Read-only live badges */}
          <dl className="flex flex-wrap gap-3 text-sm">
            <AssumptionBadge id="badge-spot" label="Spot" value={`$${spot.toFixed(2)}`} />
            <AssumptionBadge id="badge-vol" label="Volatility σ" value={`${volPct.toFixed(1)}%`} />
            <AssumptionBadge id="badge-r" label="Risk-Free r" value={`${rPct.toFixed(2)}%`} />
          </dl>

          {chain && (
            <button
              type="button"
              onClick={loadMarketPrices}
              disabled={!legs.length}
              className="rounded border px-3 py-1.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60"
              style={{
                borderColor: "var(--color-warn)",
                color: "var(--color-warn)",
                background: "transparent",
              }}
            >
              ↻ Market prices
            </button>
          )}
        </div>
        {error && (
          <p
            id="strat-ticker-error"
            role="alert"
            className="mt-2 text-xs"
            style={{ color: "var(--color-error)" }}
          >
            {error}
          </p>
        )}
        <p className="mt-2 text-[0.72rem]" style={{ color: "var(--color-fg-subtle)" }}>
          Spot, volatility, and rate are seeded from live market data. Expand{" "}
          <strong style={{ color: "var(--color-fg-muted)" }}>Manual overrides</strong> at the bottom
          to run scenario analysis.
        </p>
      </section>

      {/* Presets */}
      <section
        aria-labelledby="h-presets"
        className="rounded-md border p-4"
        style={{ background: "var(--color-surface-1)", borderColor: "var(--color-border)" }}
      >
        <h2
          id="h-presets"
          className="mb-3 text-xs font-semibold uppercase tracking-[0.1em]"
          style={{ color: "var(--color-fg-muted)" }}
        >
          Pre-built strategies
        </h2>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => {
            const active = loadedPresetName === p.name;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => applyPreset(p.id)}
                className="rounded border px-3 py-1.5 text-xs font-semibold transition-colors"
                style={{
                  borderColor: active ? "var(--color-accent)" : "var(--color-border)",
                  color: active ? "var(--color-accent)" : "var(--color-fg-muted)",
                  background: active ? "color-mix(in oklab, var(--color-accent) 8%, transparent)" : "transparent",
                }}
                title={p.summary}
              >
                {p.name}
              </button>
            );
          })}
        </div>
      </section>

      {/* Share / Save toolbar */}
      {legs.length > 0 && (
        <section
          aria-label="Share and save strategy"
          className="flex flex-wrap items-center gap-2 text-xs"
        >
          <button
            type="button"
            onClick={handleShare}
            className="press-scale rounded border px-3 py-1.5 font-semibold transition-colors"
            style={{
              borderColor: "var(--color-border)",
              color: "var(--color-fg-default)",
              background: "var(--color-surface-1)",
            }}
          >
            <span aria-hidden="true">🔗</span> Share link
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="press-scale rounded border px-3 py-1.5 font-semibold transition-colors"
            style={{
              borderColor: "var(--color-border)",
              color: "var(--color-fg-default)",
              background: "var(--color-surface-1)",
            }}
          >
            <span aria-hidden="true">★</span> Save strategy
          </button>
          <span style={{ color: "var(--color-fg-subtle)" }}>
            {legs.length} leg{legs.length === 1 ? "" : "s"} loaded
          </span>
        </section>
      )}

      {/* Clipboard fallback — only when navigator.clipboard is unavailable */}
      {shareUrl && (
        <div
          role="group"
          aria-labelledby="share-fallback-label"
          className="surface-1 p-3"
        >
          <label
            id="share-fallback-label"
            htmlFor="share-fallback-input"
            className="block text-xs font-semibold"
            style={{ color: "var(--color-fg-muted)" }}
          >
            Copy this link manually
          </label>
          <input
            id="share-fallback-input"
            ref={shareInputRef}
            type="text"
            readOnly
            value={shareUrl}
            onFocus={(e) => e.currentTarget.select()}
            className="mt-1 w-full rounded border px-2 py-1.5 font-mono text-xs"
            style={{
              background: "var(--color-surface-2)",
              borderColor: "var(--color-border)",
              color: "var(--color-fg-default)",
            }}
          />
          <button
            type="button"
            onClick={() => setShareUrl(null)}
            className="mt-2 rounded border px-3 py-1 text-xs font-semibold"
            style={{
              borderColor: "var(--color-border)",
              color: "var(--color-fg-muted)",
              background: "transparent",
            }}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Legs table */}
      <LegsSection
        legs={legs}
        expiryOptions={expiryOptions}
        onUpdate={updateLeg}
        onRemove={removeLeg}
        onAdd={addLeg}
        onClearAll={clearAll}
      />

      {/* Live-region for strategy updates */}
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {announcement}
      </div>

      {/* Combined payoff */}
      <CombinedPayoffChart legs={legs} spot={spot} />

      {/* Stats */}
      {legs.length > 0 && (
        <>
          <section aria-labelledby="h-stats">
            <h2
              id="h-stats"
              className="mb-2 text-xs font-semibold uppercase tracking-[0.1em]"
              style={{ color: "var(--color-fg-muted)" }}
            >
              Strategy stats
            </h2>
            <StatsGrid labelledBy="h-stats">
              <StatTile
                term="Max profit"
                value={stats.unlimitedProfit ? "Unlimited" : fmtUsdAbs(stats.maxProfit)}
                tone={stats.maxProfit >= 0 ? "success" : "default"}
              />
              <StatTile
                term="Max loss"
                value={stats.unlimitedLoss ? "Unlimited" : fmtUsdAbs(Math.abs(stats.maxLoss))}
                tone="error"
              />
              <StatTile
                term="Net premium"
                value={fmtUsd(stats.netPremium)}
                tone={stats.netPremium >= 0 ? "success" : "error"}
                hint={stats.netPremium >= 0 ? "Net credit" : "Net debit"}
              />
              <StatTile
                term="Probability of profit"
                value={`${stats.popPercent.toFixed(1)}%`}
                tone="accent"
                hint="Log-normal simulation"
              />
            </StatsGrid>
          </section>

          <section aria-labelledby="h-greeks">
            <h2
              id="h-greeks"
              className="mb-2 text-xs font-semibold uppercase tracking-[0.1em]"
              style={{ color: "var(--color-fg-muted)" }}
            >
              Net position Greeks
            </h2>
            <StatsGrid labelledBy="h-greeks">
              <StatTile
                term="Net Delta"
                value={fmt(netGreeks.delta, 2)}
                tone={Math.abs(netGreeks.delta) < 0.01 ? "default" : netGreeks.delta > 0 ? "accent" : "error"}
                helpLabel="Show Net Delta explanation"
                helpContent={
                  <>
                    Your whole position's directional exposure, in shares-equivalent. A Net Delta of
                    <strong> +100</strong> means the strategy behaves like 100 shares long — gains $1 for each
                    $1 the stock rises. Negative Delta means you profit if the stock falls.
                  </>
                }
              />
              <StatTile
                term="Net Gamma"
                value={fmt(netGreeks.gamma, 2)}
                tone="warn"
                helpLabel="Show Net Gamma explanation"
                helpContent={
                  <>
                    How quickly your <strong>Net Delta</strong> changes as the stock moves. Positive Gamma =
                    your directional exposure grows in your favor (long options do this). Negative Gamma =
                    your exposure works against you (short options).
                  </>
                }
              />
              <StatTile
                term="Net Theta / day"
                value={fmt(netGreeks.thetaPerDay, 2)}
                tone={netGreeks.thetaPerDay >= 0 ? "success" : "error"}
                helpLabel="Show Net Theta explanation"
                helpContent={
                  <>
                    Total dollar amount your position makes (+) or loses (−) each day from time decay alone.
                    Negative Theta = you're paying to hold; positive Theta = time decay is on your side.
                  </>
                }
              />
              <StatTile
                term="Net Vega / 1%"
                value={fmt(netGreeks.vegaPer1Pct, 2)}
                tone="accent"
                helpLabel="Show Net Vega explanation"
                helpContent={
                  <>
                    How much your position makes or loses per 1 percentage point change in implied
                    volatility. Long options have positive Vega (profit if vol rises); short options are
                    negative Vega.
                  </>
                }
              />
            </StatsGrid>
          </section>

          {/* Break-evens */}
          {stats.breakEvens.length > 0 && (
            <section aria-labelledby="h-be">
              <h2
                id="h-be"
                className="mb-2 text-xs font-semibold uppercase tracking-[0.1em]"
                style={{ color: "var(--color-fg-muted)" }}
              >
                Break-even prices
              </h2>
              <div className="flex flex-wrap gap-2">
                {stats.breakEvens.map((be, i) => (
                  <span
                    key={i}
                    className="rounded-md border px-3 py-1 text-sm font-mono font-semibold tabular-nums"
                    style={{
                      background: "color-mix(in oklab, var(--color-warn) 10%, transparent)",
                      borderColor: "color-mix(in oklab, var(--color-warn) 35%, transparent)",
                      color: "var(--color-warn)",
                    }}
                  >
                    ${be.toFixed(2)}
                  </span>
                ))}
              </div>
            </section>
          )}

          <DistributionChart
            legs={legs}
            spot={spot}
            volatility={volPct / 100}
            popPercent={stats.popPercent}
            breakEvens={stats.breakEvens}
          />
        </>
      )}

      {/* Saved strategies */}
      {saved.length > 0 && (
        <section aria-labelledby="h-saved" className="surface-1 p-4">
          <h2
            id="h-saved"
            className="mb-3 text-xs font-semibold uppercase tracking-[0.1em]"
            style={{ color: "var(--color-fg-muted)" }}
          >
            Saved strategies ({saved.length})
          </h2>
          <ul className="flex flex-col gap-2">
            {saved.map((s) => (
              <li
                key={s.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded border px-3 py-2"
                style={{
                  background: "var(--color-surface-2)",
                  borderColor: "var(--color-border)",
                }}
              >
                <div className="min-w-0 flex-1">
                  <div
                    className="truncate text-sm font-semibold"
                    style={{ color: "var(--color-fg-default)" }}
                  >
                    {s.name}
                  </div>
                  <div className="text-[0.7rem]" style={{ color: "var(--color-fg-subtle)" }}>
                    {s.legs.length} leg{s.legs.length === 1 ? "" : "s"}
                    {s.ticker ? ` · ${s.ticker}` : ""}
                    {" · saved "}
                    {new Date(s.savedAt).toLocaleDateString()}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => handleLoadSaved(s)}
                    className="rounded border px-2.5 py-1 text-xs font-semibold transition-colors"
                    style={{
                      borderColor: "var(--color-accent)",
                      color: "var(--color-accent)",
                      background: "transparent",
                    }}
                  >
                    Load
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete saved strategy: ${s.name}`}
                    onClick={() => handleDeleteSaved(s)}
                    className="rounded border px-2.5 py-1 text-xs font-semibold transition-colors"
                    style={{
                      borderColor: "var(--color-border)",
                      color: "var(--color-error)",
                      background: "transparent",
                    }}
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Manual overrides — for scenario analysis after a ticker is loaded */}
      <details
        className="rounded-md border"
        style={{ background: "var(--color-surface-1)", borderColor: "var(--color-border)" }}
      >
        <summary
          className="cursor-pointer px-4 py-3 text-xs font-semibold uppercase tracking-[0.1em]"
          style={{ color: "var(--color-fg-muted)" }}
        >
          Manual overrides — Spot / σ / Risk-Free rate
        </summary>
        <div
          className="grid gap-4 border-t p-4 md:grid-cols-3"
          style={{ borderColor: "var(--color-border)" }}
        >
          <ParamInput
            id="override-spot"
            label="Override spot price"
            unit="$"
            value={spot}
            onChange={setSpot}
            min={0.01}
            max={10000}
            step={0.01}
          />
          <ParamInput
            id="override-vol"
            label="Override volatility σ"
            unit="%"
            value={volPct}
            onChange={setVolPct}
            min={0.5}
            max={300}
            step={0.5}
            helpText="Used for probability-of-profit and net Greeks."
          />
          <ParamInput
            id="override-r"
            label="Override risk-free rate"
            unit="%"
            value={rPct}
            onChange={setRPct}
            min={0}
            max={20}
            step={0.05}
          />
        </div>
      </details>
    </div>
  );
}

function AssumptionBadge({
  id,
  label,
  value,
}: {
  id: string;
  label: string;
  value: string;
}) {
  return (
    <div
      className="rounded border px-3 py-1.5"
      style={{
        background: "var(--color-surface-2)",
        borderColor: "var(--color-border)",
      }}
    >
      <dt
        className="text-[0.62rem] font-semibold uppercase tracking-[0.1em]"
        style={{ color: "var(--color-fg-muted)" }}
      >
        {label}
      </dt>
      <dd
        id={id}
        aria-live="polite"
        className="font-mono text-sm font-semibold tabular-nums"
        style={{ color: "var(--color-fg-default)" }}
      >
        {value}
      </dd>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
// Legs table

function LegsSection({
  legs,
  expiryOptions,
  onUpdate,
  onRemove,
  onAdd,
  onClearAll,
}: {
  legs: StrategyLeg[];
  expiryOptions: ExpiryOption[];
  onUpdate: (id: number, patch: Partial<StrategyLeg>) => void;
  onRemove: (id: number) => void;
  onAdd: (action: "buy" | "sell", type: "call" | "put" | "stock") => void;
  onClearAll: () => void;
}) {
  return (
    <section aria-labelledby="h-legs" className="rounded-md border" style={{ background: "var(--color-surface-1)", borderColor: "var(--color-border)" }}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3" style={{ borderColor: "var(--color-border)" }}>
        <h2
          id="h-legs"
          className="text-xs font-semibold uppercase tracking-[0.1em]"
          style={{ color: "var(--color-fg-muted)" }}
        >
          Legs ({legs.length})
        </h2>
        <div role="toolbar" aria-label="Add leg" className="flex flex-wrap gap-2">
          <ToolbarBtn onClick={() => onAdd("buy", "call")}>+ Buy Call</ToolbarBtn>
          <ToolbarBtn onClick={() => onAdd("buy", "put")}>+ Buy Put</ToolbarBtn>
          <ToolbarBtn onClick={() => onAdd("sell", "call")}>+ Sell Call</ToolbarBtn>
          <ToolbarBtn onClick={() => onAdd("sell", "put")}>+ Sell Put</ToolbarBtn>
          <ToolbarBtn onClick={() => onAdd("buy", "stock")}>+ Long Stock</ToolbarBtn>
          {legs.length > 0 && (
            <button
              type="button"
              onClick={onClearAll}
              className="rounded border px-3 py-1 text-xs font-semibold transition-colors"
              style={{
                borderColor: "var(--color-border)",
                color: "var(--color-error)",
                background: "transparent",
              }}
            >
              Clear all
            </button>
          )}
        </div>
      </div>

      {legs.length === 0 ? (
        <div
          role="status"
          className="p-8 text-center text-sm"
          style={{ color: "var(--color-fg-muted)" }}
        >
          <div className="text-3xl opacity-30" aria-hidden="true">⊞</div>
          <p className="mt-2">Pick a preset above or add a leg with one of the buttons.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">
              Strategy legs — {legs.length} row{legs.length === 1 ? "" : "s"}. Edit fields in place.
            </caption>
            <thead>
              <tr>
                {["Action", "Type", "Qty", "Strike ($)", "Premium ($)", "Expiry", "Cost", ""].map((h) => (
                  <th
                    key={h}
                    scope="col"
                    className="border-b px-3 py-2 text-left text-[0.62rem] font-semibold uppercase tracking-[0.08em]"
                    style={{ color: "var(--color-fg-muted)", borderColor: "var(--color-border)" }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {legs.map((l, idx) => {
                const dir = l.action === "buy" ? -1 : 1;
                const cost = l.type === "stock" ? dir * l.strike * l.qty : dir * l.premium * l.qty * 100;
                const costColor = cost >= 0 ? "var(--color-success)" : "var(--color-error)";
                const rowLabel = `${l.action} ${l.type} $${l.strike.toFixed(2)}`;
                return (
                  <tr key={l.id} className="border-b" style={{ borderColor: "var(--color-border)" }}>
                    <td className="px-2 py-2">
                      <select
                        aria-label={`Action, leg ${idx + 1}`}
                        value={l.action}
                        onChange={(e) => onUpdate(l.id, { action: e.target.value as "buy" | "sell" })}
                        className="w-full rounded border px-2 py-1 text-xs"
                        style={{
                          background: "var(--color-surface-2)",
                          borderColor: "var(--color-border)",
                          color: "var(--color-fg-default)",
                        }}
                      >
                        <option value="buy">Buy</option>
                        <option value="sell">Sell</option>
                      </select>
                    </td>
                    <td className="px-2 py-2">
                      <select
                        aria-label={`Type, leg ${idx + 1}`}
                        value={l.type}
                        onChange={(e) => onUpdate(l.id, { type: e.target.value as "call" | "put" | "stock" })}
                        className="w-full rounded border px-2 py-1 text-xs"
                        style={{
                          background: "var(--color-surface-2)",
                          borderColor: "var(--color-border)",
                          color: "var(--color-fg-default)",
                        }}
                      >
                        <option value="call">Call</option>
                        <option value="put">Put</option>
                        <option value="stock">Stock</option>
                      </select>
                    </td>
                    <td className="px-2 py-2">
                      <input
                        type="number"
                        aria-label={`Quantity, leg ${idx + 1}`}
                        value={l.qty}
                        min={1}
                        step={1}
                        onChange={(e) => onUpdate(l.id, { qty: Math.max(1, Math.round(Number(e.target.value) || 1)) })}
                        className="w-16 rounded border px-2 py-1 font-mono text-xs tabular-nums"
                        style={{
                          background: "var(--color-surface-2)",
                          borderColor: "var(--color-border)",
                          color: "var(--color-fg-default)",
                        }}
                      />
                    </td>
                    <td className="px-2 py-2">
                      <input
                        type="number"
                        aria-label={`Strike, leg ${idx + 1}`}
                        value={l.strike}
                        min={0.01}
                        step={0.5}
                        onChange={(e) => onUpdate(l.id, { strike: Math.max(0.01, Number(e.target.value) || 0) })}
                        className="w-24 rounded border px-2 py-1 font-mono text-xs tabular-nums"
                        style={{
                          background: "var(--color-surface-2)",
                          borderColor: "var(--color-border)",
                          color: "var(--color-fg-default)",
                        }}
                      />
                    </td>
                    <td className="px-2 py-2">
                      {l.type === "stock" ? (
                        <span className="px-1 text-xs" style={{ color: "var(--color-fg-subtle)" }}>
                          —
                        </span>
                      ) : (
                        <input
                          type="number"
                          aria-label={`Premium per share, leg ${idx + 1}`}
                          value={l.premium}
                          min={0}
                          step={0.01}
                          onChange={(e) => onUpdate(l.id, { premium: Math.max(0, Number(e.target.value) || 0) })}
                          className="w-24 rounded border px-2 py-1 font-mono text-xs tabular-nums"
                          style={{
                            background: "var(--color-surface-2)",
                            borderColor: "var(--color-border)",
                            color: "var(--color-fg-default)",
                          }}
                        />
                      )}
                    </td>
                    <td className="px-2 py-2">
                      <select
                        aria-label={`Expiry, leg ${idx + 1}`}
                        value={l.expiry}
                        onChange={(e) => onUpdate(l.id, { expiry: e.target.value })}
                        disabled={l.type === "stock"}
                        className="rounded border px-2 py-1 text-xs disabled:opacity-50"
                        style={{
                          background: "var(--color-surface-2)",
                          borderColor: "var(--color-border)",
                          color: "var(--color-fg-default)",
                        }}
                      >
                        {!expiryOptions.some((o) => o.iso === l.expiry) && (
                          <option value={l.expiry}>{l.expiry}</option>
                        )}
                        {expiryOptions.map((o) => (
                          <option key={o.iso} value={o.iso}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-2 py-2 font-mono text-xs tabular-nums" style={{ color: costColor }}>
                      {fmtUsd(cost)}
                      <div className="text-[0.62rem]" style={{ color: "var(--color-fg-subtle)" }}>
                        {l.type === "stock" ? `${l.qty} shares` : `${l.qty} × 100`}
                      </div>
                    </td>
                    <td className="px-2 py-2">
                      <button
                        type="button"
                        aria-label={`Remove leg ${idx + 1}: ${rowLabel}`}
                        onClick={() => onRemove(l.id)}
                        className="inline-flex h-7 w-7 items-center justify-center rounded border text-xs font-bold transition-colors"
                        style={{
                          borderColor: "var(--color-border)",
                          color: "var(--color-error)",
                          background: "transparent",
                        }}
                      >
                        <span aria-hidden="true">✕</span>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function ToolbarBtn({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded border px-2.5 py-1 text-xs font-semibold transition-colors"
      style={{
        borderColor: "var(--color-border)",
        color: "var(--color-fg-muted)",
        background: "transparent",
      }}
    >
      {children}
    </button>
  );
}
