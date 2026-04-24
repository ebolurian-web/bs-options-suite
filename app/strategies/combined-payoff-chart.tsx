"use client";

import { useMemo, useRef, useState } from "react";
import { ChartFigure } from "@/components/chart-figure";
import type { StrategyLeg } from "@/lib/strategy";
import { combinedPnl, findBreakEvens } from "@/lib/strategy";

export type CombinedPayoffChartProps = {
  legs: StrategyLeg[];
  spot: number;
};

export function CombinedPayoffChart({ legs, spot }: CombinedPayoffChartProps) {
  const data = useMemo(() => {
    if (!legs.length) return null;
    const strikes = legs.filter((l) => l.type !== "stock").map((l) => l.strike);
    const minK = strikes.length ? Math.min(...strikes, spot) : spot;
    const maxK = strikes.length ? Math.max(...strikes, spot) : spot;
    const lo = Math.max(0.01, minK * 0.6);
    const hi = maxK * 1.6;
    const N = 120;
    const step = (hi - lo) / N;
    const prices: number[] = [];
    for (let i = 0; i <= N; i++) prices.push(lo + i * step);
    const pnls = combinedPnl(legs, prices);
    const bes = findBreakEvens(prices, pnls);
    return { prices, pnls, bes, lo, hi };
  }, [legs, spot]);

  if (!data || !legs.length) {
    return (
      <div
        role="status"
        className="flex min-h-[280px] flex-col items-center justify-center rounded-md border p-8 text-center"
        style={{
          background: "var(--color-surface-1)",
          borderColor: "var(--color-border)",
          color: "var(--color-fg-muted)",
        }}
      >
        <div className="text-3xl opacity-30" aria-hidden="true">
          ▱
        </div>
        <p className="mt-2 text-sm">Pick a preset or add a leg to see the payoff diagram.</p>
      </div>
    );
  }

  const { prices, pnls, bes } = data;
  const maxP = Math.max(...pnls);
  const minP = Math.min(...pnls);
  const beText = bes.length
    ? bes.map((b) => `$${b.toFixed(2)}`).join(", ")
    : "none in range";
  const description =
    `Combined profit-and-loss at expiry across all ${legs.length} leg${legs.length === 1 ? "" : "s"}. ` +
    `Max profit $${maxP.toFixed(2)}, max loss $${minP.toFixed(2)}, break-even${bes.length === 1 ? "" : "s"} ${beText}. ` +
    `Hover the chart for point-by-point values.`;
  const ariaLabel =
    `Combined strategy payoff. Max profit $${maxP.toFixed(2)}, max loss $${minP.toFixed(2)}, break-evens ${beText}.`;

  return (
    <ChartFigure
      id="combined-payoff"
      title="Combined Payoff at Expiry"
      description={description}
      chartAriaHidden={false}
    >
      <PayoffSvg
        prices={prices}
        pnls={pnls}
        breakEvens={bes}
        spot={spot}
        ariaLabel={ariaLabel}
      />
    </ChartFigure>
  );
}

