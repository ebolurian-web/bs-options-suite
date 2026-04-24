import * as React from "react";

/**
 * Description list for displaying labeled numeric values.
 * Semantically a <dl>, visually a grid of tiles.
 * `labelledBy` points at an <h2> or <h3> that names the group.
 */
export function StatsGrid({
  labelledBy,
  children,
  className = "",
}: {
  labelledBy: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <dl
      role="group"
      aria-labelledby={labelledBy}
      className={`grid grid-cols-2 gap-2 md:grid-cols-4 ${className}`}
    >
      {children}
    </dl>
  );
}

export type StatTileProps = {
  /** Short label (e.g., "DELTA"). Styled small-caps — not a heading. */
  term: string;
  /** Primary value (e.g., "0.6368"). */
  value: React.ReactNode;
  /** Optional hint shown beneath the value. */
  hint?: React.ReactNode;
  /** Color variant for the value. */
  tone?: "default" | "success" | "warn" | "error" | "accent";
};

export function StatTile({ term, value, hint, tone = "default" }: StatTileProps) {
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
      className="rounded-md border p-3"
      style={{
        background: "var(--color-surface-1)",
        borderColor: "var(--color-border)",
      }}
    >
      <dt
        className="text-[0.62rem] font-semibold uppercase tracking-[0.08em]"
        style={{ color: "var(--color-fg-muted)" }}
      >
        {term}
      </dt>
      <dd
        className="mt-1 font-mono text-xl font-semibold tabular-nums"
        style={{ color: toneColor, fontFamily: "var(--font-display), serif" }}
      >
        {value}
      </dd>
      {hint && (
        <dd className="mt-0.5 text-[0.7rem]" style={{ color: "var(--color-fg-subtle)" }}>
          {hint}
        </dd>
      )}
    </div>
  );
}
