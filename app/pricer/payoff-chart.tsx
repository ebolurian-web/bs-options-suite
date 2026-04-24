"use client";

import { useMemo } from "react";
import { ChartFigure } from "@/components/chart-figure";

/**
 * SVG-based payoff diagram at expiry.
 * No chart library — just math + a small SVG so we stay dependency-light.
 * Plotly-based charts will land in Phase 3 for the vol surface.
 */
export type PayoffChartProps = {
  S: number;
  K: number;
  callPremium: number;
  putPremium: number;
};

export function PayoffChart({ S, K, callPremium, putPremium }: PayoffChartProps) {
  const { prices, callPnl, putPnl, yMin, yMax, description, tableRows } = useMemo(() => {
    const lo = Math.max(0.01, Math.min(S, K) * 0.6);
    const hi = Math.max(S, K) * 1.6;
    const N = 60;
    const step = (hi - lo) / N;
    const prices: number[] = [];
    const callPnl: number[] = [];
    const putPnl: number[] = [];
    for (let i = 0; i <= N; i++) {
      const p = lo + i * step;
      prices.push(p);
      callPnl.push(Math.max(0, p - K) - callPremium);
      putPnl.push(Math.max(0, K - p) - putPremium);
    }
    const yMin = Math.min(...callPnl, ...putPnl);
    const yMax = Math.max(...callPnl, ...putPnl);
    const callBE = K + callPremium;
    const putBE = K - putPremium;
    const description = `Call P&L (green) and Put P&L (red) at expiry across stock prices from $${lo.toFixed(2)} to $${hi.toFixed(2)}. Call breaks even at $${callBE.toFixed(2)}; put breaks even at $${putBE.toFixed(2)}.`;
    // Sample 7 rows for the data table (evenly spaced)
    const sampleIdx = [0, 10, 20, 30, 40, 50, 60];
    const tableRows = sampleIdx.map((i) => [
      `$${prices[i].toFixed(2)}`,
      callPnl[i].toFixed(2),
      putPnl[i].toFixed(2),
    ]);
    return { prices, callPnl, putPnl, yMin, yMax, description, tableRows };
  }, [S, K, callPremium, putPremium]);

  return (
    <ChartFigure
      id="payoff"
      title="Payoff at Expiry"
      description={description}
      dataTable={{
        caption: "Call and put P&L at sampled stock prices at expiry",
        headers: ["Stock Price", "Call P&L ($)", "Put P&L ($)"],
        rows: tableRows,
      }}
    >
      <PayoffSvg
        prices={prices}
        callPnl={callPnl}
        putPnl={putPnl}
        yMin={yMin}
        yMax={yMax}
        spot={S}
        strike={K}
      />
    </ChartFigure>
  );
}

function PayoffSvg({
  prices,
  callPnl,
  putPnl,
  yMin,
  yMax,
  spot,
  strike,
}: {
  prices: number[];
  callPnl: number[];
  putPnl: number[];
  yMin: number;
  yMax: number;
  spot: number;
  strike: number;
}) {
  const W = 640;
  const H = 320;
  const padL = 44;
  const padR = 12;
  const padT = 16;
  const padB = 28;
  const xMin = prices[0];
  const xMax = prices[prices.length - 1];
  const padY = (yMax - yMin) * 0.1 || 1;
  const y0 = yMin - padY;
  const y1 = yMax + padY;

  const xScale = (p: number) => padL + ((p - xMin) / (xMax - xMin)) * (W - padL - padR);
  const yScale = (v: number) => padT + (1 - (v - y0) / (y1 - y0)) * (H - padT - padB);

  const linePath = (ys: number[]) =>
    prices.map((p, i) => `${i === 0 ? "M" : "L"}${xScale(p).toFixed(1)},${yScale(ys[i]).toFixed(1)}`).join(" ");

  // x ticks: 5 evenly spaced
  const xTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => xMin + f * (xMax - xMin));
  // y ticks: 0 always + 4 others
  const yTicks = [y0, (y0 + y1) / 2, y1, 0];

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      role="presentation"
      className="block w-full"
      style={{ maxHeight: 360 }}
    >
      {/* grid */}
      <g stroke="var(--color-border)" strokeWidth={1} opacity={0.7}>
        {xTicks.map((t, i) => (
          <line key={`xg-${i}`} x1={xScale(t)} x2={xScale(t)} y1={padT} y2={H - padB} />
        ))}
        {yTicks.map((t, i) => (
          <line
            key={`yg-${i}`}
            x1={padL}
            x2={W - padR}
            y1={yScale(t)}
            y2={yScale(t)}
            strokeDasharray={t === 0 ? undefined : "2 3"}
            opacity={t === 0 ? 1 : 0.6}
          />
        ))}
      </g>
      {/* strike vertical */}
      <line
        x1={xScale(strike)}
        x2={xScale(strike)}
        y1={padT}
        y2={H - padB}
        stroke="var(--color-warn)"
        strokeDasharray="4 3"
        strokeWidth={1}
        opacity={0.7}
      />
      <text
        x={xScale(strike) + 4}
        y={padT + 10}
        fontSize={10}
        fill="var(--color-warn)"
      >
        K
      </text>
      {/* spot vertical */}
      <line
        x1={xScale(spot)}
        x2={xScale(spot)}
        y1={padT}
        y2={H - padB}
        stroke="var(--color-fg-subtle)"
        strokeDasharray="4 3"
        strokeWidth={1}
        opacity={0.7}
      />
      <text
        x={xScale(spot) + 4}
        y={padT + 22}
        fontSize={10}
        fill="var(--color-fg-muted)"
      >
        S
      </text>
      {/* call curve */}
      <path
        d={linePath(callPnl)}
        fill="none"
        stroke="var(--color-success)"
        strokeWidth={2}
      />
      {/* put curve */}
      <path
        d={linePath(putPnl)}
        fill="none"
        stroke="var(--color-error)"
        strokeWidth={2}
      />
      {/* axes labels */}
      <g fontSize={10} fill="var(--color-fg-muted)">
        {xTicks.map((t, i) => (
          <text key={`xl-${i}`} x={xScale(t)} y={H - padB + 14} textAnchor="middle">
            ${t.toFixed(0)}
          </text>
        ))}
        {yTicks.map((t, i) => (
          <text key={`yl-${i}`} x={padL - 6} y={yScale(t) + 3} textAnchor="end">
            {t.toFixed(0)}
          </text>
        ))}
      </g>
      {/* legend */}
      <g fontSize={11} fill="var(--color-fg-default)">
        <rect x={W - padR - 110} y={padT - 2} width={110} height={32} fill="var(--color-surface-2)" opacity={0.85} rx={4} />
        <line x1={W - padR - 104} x2={W - padR - 88} y1={padT + 8} y2={padT + 8} stroke="var(--color-success)" strokeWidth={2} />
        <text x={W - padR - 84} y={padT + 11}>Call P&L</text>
        <line x1={W - padR - 104} x2={W - padR - 88} y1={padT + 22} y2={padT + 22} stroke="var(--color-error)" strokeWidth={2} />
        <text x={W - padR - 84} y={padT + 25}>Put P&L</text>
      </g>
    </svg>
  );
}
