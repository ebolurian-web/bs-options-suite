"use client";

import { useMemo } from "react";
import type { Data, Layout } from "plotly.js-dist-min";
import { ChartFigure } from "@/components/chart-figure";
import { PlotlyChart } from "@/components/plotly-chart";
import { mergeLayout } from "@/lib/plotly-theme";
import type { HistoricalSeries } from "@/lib/types";
import { buildConeWindows, DEFAULT_WINDOWS } from "@/lib/vol-cone";

export type VolConeChartProps = {
  history: HistoricalSeries;
  /** Current implied volatility as decimal (e.g., 0.22 for 22%). */
  currentIV: number | null;
};

/**
 * Historical vol cone: for each rolling window (20/60/120 days), plot the
 * p10/p25/p50/p75/p90 realized vol. Overlay the current IV as a marker so
 * the user can see if the market is pricing options richer or cheaper
 * than history.
 *
 * Non-hue differentiation: solid median, dashed quartiles, dotted extremes.
 */
export function VolConeChart({ history, currentIV }: VolConeChartProps) {
  const cones = useMemo(() => buildConeWindows(history.bars, DEFAULT_WINDOWS), [history]);

  if (cones.length === 0) return null;

  const xs = cones.map((c) => c.window);
  const pct = (v: number) => +(v * 100).toFixed(2);

  const traces: Partial<Data>[] = [
    {
      name: "90th",
      type: "scatter",
      mode: "lines+markers",
      x: xs,
      y: cones.map((c) => pct(c.p90)),
      line: { color: "#f87171", width: 1.5, dash: "dot" },
      marker: { color: "#f87171", size: 6, symbol: "triangle-up" },
      hovertemplate: "%{x}-day · p90 %{y:.2f}%<extra></extra>",
    },
    {
      name: "75th",
      type: "scatter",
      mode: "lines+markers",
      x: xs,
      y: cones.map((c) => pct(c.p75)),
      line: { color: "#fbbf24", width: 1.8, dash: "dash" },
      marker: { color: "#fbbf24", size: 6, symbol: "square" },
      hovertemplate: "%{x}-day · p75 %{y:.2f}%<extra></extra>",
    },
    {
      name: "Median",
      type: "scatter",
      mode: "lines+markers",
      x: xs,
      y: cones.map((c) => pct(c.p50)),
      line: { color: "#00d084", width: 2.4 },
      marker: { color: "#00d084", size: 7, symbol: "circle" },
      hovertemplate: "%{x}-day · median %{y:.2f}%<extra></extra>",
    },
    {
      name: "25th",
      type: "scatter",
      mode: "lines+markers",
      x: xs,
      y: cones.map((c) => pct(c.p25)),
      line: { color: "#fbbf24", width: 1.8, dash: "dash" },
      marker: { color: "#fbbf24", size: 6, symbol: "square" },
      hovertemplate: "%{x}-day · p25 %{y:.2f}%<extra></extra>",
    },
    {
      name: "10th",
      type: "scatter",
      mode: "lines+markers",
      x: xs,
      y: cones.map((c) => pct(c.p10)),
      line: { color: "#f87171", width: 1.5, dash: "dot" },
      marker: { color: "#f87171", size: 6, symbol: "triangle-down" },
      hovertemplate: "%{x}-day · p10 %{y:.2f}%<extra></extra>",
    },
  ];

  // Current IV marker — horizontal line + annotation
  const shapes: Partial<Layout>["shapes"] = [];
  const annotations: Partial<Layout>["annotations"] = [];
  if (currentIV != null && currentIV > 0) {
    const ivPct = currentIV * 100;
    shapes.push({
      type: "line",
      x0: xs[0] - 10,
      x1: xs[xs.length - 1] + 10,
      y0: ivPct,
      y1: ivPct,
      line: { color: "#22d3ee", width: 2, dash: "solid" },
    });
    annotations.push({
      x: xs[xs.length - 1],
      y: ivPct,
      xref: "x",
      yref: "y",
      xanchor: "right",
      yanchor: "bottom",
      text: `Current IV ${ivPct.toFixed(1)}%`,
      showarrow: false,
      font: { color: "#22d3ee", size: 11 },
    });
  }

  const makeLayout = (): Partial<Layout> =>
    mergeLayout({
      xaxis: {
        title: { text: "Rolling window (days)" },
        tickvals: xs,
        ticktext: xs.map((x) => `${x}d`),
      },
      yaxis: { title: { text: "Realized vol (%)" } },
      legend: { orientation: "h", x: 0, y: -0.22 },
      shapes,
      annotations,
      margin: { l: 60, r: 20, t: 20, b: 56 },
    });
  const layout = makeLayout();

  const currentIvPct = currentIV != null ? currentIV * 100 : null;
  const median60 = cones.find((c) => c.window === 60) ?? cones[0];
  const relationship =
    currentIvPct != null && median60
      ? currentIvPct > median60.p75 * 100
        ? `rich (above the 75th percentile of ${median60.window}-day realized vol)`
        : currentIvPct < median60.p25 * 100
          ? `cheap (below the 25th percentile of ${median60.window}-day realized vol)`
          : "roughly in line with historical realized vol"
      : null;

  const description =
    `Where the options market's current implied volatility sits compared to how volatile the stock has actually been over the past year. ` +
    (currentIvPct != null
      ? `Current IV ${currentIvPct.toFixed(1)}% is ${relationship}.`
      : "Current IV not available.") +
    " Median = solid green, quartiles = dashed amber, extremes = dotted red.";

  const ariaLabel =
    `Historical volatility cone across ${cones.length} rolling windows. ` +
    (currentIvPct != null
      ? `Current IV ${currentIvPct.toFixed(1)}% is ${relationship}.`
      : "");

  const tableRows = cones.map((c) => [
    `${c.window}d`,
    `${pct(c.p10).toFixed(1)}%`,
    `${pct(c.p25).toFixed(1)}%`,
    `${pct(c.p50).toFixed(1)}%`,
    `${pct(c.p75).toFixed(1)}%`,
    `${pct(c.p90).toFixed(1)}%`,
    c.latest != null ? `${pct(c.latest).toFixed(1)}%` : "—",
  ]);

  return (
    <ChartFigure
      id="vol-cone"
      title="Historical Vol Cone vs Current IV"
      description={description}
      dataTable={{
        caption: "Rolling realized volatility percentiles and current reading",
        headers: ["Window", "p10", "p25", "Median", "p75", "p90", "Latest"],
        rows: tableRows,
      }}
    >
      <PlotlyChart
        data={traces}
        layout={layout}
        relayoutForTheme={makeLayout}
        style={{ height: 360 }}
      />
    </ChartFigure>
  );
  void ariaLabel; // aria-label is inside figure via ChartFigure's description/figcaption already
}