function PayoffSvg({
  prices,
  pnls,
  breakEvens,
  spot,
  ariaLabel,
}: {
  prices: number[];
  pnls: number[];
  breakEvens: number[];
  spot: number;
  ariaLabel: string;
}) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const W = 720;
  const H = 340;
  const padL = 56;
  const padR = 16;
  const padT = 16;
  const padB = 34;
  const xMin = prices[0];
  const xMax = prices[prices.length - 1];
  const yMin = Math.min(...pnls);
  const yMax = Math.max(...pnls);
  const padY = Math.max(Math.abs(yMax - yMin) * 0.12, 1);
  const y0 = yMin - padY;
  const y1 = yMax + padY;

  const q = (n: number) => Math.round(n * 100) / 100;
  const xScale = (p: number) => q(padL + ((p - xMin) / (xMax - xMin)) * (W - padL - padR));
  const yScale = (v: number) => q(padT + (1 - (v - y0) / (y1 - y0)) * (H - padT - padB));

  // Build split paths for profit (green) vs loss (red) zones with area fill
  const linePath = prices
    .map((p, i) => `${i === 0 ? "M" : "L"}${xScale(p).toFixed(1)},${yScale(pnls[i]).toFixed(1)}`)
    .join(" ");

  const profitArea = `${linePath} L${xScale(prices[prices.length - 1]).toFixed(1)},${yScale(0).toFixed(1)} L${xScale(prices[0]).toFixed(1)},${yScale(0).toFixed(1)} Z`;

  const xTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => xMin + f * (xMax - xMin));
  const yTicks = [y0, (y0 + y1) / 2, y1, 0].filter(
    (v, i, a) => a.findIndex((x) => Math.abs(x - v) < 1e-6) === i,
  );

  function handleMove(e: React.MouseEvent<SVGSVGElement>) {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    if (px < padL || px > W - padR) {
      setHoverIdx(null);
      return;
    }
    const frac = (px - padL) / (W - padL - padR);
    const pAtX = xMin + frac * (xMax - xMin);
    let best = 0;
    let bestDiff = Infinity;
    for (let i = 0; i < prices.length; i++) {
      const d = Math.abs(prices[i] - pAtX);
      if (d < bestDiff) {
        bestDiff = d;
        best = i;
      }
    }
    setHoverIdx(best);
  }

  const hover = hoverIdx != null
    ? { price: prices[hoverIdx], pnl: pnls[hoverIdx], x: xScale(prices[hoverIdx]) }
    : null;

  const zeroY = yScale(0);

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={ariaLabel}
        className="block w-full"
        style={{ maxHeight: 380 }}
        onMouseMove={handleMove}
        onMouseLeave={() => setHoverIdx(null)}
      >
        <defs>
          <clipPath id="clip-profit">
            <rect x={padL} y={padT} width={W - padL - padR} height={zeroY - padT} />
          </clipPath>
          <clipPath id="clip-loss">
            <rect x={padL} y={zeroY} width={W - padL - padR} height={H - padB - zeroY} />
          </clipPath>
        </defs>

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

        {/* Fill area above zero (profit = green) and below zero (loss = red) */}
        <path d={profitArea} fill="var(--color-success)" opacity={0.13} clipPath="url(#clip-profit)" />
        <path d={profitArea} fill="var(--color-error)" opacity={0.13} clipPath="url(#clip-loss)" />

        {/* Spot marker */}
        <line
          x1={xScale(spot)}
          x2={xScale(spot)}
          y1={padT}
          y2={H - padB}
          stroke="var(--color-fg-subtle)"
          strokeDasharray="4 3"
          strokeWidth={1}
          opacity={0.8}
        />
        <text x={xScale(spot) + 4} y={padT + 10} fontSize={10} fill="var(--color-fg-muted)">
          Spot ${spot.toFixed(2)}
        </text>

        {/* Break-evens */}
        {breakEvens.map((b, i) => (
          <g key={i}>
            <line
              x1={xScale(b)}
              x2={xScale(b)}
              y1={padT}
              y2={H - padB}
              stroke="var(--color-warn)"
              strokeDasharray="4 2"
              strokeWidth={1}
              opacity={0.7}
            />
            <circle cx={xScale(b)} cy={yScale(0)} r={4} fill="var(--color-warn)" />
          </g>
        ))}

        {/* Main P&L line */}
        <path d={linePath} fill="none" stroke="var(--color-accent)" strokeWidth={2.2} />

        {/* Hover */}
        {hover && (
          <g>
            <line
              x1={hover.x}
              x2={hover.x}
              y1={padT}
              y2={H - padB}
              stroke="var(--color-fg-default)"
              strokeWidth={1}
              opacity={0.35}
            />
            <circle
              cx={hover.x}
              cy={yScale(hover.pnl)}
              r={5}
              fill="var(--color-accent)"
              stroke="var(--color-bg-base)"
              strokeWidth={1.5}
            />
          </g>
        )}

        <g fontSize={10} fill="var(--color-fg-muted)">
          {xTicks.map((t, i) => (
            <text key={`xl-${i}`} x={xScale(t)} y={H - padB + 14} textAnchor="middle">
              ${t.toFixed(0)}
            </text>
          ))}
          {yTicks.map((t, i) => (
            <text key={`yl-${i}`} x={padL - 6} y={yScale(t) + 3} textAnchor="end">
              {Math.abs(t) > 1000 ? (t / 1000).toFixed(1) + "k" : t.toFixed(0)}
            </text>
          ))}
        </g>
      </svg>

      {hover && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute rounded-md border px-3 py-1.5 text-xs shadow-lg"
          style={{
            top: 8,
            left: `calc(${((hover.x / W) * 100).toFixed(2)}% + 12px)`,
            transform: hover.x > W * 0.75 ? "translateX(calc(-100% - 24px))" : undefined,
            background: "var(--color-surface-2)",
            borderColor: "var(--color-border)",
            color: "var(--color-fg-default)",
          }}
        >
          <div className="font-mono tabular-nums" style={{ color: "var(--color-fg-subtle)" }}>
            @ ${hover.price.toFixed(2)}
          </div>
          <div
            className="mt-0.5 font-mono text-sm font-semibold tabular-nums"
            style={{
              color: hover.pnl >= 0 ? "var(--color-success)" : "var(--color-error)",
            }}
          >
            {hover.pnl >= 0 ? "+" : ""}${hover.pnl.toFixed(2)}
          </div>
        </div>
      )}
    </div>
  );
}
