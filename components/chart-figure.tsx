"use client";

import * as React from "react";

/**
 * Accessible wrapper for data visualizations.
 *
 * Requires a mandatory `dataTable` prop — every chart ships with a
 * keyboard-accessible data-table alternative inside a <details>.
 * The visual chart is `aria-hidden="true"` because its SVG/canvas content
 * is decorative from AT's point of view; the table is the real channel.
 */
export type ChartFigureProps = {
  id: string;
  title: string;
  /** Dynamic description — changes when data updates. */
  description: string;
  /** Render-prop for the visual chart (Plotly, etc.). */
  children: React.ReactNode;
  /**
   * Keyboard-accessible data-table alternative. Omit only when the chart
   * itself is accessible (inline SVG with role="img" + aria-label) AND the
   * figcaption description names all key data points.
   */
  dataTable?: {
    caption: string;
    headers: string[];
    rows: (string | number)[][];
  };
  /**
   * Whether to mark the chart region as aria-hidden. Default true because
   * most chart libraries (Plotly, canvas) don't expose semantic content.
   * Set false when the child is a semantic SVG carrying its own role/label.
   */
  chartAriaHidden?: boolean;
  className?: string;
};

export function ChartFigure({
  id,
  title,
  description,
  children,
  dataTable,
  chartAriaHidden = true,
  className = "",
}: ChartFigureProps) {
  const titleId = `${id}-title`;
  const descId = `${id}-desc`;
  return (
    <figure
      aria-labelledby={titleId}
      aria-describedby={descId}
      className={`rounded-md border ${className}`}
      style={{
        background: "var(--color-surface-1)",
        borderColor: "var(--color-border)",
      }}
    >
      <figcaption className="border-b px-4 py-2.5" style={{ borderColor: "var(--color-border)" }}>
        <h3
          id={titleId}
          className="text-sm font-semibold"
          style={{ color: "var(--color-fg-default)" }}
        >
          {title}
        </h3>
        <p
          id={descId}
          aria-live="polite"
          aria-atomic="true"
          className="mt-0.5 text-xs"
          style={{ color: "var(--color-fg-muted)" }}
        >
          {description}
        </p>
      </figcaption>

      <div aria-hidden={chartAriaHidden ? "true" : undefined} className="px-2 py-2">
        {children}
      </div>

      {dataTable && (
      <details className="group border-t" style={{ borderColor: "var(--color-border)" }}>
        <summary
          className="cursor-pointer px-4 py-2 text-xs"
          style={{ color: "var(--color-fg-muted)" }}
        >
          <span className="underline decoration-dotted underline-offset-2">
            View data as table
          </span>{" "}
          <span className="group-open:hidden">▾</span>
          <span className="hidden group-open:inline">▴</span>
        </summary>
        <div className="overflow-x-auto px-4 pb-3">
          <table className="w-full text-xs">
            <caption className="sr-only">{dataTable.caption}</caption>
            <thead>
              <tr>
                {dataTable.headers.map((h) => (
                  <th
                    key={h}
                    scope="col"
                    className="border-b py-1.5 pr-4 text-left font-medium"
                    style={{
                      color: "var(--color-fg-muted)",
                      borderColor: "var(--color-border)",
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dataTable.rows.map((r, i) => (
                <tr key={i}>
                  {r.map((c, j) => (
                    <td
                      key={j}
                      className="py-1 pr-4 font-mono tabular-nums"
                      style={{ color: "var(--color-fg-default)" }}
                    >
                      {c}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
      )}
    </figure>
  );
}
