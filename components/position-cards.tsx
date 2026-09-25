"use client";

import Link from "next/link";
import { useMemo } from "react";
import { fmtSigned } from "@/lib/format";
import type { DollarGreeks } from "@/lib/position";
import type { HistoricalBar } from "@/lib/types";
import { volVerdict, type View } from "@/lib/trade-ideas";

/** "Options look pricey / cheap" — ATM IV vs 20-day realized vol and IV rank. */
export function VerdictCard({
  atmIv,
  bars,
  view = "up",
  headline,
  children,
  showConeLink = true,
}: {
  atmIv: number;
  bars: HistoricalBar[] | null;
  /** Tailors the advice line (buying vs selling volatility). */
  view?: View;
  /** Overrides the default headline. */
  headline?: string;
  /** Extra content rendered under the chips. */
  children?: React.ReactNode;
  showConeLink?: boolean;
}) {
  const v = useMemo(() => volVerdict(atmIv, bars, view), [atmIv, bars, view]);
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
        {headline ?? v.headline}
      </h3>
      <dl className="grid grid-cols-3 gap-2 font-mono text-sm tabular-nums">
        <Chip term="Implied" value={`${(v.impliedVol * 100).toFixed(1)}%`} />
        <Chip term="Realized 20d" value={v.realizedVol20 != null ? `${(v.realizedVol20 * 100).toFixed(1)}%` : "—"} />
        <Chip term="IV rank" value={v.ivRank != null ? Math.round(v.ivRank).toString() : "—"} />
      </dl>
      {children}
      <p className="text-[0.82rem] leading-relaxed" style={{ color: "var(--color-fg-muted)" }}>
        {v.advice}
        {showConeLink && (
          <>
            {" "}
            <Link href="/pricer#volatility" className="underline" style={{ color: "var(--color-accent)" }}>
              See the vol surface &amp; cone
            </Link>
          </>
        )}
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

/** "What moves this position": Greeks restated as dollars. */
export function GreeksCard({
  title = "What moves this position today",
  ticker,
  greeks,
  note,
  children,
}: {
  title?: string;
  ticker: string;
  greeks: DollarGreeks;
  note?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <section aria-labelledby="h-greeks" className="surface-1 flex flex-col gap-2 p-4 text-[0.82rem]">
      <h3 id="h-greeks" className="text-xs font-semibold" style={{ color: "var(--color-fg-muted)" }}>
        {title}
      </h3>
      <GreekRow label={`${ticker} +$1`} value={greeks.perDollar} />
      <GreekRow label="Each day that passes" value={greeks.perDay} />
      <GreekRow label="Implied vol +1 point" value={greeks.perVolPoint} />
      {note && (
        <p className="text-xs leading-relaxed" style={{ color: "var(--color-fg-subtle)" }}>
          {note}
        </p>
      )}
      {children}
    </section>
  );
}

export function GreekRow({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span style={{ color: "var(--color-fg-muted)" }}>
        {label}
        {hint && <span style={{ color: "var(--color-fg-subtle)" }}> · {hint}</span>}
      </span>
      <span
        className="font-mono tabular-nums"
        style={{ color: value < -0.5 ? "var(--color-error)" : value > 0.5 ? "var(--color-fg-default)" : "var(--color-fg-muted)" }}
      >
        {fmtSigned(value)}
      </span>
    </div>
  );
}

/** Small labelled number tile. */
export function Stat({
  label,
  value,
  sub,
  tone,
  small,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: "gain" | "loss";
  small?: boolean;
}) {
  return (
    <div className="surface-1 flex flex-col gap-0.5 px-3.5 py-3">
      <dt className="text-[0.7rem]" style={{ color: "var(--color-fg-subtle)" }}>
        {label}
      </dt>
      <dd
        className={`font-mono font-semibold tabular-nums ${small ? "pt-0.5 text-sm" : "text-lg"}`}
        style={{ color: tone === "gain" ? "var(--color-success)" : tone === "loss" ? "var(--color-error)" : undefined }}
      >
        {value}
      </dd>
      {sub && (
        <dd className="text-[0.7rem]" style={{ color: "var(--color-fg-subtle)" }}>
          {sub}
        </dd>
      )}
    </div>
  );
}
