"use client";

import { useMemo, useState } from "react";
import type { Data, Layout } from "plotly.js-dist-min";
import { ChartFigure } from "@/components/chart-figure";
import { PlotlyChart } from "@/components/plotly-chart";
import { StatsGrid, StatTile } from "@/components/stats-grid";
import {
  buildSurfaceGrid,
  classifyTermStructure,
  computeSkewSeries,
  evalPoly,
  polyFit,
  type VolSurface,
} from "@/lib/vol-surface";

type Tab = "surface" | "smile" | "skew";

const DARK_PLOTLY = {
  paper_bgcolor: "#111111",
  plot_bgcolor: "#0a0a0a",
  font: { color: "#a1a1a1", family: "Inter, system-ui, sans-serif", size: 11 },
  xaxis: { gridcolor: "#1a1a1a", zerolinecolor: "#2e2e2e", color: "#a1a1a1" },
  yaxis: { gridcolor: "#1a1a1a", zerolinecolor: "#2e2e2e", color: "#a1a1a1" },
  margin: { l: 60, r: 20, t: 20, b: 50 },
} as const satisfies Partial<Layout>;

export function VolSurfaceSection({ surface }: { surface: VolSurface }) {
  const [tab, setTab] = useState<Tab>("surface");
  const skew = useMemo(() => computeSkewSeries(surface), [surface]);
  const term = useMemo(() => classifyTermStructure(surface), [surface]);

  return (
    <section aria-labelledby="h-vol-surface">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-3">
        <h2
          id="h-vol-surface"
          className="text-sm font-semibold uppercase tracking-wide"
          style={{ color: "var(--color-fg-muted)" }}
        >
          Volatility Surface &amp; Skew
        </h2>
        <p className="text-[0.7rem]" style={{ color: "var(--color-fg-subtle)" }}>
          {surface.expirations.length} expiries ·{" "}
          {surface.expirations.reduce((s, e) => s + e.contracts.length, 0)} contracts · IV
          recomputed from bid-ask mid
        </p>
      </div>

      {/* Sub-view switcher — plain buttons with aria-pressed (not role=tab) */}
      <div
        role="group"
        aria-label="Volatility analytics view"
        className="mb-3 inline-flex rounded-md border p-0.5"
        style={{ background: "var(--color-surface-1)", borderColor: "var(--color-border)" }}
      >
        {(
          [
            ["surface", "3D Surface"],
            ["smile", "Smile"],
            ["skew", "Skew & Term"],
          ] as const
        ).map(([id, label]) => {
          const active = tab === id;
          return (
            <button
              key={id}
              type="button"
              aria-pressed={active}
              onClick={() => setTab(id)}
              className="min-h-[32px] rounded px-3 py-1 text-xs font-semibold transition-colors"
              style={{
                background: active ? "var(--color-surface-3)" : "transparent",
                color: active ? "var(--color-fg-default)" : "var(--color-fg-muted)",
                borderBottom: active ? "2px solid var(--color-accent)" : "2px solid transparent",
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

      {tab === "surface" && <SurfacePanel surface={surface} />}
      {tab === "smile" && <SmilePanel surface={surface} />}
      {tab === "skew" && <SkewPanel surface={surface} skew={skew} term={term} />}
    </section>
  );
}

// -- 3D SURFACE --------------------------------------------------------

function SurfacePanel({ surface }: { surface: VolSurface }) {
  const grid = useMemo(() => buildSurfaceGrid(surface), [surface]);

  const data: Partial<Data>[] = [
    {
      type: "surface",
      x: grid.xAxis,
      y: grid.yAxis,
      z: grid.z,
      colorscale: [
        [0, "#003d27"],
        [0.25, "#00a86b"],
        [0.5, "#fbbf24"],
        [0.75, "#f87171"],
        [1, "#7f1d1d"],
      ],
      colorbar: {
        title: "IV (%)",
        tickfont: { color: "#a1a1a1" },
        outlinewidth: 0,
        len: 0.8,
      },
      contours: {
        z: { show: true, usecolormap: true, highlightcolor: "#00d084", project: { z: true } },
      },
      hovertemplate: "Moneyness %{x:.2f}<br>Days %{y:.0f}<br>IV %{z:.1f}%<extra></extra>",
    } as Partial<Data>,
  ];

  const layout: Partial<Layout> = {
    ...DARK_PLOTLY,
    margin: { l: 0, r: 0, t: 10, b: 0 },
    scene: {
      bgcolor: "#0a0a0a",
      xaxis: {
        title: { text: "Moneyness (K/S)" },
        color: "#ededed",
        gridcolor: "#242424",
        backgroundcolor: "#0a0a0a",
        showbackground: true,
      },
      yaxis: {
        title: { text: "Days to Expiry" },
        color: "#ededed",
        gridcolor: "#242424",
        backgroundcolor: "#0a0a0a",
        showbackground: true,
      },
      zaxis: {
        title: { text: "IV (%)" },
        color: "#ededed",
        gridcolor: "#242424",
        backgroundcolor: "#0a0a0a",
        showbackground: true,
      },
      camera: { eye: { x: 1.45, y: -1.45, z: 0.85 } },
    } as Layout["scene"],
  };

  const tableRows = surface.expirations.map((e) => {
    const atm = e.atmIV != null ? (e.atmIV * 100).toFixed(1) + "%" : "—";
    const ivs = e.contracts.flatMap((c) => [c.callIV, c.putIV]).filter((v): v is number => v != null && v > 0);
    const mn = ivs.length ? (Math.min(...ivs) * 100).toFixed(1) + "%" : "—";
    const mx = ivs.length ? (Math.max(...ivs) * 100).toFixed(1) + "%" : "—";
    return [e.expiration, Math.round(e.dte), atm, mn, mx, e.contracts.length];
  });

  return (
    <ChartFigure
      id="vol-surface"
      title="3D Implied Volatility Surface"
      description={
        `This 3D surface shows what volatility the options market expects for ${surface.ticker} at every combination of strike price and time to expiry. ` +
        `Higher peaks mean traders are paying up for uncertainty; dips mean they're pricing calm. ` +
        `${surface.summary} Use the toolbar to rotate or zoom; the summary table below has the exact numbers.`
      }
      dataTable={{
        caption: "Implied volatility summary by expiry",
        headers: ["Expiry", "Days", "ATM IV", "Min IV", "Max IV", "Strikes"],
        rows: tableRows,
      }}
    >
      <PlotlyChart data={data} layout={layout} style={{ height: 480 }} />
    </ChartFigure>
  );
}

// -- SMILE -------------------------------------------------------------

function SmilePanel({ surface }: { surface: VolSurface }) {
  const [idx, setIdx] = useState(0);
  const slice = surface.expirations[idx];

  const data = useMemo<Partial<Data>[]>(() => {
    if (!slice) return [];
    const calls = slice.contracts.filter((c) => c.callIV != null);
    const puts = slice.contracts.filter((c) => c.putIV != null);

    // Fit a parabola through all IVs against moneyness
    const xs: number[] = [];
    const ys: number[] = [];
    for (const c of calls) {
      xs.push(c.moneyness);
      ys.push(c.callIV! * 100);
    }
    for (const p of puts) {
      xs.push(p.moneyness);
      ys.push(p.putIV! * 100);
    }
    const fitX: number[] = [];
    const fitY: number[] = [];
    if (xs.length >= 4) {
      const coef = polyFit(xs, ys, 2);
      const xMin = Math.min(...xs);
      const xMax = Math.max(...xs);
      for (let i = 0; i <= 80; i++) {
        const x = xMin + ((xMax - xMin) * i) / 80;
        fitX.push(x);
        fitY.push(evalPoly(coef, x));
      }
    }

    return [
      {
        name: "Call IV",
        type: "scatter",
        mode: "markers",
        x: calls.map((c) => c.moneyness),
        y: calls.map((c) => c.callIV! * 100),
        marker: { color: "#00d084", size: 8, symbol: "circle", line: { color: "#003d27", width: 1 } },
        hovertemplate: "K/S %{x:.3f}<br>IV %{y:.1f}%<extra>Call</extra>",
      } as Partial<Data>,
      {
        name: "Put IV",
        type: "scatter",
        mode: "markers",
        x: puts.map((p) => p.moneyness),
        y: puts.map((p) => p.putIV! * 100),
        marker: { color: "#f87171", size: 9, symbol: "triangle-up", line: { color: "#4a0e0e", width: 1 } },
        hovertemplate: "K/S %{x:.3f}<br>IV %{y:.1f}%<extra>Put</extra>",
      } as Partial<Data>,
      {
        name: "Smile fit",
        type: "scatter",
        mode: "lines",
        x: fitX,
        y: fitY,
        line: { color: "#fbbf24", width: 2, dash: "dot" },
        hoverinfo: "skip",
      } as Partial<Data>,
    ];
  }, [slice]);

  if (!slice) return null;

  const layout: Partial<Layout> = {
    ...DARK_PLOTLY,
    xaxis: { ...DARK_PLOTLY.xaxis, title: { text: "Moneyness (K/S)" } },
    yaxis: { ...DARK_PLOTLY.yaxis, title: { text: "Implied Volatility (%)" } },
    legend: {
      bgcolor: "rgba(17,17,17,0.8)",
      bordercolor: "#2e2e2e",
      borderwidth: 1,
      orientation: "h",
      x: 0,
      y: -0.2,
    },
    shapes: [
      {
        type: "line",
        x0: 1,
        x1: 1,
        y0: 0,
        y1: 1,
        yref: "paper",
        line: { color: "#a1a1a1", width: 1, dash: "dash" },
      },
    ],
  };

  const tableRows = slice.contracts
    .filter((c) => c.callIV != null || c.putIV != null)
    .map((c) => [
      `$${c.strike.toFixed(2)}`,
      c.moneyness.toFixed(3),
      c.callIV != null ? (c.callIV * 100).toFixed(1) + "%" : "—",
      c.putIV != null ? (c.putIV * 100).toFixed(1) + "%" : "—",
    ]);

  const callSideAvg = avg(slice.contracts.filter((c) => c.moneyness > 1).map((c) => c.callIV));
  const putSideAvg = avg(slice.contracts.filter((c) => c.moneyness < 1).map((c) => c.putIV));
  const skewText =
    callSideAvg != null && putSideAvg != null
      ? putSideAvg - callSideAvg > 0.02
        ? "Put skew — OTM puts priced richer."
        : putSideAvg - callSideAvg < -0.02
          ? "Call skew — OTM calls priced richer."
          : "Smile is roughly flat."
      : "";

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <label
          htmlFor="smile-expiry"
          className="text-xs font-medium uppercase tracking-wide"
          style={{ color: "var(--color-fg-muted)" }}
        >
          Expiry
        </label>
        <select
          id="smile-expiry"
          value={idx}
          onChange={(e) => setIdx(Number(e.target.value))}
          className="rounded border px-2 py-1.5 text-sm"
          style={{
            background: "var(--color-surface-2)",
            borderColor: "var(--color-border)",
            color: "var(--color-fg-default)",
          }}
        >
          {surface.expirations.map((e, i) => (
            <option key={e.expiration} value={i}>
              {e.label}
            </option>
          ))}
        </select>
      </div>
      <ChartFigure
        id="vol-smile"
        title={`Smile — ${slice.label}`}
        description={`ATM IV ${slice.atmIV != null ? (slice.atmIV * 100).toFixed(1) + "%" : "n/a"}. ${skewText}`}
        dataTable={{
          caption: `Call and put implied volatilities by strike for ${slice.label}`,
          headers: ["Strike", "K/S", "Call IV", "Put IV"],
          rows: tableRows,
        }}
      >
        <PlotlyChart data={data} layout={layout} style={{ height: 380 }} />
      </ChartFigure>
    </div>
  );
}

// -- SKEW / TERM STRUCTURE ----------------------------------------------

function SkewPanel({
  surface,
  skew,
  term,
}: {
  surface: VolSurface;
  skew: ReturnType<typeof computeSkewSeries>;
  term: { klass: string; slope: number | null };
}) {
  const front = surface.expirations[0];
  const rrFront = skew[0]?.rr25 ?? null;
  const bfFront = skew[0]?.bf25 ?? null;

  const atmLine = skew.filter((s) => s.atmIV != null);
  const rrLine = skew.filter((s) => s.rr25 != null);
  const bfLine = skew.filter((s) => s.bf25 != null);

  const data: Partial<Data>[] = [
    {
      name: "ATM IV",
      type: "scatter",
      mode: "lines+markers",
      x: atmLine.map((s) => s.dte),
      y: atmLine.map((s) => s.atmIV! * 100),
      line: { color: "#00d084", width: 2.2 },
      marker: { color: "#00d084", size: 7 },
      hovertemplate: "Days %{x:.0f}<br>ATM IV %{y:.2f}%<extra></extra>",
    } as Partial<Data>,
    {
      name: "25Δ Risk Reversal",
      type: "scatter",
      mode: "lines+markers",
      x: rrLine.map((s) => s.dte),
      y: rrLine.map((s) => s.rr25! * 100),
      line: { color: "#f87171", width: 2, dash: "dash" },
      marker: { color: "#f87171", size: 6, symbol: "square" },
      hovertemplate: "Days %{x:.0f}<br>RR %{y:.2f}%<extra>25Δ RR</extra>",
    } as Partial<Data>,
    {
      name: "25Δ Butterfly",
      type: "scatter",
      mode: "lines+markers",
      x: bfLine.map((s) => s.dte),
      y: bfLine.map((s) => s.bf25! * 100),
      line: { color: "#fbbf24", width: 2, dash: "dot" },
      marker: { color: "#fbbf24", size: 6, symbol: "diamond" },
      hovertemplate: "Days %{x:.0f}<br>BF %{y:.2f}%<extra>25Δ BF</extra>",
    } as Partial<Data>,
  ];

  const layout: Partial<Layout> = {
    ...DARK_PLOTLY,
    xaxis: { ...DARK_PLOTLY.xaxis, title: { text: "Days to Expiry" } },
    yaxis: { ...DARK_PLOTLY.yaxis, title: { text: "Value (%)" } },
    legend: {
      bgcolor: "rgba(17,17,17,0.85)",
      bordercolor: "#2e2e2e",
      borderwidth: 1,
      orientation: "h",
      x: 0,
      y: -0.22,
    },
  };

  const tableRows = skew.map((s, i) => [
    surface.expirations[i].expiration,
    Math.round(s.dte),
    s.atmIV != null ? (s.atmIV * 100).toFixed(2) + "%" : "—",
    s.rr25 != null ? (s.rr25 * 100).toFixed(2) + "%" : "—",
    s.bf25 != null ? (s.bf25 * 100).toFixed(2) + "%" : "—",
  ]);

  const termLabel =
    term.klass === "contango"
      ? "Contango"
      : term.klass === "backwardation"
        ? "Backwardation"
        : "Flat";
  const termTone = term.klass === "contango" ? "accent" : term.klass === "backwardation" ? "warn" : "default";

  return (
    <div className="space-y-3">
      <StatsGrid labelledBy="h-vol-surface">
        <StatTile
          term={
            <>
              25Δ Risk Reversal <span className="sr-only">(25 delta risk reversal)</span>
            </>
          }
          value={rrFront != null ? `${rrFront >= 0 ? "+" : ""}${(rrFront * 100).toFixed(2)}%` : "—"}
          tone={rrFront == null ? "default" : rrFront > 0 ? "error" : "accent"}
          hint="IV(25Δ put) − IV(25Δ call)"
        />
        <StatTile
          term={
            <>
              25Δ Butterfly <span className="sr-only">(25 delta butterfly)</span>
            </>
          }
          value={bfFront != null ? `${(bfFront * 100).toFixed(2)}%` : "—"}
          tone="warn"
          hint="avg wing − ATM"
        />
        <StatTile
          term="Front-Month ATM IV"
          value={front?.atmIV != null ? `${(front.atmIV * 100).toFixed(1)}%` : "—"}
          tone="accent"
          hint={front?.label ?? "—"}
        />
        <StatTile
          term="Term Structure"
          value={termLabel}
          tone={termTone as "accent" | "warn" | "default"}
          hint={term.slope != null ? `Slope ${(term.slope * 100).toFixed(2)}%` : "—"}
        />
      </StatsGrid>
      <ChartFigure
        id="vol-skew"
        title="Term Structure & Skew"
        description={`ATM IV (solid green), 25Δ Risk Reversal (dashed red), and 25Δ Butterfly (dotted amber) across expiries. Term structure is ${termLabel.toLowerCase()}.`}
        dataTable={{
          caption: "Skew and term-structure metrics by expiry",
          headers: ["Expiry", "Days", "ATM IV", "25Δ RR", "25Δ BF"],
          rows: tableRows,
        }}
      >
        <PlotlyChart data={data} layout={layout} style={{ height: 360 }} />
      </ChartFigure>
    </div>
  );
}

function avg(xs: (number | null)[]): number | null {
  const nums = xs.filter((x): x is number => x != null && Number.isFinite(x));
  if (!nums.length) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}
