"use client";

import { useEffect, useId, useRef, useState } from "react";
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
  /** Short label (e.g., "DELTA"). Styled small-caps — not a heading.
   *  Accepts ReactNode so callers can attach a visually-hidden accessible
   *  expansion (e.g., "25Δ RR" with sr-only "25 delta risk reversal"). */
  term: React.ReactNode;
  /** Primary value (e.g., "0.6368"). */
  value: React.ReactNode;
  /** Optional hint shown beneath the value. */
  hint?: React.ReactNode;
  /** Color variant for the value. */
  tone?: "default" | "success" | "warn" | "error" | "accent";
  /**
   * If provided, renders a (?) help button in the top-right that toggles a
   * disclosure panel with this content. Uses an `aria-expanded` button +
   * `aria-controls` panel — accessible via keyboard and touch, dismissible
   * via Escape. Not a tooltip (which would fail SC 1.4.13 on hover-only).
   */
  helpContent?: React.ReactNode;
  /**
   * Accessible name for the help trigger (required when helpContent is set).
   * E.g., "Show Delta explanation". Visible "?" glyph is aria-hidden.
   */
  helpLabel?: string;
};

export function StatTile({
  term,
  value,
  hint,
  tone = "default",
  helpContent,
  helpLabel,
}: StatTileProps) {
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

  const [open, setOpen] = useState(false);
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement | null>(null);

  // Close on Escape (when the panel or trigger has focus inside this tile)
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div
      ref={rootRef}
      className="relative rounded-md border p-3"
      style={{
        background: "var(--color-surface-1)",
        borderColor: "var(--color-border)",
      }}
    >
      {helpContent && (
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          aria-label={helpLabel ?? "Show explanation"}
          onClick={() => setOpen((o) => !o)}
          className="absolute right-2 top-2 inline-flex h-5 w-5 items-center justify-center rounded-full border text-[0.6rem] font-bold transition-colors"
          style={{
            borderColor: "var(--color-border-strong)",
            color: "var(--color-fg-muted)",
            background: "var(--color-surface-2)",
          }}
        >
          <span aria-hidden="true">?</span>
        </button>
      )}
      <dt
        className="pr-7 text-[0.62rem] font-semibold uppercase tracking-[0.08em]"
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
      {helpContent && (
        <dd
          id={panelId}
          hidden={!open}
          className="mt-2 rounded border p-2 text-[0.72rem] leading-relaxed"
          style={{
            background: "var(--color-surface-2)",
            borderColor: "var(--color-border)",
            color: "var(--color-fg-default)",
          }}
        >
          {helpContent}
        </dd>
      )}
    </div>
  );
}
