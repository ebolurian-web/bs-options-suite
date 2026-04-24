"use client";

import { useMemo } from "react";
import type { Data, Layout } from "plotly.js-dist-min";
import { ChartFigure } from "@/components/chart-figure";
import { PlotlyChart } from "@/components/plotly-chart";
import { mergeLayout } from "@/lib/plotly-theme";
import type { StrategyLeg } from "@/lib/strategy";
import { combinedPnl, nearestTYears } from "@/lib/strategy";

export type DistributionChartProps = {
  legs: StrategyLeg[];
  spot: number;
  /** Annualized vol as decimal. */
  volatility: number;
  popPercent: number;
  breakEvens: number[];
};

/**
 * Log-normal probability density of where the stock might be at expiry,
 * overlaid with profit/loss zones from the strategy's P&L curve.
 */
export function DistributionChart({ legs, spot, volatility, popPercent, breakEvens }: DistributionChartProps) {
  const { prices, pdfs, profitMask, maxPdf, T } = useMemo(() => {
    const strikes = legs.filter((l) => l.type !== "stock").map((l) => l.strike);
    const minK = strikes.length ? Math.min(...strikes, spot) : spot;
    const maxK = strikes.length ? Math.max(...strikes, spot) : spot;
    const lo = Math.max(0.01, minK * 0.55);
    const hi = maxK * 1.7;
    const N = 200;
    const step = (hi - lo) / N;
    const prices: number[] = [];
    for (let i = 0; i <= N; i++) prices.push(lo + i * step);

    const T = nearestTYears(legs);
    const mu = -0.5 * volatility * volatility * T;
    const sigT = volatility * Math.sqrt(T);

    const pdf = (x: number) => {
      if (x <= 0) return 0;
      const z = (Math.log(x / spot) - mu) / sigT;
      return Math.exp(-0.5 * z * z) / (x * sigT * Math.sqrt(2 * Math.PI));
    };
    const pdfs = prices.map(pdf);
    const pnls = combinedPnl(legs, prices);
    const profitMask = pnls.map((v) => v >= 0);
    const maxPdf = Math.max(...pdfs);
    return { prices, pdfs, profitMask, maxPdf, T };
  }, [legs, spot, volatility]);

  if (!legs.length) return null;

  const profitX: number[] = [];
  const profitY: number[] = [];
  const lossX: number[] = [];
  const lossY: number[] = [];
  prices.forEach((p, i) => {
    if (profitMask[i]) {
      profitX.push(p);
      profitY.push(pdfs[i]);
      lossX.push(p);
      lossY.push(0);
    } else {
      lossX.push(p);
      lossY.push(pdfs[i]);
      profitX.push(p);
      profitY.push(0);
    }
  });

  const traces: Partial<Data>[] = [
    {
      type: "scatter",
      x: lossX,
      y: lossY,
      mode: "lines",
      name: "Loss zone",
      line: { width: 0 },
      fill: "tozeroy",
      fillcolor: "rgba(248,113,113,0.22)",
      hoverinfo: "skip",
    },
    {
      type: "scatter",
      x: profitX,
      y: profitY,
      mode: "lines",
      name: "Profit zone",
      line: { width: 0 },
      fill: "tozeroy",
      fillcolor: "rgba(0,208,132,0.22)",
      hoverinfo: "skip",
    },
    {
      type: "scatter",
      x: prices,
      y: pdfs,
      mode: "lines",
      name: "Price distribution",
      line: { color: "#a1a1a1", width: 1.5 },
      hovertemplate: "Price $%{x:.2f}<br>Density %{y:.5f}<extra></extra>",
      showlegend: false,
    },
    {
      type: "scatter",
      x: [spot, spot],
      y: [0, maxPdf * 1.15],
      mode: "lines",
      name: `Spot $${spot.toFixed(2)}`,
      line: { color: "#ededed", width: 1.5, dash: "dash" },
      hoverinfo: "skip",
    },
    ...breakEvens.map(
      (be, i) =>
        ({
          type: "scatter",
          x: [be, be],
          y: [0, maxPdf * 1.15],
          mode: "lines",
          name: i === 0 ? "Break-even" : undefined,
          showlegend: i === 0,
          line: { color: "#fbbf24", width: 1.5, dash: "dot" },
          hoverinfo: "skip",
        }) as Partial<Data>,
    ),
  ];

  const makeLayout = (): Partial<Layout> =>
    mergeLayout({
      xaxis: {
        title: { text: "Stock Price at Expiry ($)" },
        range: [prices[0], prices[prices.length - 1]],
      },
      yaxis: {
        title: { text: "Probability Density" },
        range: [0, maxPdf * 1.25],
      },
      margin: { l: 64, r: 20, t: 14, b: 56 },
      legend: { orientation: "h", x: 0, y: -0.22 },
      hovermode: "x unified",
    });
  const layout = makeLayout();

  const days = Math.round(T * 365);
  const description =
    `Log-normal distribution of where the stock might land ${days} days from now, assuming ` +
    `${(volatility * 100).toFixed(1)}% annual volatility. Green area = scenarios where your strategy profits (${popPercent.toFixed(1)}% of outcomes); ` +
    `red = loss scenarios.`;

  return (
    <ChartFigure id="dist" title="Probability Distribution at Expiry" description={description}>
      <PlotlyChart data={traces} layout={layout} relayoutForTheme={makeLayout} style={{ height: 340 }} />
    </ChartFigure>
  );
}
