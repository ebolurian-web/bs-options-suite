"use client";

import { useEffect, useRef, useState } from "react";

export type ContractBarProps = {
  // Ticker search
  onSubmit: (ticker: string) => void;
  busy: boolean;
  error: string | null;
  searchInitial?: string;
  // Contract selection — only rendered when a chain is loaded
  expirations: string[];
  selectedExpiration: string | null;
  onExpirationChange: (exp: string) => void;
  strikes: number[];
  selectedStrike: number | null;
  onStrikeChange: (strike: number) => void;
  // Staleness
  dataTimestamp: string | null; // ISO from provider
  ageMs: number | null; // at fetch time
};

/**
 * Single-row control strip sitting below the hero.
 *
 * Ticker search, contract selectors, and a data-freshness indicator.
 * The freshness indicator updates a numeric age (aria-hidden) and fires a
 * polite live-region announcement only on fresh→stale state crossings.
 */
export function ContractBar({
  onSubmit,
  busy,
  error,
  searchInitial = "",
  expirations,
  selectedExpiration,
  onExpirationChange,
  strikes,
  selectedStrike,
  onStrikeChange,
  dataTimestamp,
  ageMs,
}: ContractBarProps) {
  const [search, setSearch] = useState(searchInitial);

  return (
    <section
      aria-labelledby="h-contract-bar"
      className="rounded-md border p-3"
      style={{
        background: "var(--color-surface-1)",
        borderColor: "var(--color-border)",
      }}
    >
      <h2 id="h-contract-bar" className="sr-only">
        Contract controls
      </h2>
      <div className="flex flex-wrap items-end gap-3">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const t = search.trim().toUpperCase();
            if (t) onSubmit(t);
          }}
          className="flex min-w-[240px] flex-1 items-end gap-2"
        >
          <div className="flex-1">
            <label
              htmlFor="ticker-input"
              className="block text-[0.65rem] font-semibold uppercase tracking-[0.1em]"
              style={{ color: "var(--color-fg-muted)" }}
            >
              Ticker
            </label>
            <input
              id="ticker-input"
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value.toUpperCase())}
              placeholder="AAPL"
              maxLength={10}
              autoComplete="off"
              spellCheck={false}
              aria-invalid={error ? "true" : "false"}
              aria-describedby={error ? "ticker-error" : undefined}
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
            disabled={busy || !search.trim()}
            className="rounded px-3 py-1.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60"
            style={{
              background: "var(--color-accent)",
              color: "#0a0a0a",
            }}
          >
            {busy ? "Loading…" : "Load"}
          </button>
        </form>

        {expirations.length > 0 && (
          <>
            <div>
              <label
                htmlFor="expiry-select"
                className="block text-[0.65rem] font-semibold uppercase tracking-[0.1em]"
                style={{ color: "var(--color-fg-muted)" }}
              >
                Expiration
              </label>
              <select
                id="expiry-select"
                value={selectedExpiration ?? ""}
                onChange={(e) => onExpirationChange(e.target.value)}
                className="mt-1 rounded border px-2 py-1.5 text-sm"
                style={{
                  background: "var(--color-surface-2)",
                  borderColor: "var(--color-border)",
                  color: "var(--color-fg-default)",
                }}
              >
                {expirations.map((exp) => (
                  <option key={exp} value={exp}>
                    {exp} ({daysBetween(exp)}d)
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label
                htmlFor="strike-select"
                className="block text-[0.65rem] font-semibold uppercase tracking-[0.1em]"
                style={{ color: "var(--color-fg-muted)" }}
              >
                Strike
              </label>
              <select
                id="strike-select"
                value={selectedStrike ?? ""}
                onChange={(e) => onStrikeChange(Number(e.target.value))}
                className="mt-1 rounded border px-2 py-1.5 text-sm"
                style={{
                  background: "var(--color-surface-2)",
                  borderColor: "var(--color-border)",
                  color: "var(--color-fg-default)",
                }}
              >
                {strikes.map((k) => (
                  <option key={k} value={k}>
                    ${k.toFixed(2)}
                  </option>
                ))}
              </select>
            </div>
          </>
        )}

        <FreshnessIndicator dataTimestamp={dataTimestamp} initialAgeMs={ageMs} />
      </div>

      {error && (
        <p
          id="ticker-error"
          role="alert"
          className="mt-2 text-xs"
          style={{ color: "var(--color-error)" }}
        >
          {error}
        </p>
      )}
    </section>
  );
}

function daysBetween(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  const target = Date.UTC(y, m - 1, d, 20);
  return Math.max(0, Math.round((target - Date.now()) / 86400_000));
}

function FreshnessIndicator({
  dataTimestamp,
  initialAgeMs,
}: {
  dataTimestamp: string | null;
  initialAgeMs: number | null;
}) {
  const [ageMs, setAgeMs] = useState<number | null>(initialAgeMs);
  const wasStaleRef = useRef<boolean>(false);
  const [staleAnnouncement, setStaleAnnouncement] = useState("");

  useEffect(() => {
    if (!dataTimestamp) {
      setAgeMs(null);
      wasStaleRef.current = false;
      return;
    }
    const tsMs = Date.parse(dataTimestamp.replace(" ", "T") + "Z");
    const tick = () => {
      const age = Math.max(0, Date.now() - tsMs);
      setAgeMs(age);
      const isStale = age > 60_000;
      if (isStale !== wasStaleRef.current) {
        wasStaleRef.current = isStale;
        setStaleAnnouncement(isStale ? "Quote data is stale." : "Quote data is fresh.");
      }
    };
    tick();
    const id = setInterval(tick, 5_000);
    return () => clearInterval(id);
  }, [dataTimestamp]);

  if (ageMs == null) return null;

  const stale = ageMs > 60_000;
  const color = stale ? "var(--color-warn)" : "var(--color-fg-subtle)";

  return (
    <div className="flex min-h-[34px] items-end">
      <div className="flex items-center gap-1.5 text-xs" style={{ color }}>
        <span
          aria-hidden="true"
          className="inline-block h-1.5 w-1.5 rounded-full"
          style={{ background: stale ? "var(--color-warn)" : "var(--color-success)" }}
        />
        <span aria-hidden="true">{formatAge(ageMs)}</span>
        <span className="sr-only">{stale ? "stale" : "fresh"} — quote age {formatAge(ageMs)}</span>
      </div>
      {/* Only fires on fresh↔stale transitions; silent otherwise. */}
      <span aria-live="polite" className="sr-only">
        {staleAnnouncement}
      </span>
    </div>
  );
}

function formatAge(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 90) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 90) return `${m}m ago`;
  const h = Math.round(m / 60);
  return `${h}h ago`;
}
