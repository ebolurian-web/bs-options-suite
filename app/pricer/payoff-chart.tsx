"use client";

import { useMemo, useRef, useState } from "react";
import { ChartFigure } from "@/components/chart-figure";

/**
 * SVG payoff diagram at expiry.
 *
 * A11y: the SVG itself carries role="img" + a descriptive aria-label that
 * names the call/put break-evens and the shape of each curve. The wrapping
 * ChartFigure's figcaption contains the full dynamic description. We skip
 * the data-table disclosure here because the SVG is semantic enough on its
 * own and the visible description covers every key data point.
 *
 * The hover crosshair + tooltip are a mouse-user-only enhancement.
 */
export type PayoffChartProps = {
  S: number;
  K: number;
  callPremium: number;
  putPremium: number;
};

export function PayoffChart({ S, K, callPremium, putPremium }: PayoffChartProps) {
  const { prices, callPnl, putPnl, yMin, yMax, description, ariaLabel } = useMemo(() => {
    const lo = Math.max(0.01, Math.min(S, K) * 0.6);
    const hi = Math.max(S, K) * 1.6;
    const N = 80;
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
    const description =
      `A long call profits when the stock rises above $${callBE.toFixed(2)} at expiry; maximum loss is $${callPremium.toFixed(2)}. ` +
      `A long put profits when the stock falls below $${putBE.toFixed(2)}; maximum loss is $${putPremium.toFixed(2)}. ` +
      `Hover the chart for point-by-point values.`;
    const ariaLabel =
      `Payoff diagram at expiry. Call break-even $${callBE.toFixed(2)}, call max loss $${callPremium.toFixed(2)}. ` +
      `Put break-even $${putBE.toFixed(2)}, put max loss $${putPremium.toFixed(2)}.`;
    return { prices, callPnl, putPnl, yMin, yMax, description, ariaLabel };
  }, [S, K, callPremium, putPremium]);

  return (
    <ChartFigure
      id="payoff"
      title="Payoff at Expiry"
      description={description}
      chartAriaHidden={false}
    >
      <PayoffSvg
        prices={prices}
        callPnl={callPnl}
        putPnl={putPnl}
        yMin={yMin}
        yMax={yMax}
        spot={S}
        strike={K}
        ariaLabel={ariaLabel}
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
  ariaLabel,
}: {
  prices: number[];
  callPnl: number[];
  putPnl: number[];
  yMin: number;
  yMax: number;
  spot: number;
  strike: number;
  ariaLabel: string;
}) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const W = 640;
  const H = 320;
  const padL = 48;
  const padR = 16;
  const padT = 16;
  const padB = 32;
  const xMin = prices[0];
  const xMax = prices[prices.length - 1];
  const padY = (yMax - yMin) * 0.1 || 1;
  const y0 = yMin - padY;
  const y1 = yMax + padY;

  // Quantize to 2dp so server and client emit identical strings.
  const q = (n: number) => Math.round(n * 100) / 100;
  const xScale = (p: number) => q(padL + ((p - xMin) / (xMax - xMin)) * (W - padL - padR));
  const yScale = (v: number) => q(padT + (1 - (v - y0) / (y1 - y0)) * (H - padT - padB));

  const linePath = (ys: number[]) =>
    prices
      .map((p, i) => `${i === 0 ? "M" : "L"}${xScale(p).toFixed(1)},${yScale(ys[i]).toFixed(1)}`)
      .join(" ");

  const xTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => xMin + f * (xMax - xMin));
  const yTicks = [y0, (y0 + y1) / 2, y1, 0];

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
    const priceAtX = xMin + frac * (xMax - xMin);
    // Find nearest index
    let best = 0;
    let bestDiff = Infinity;
    for (let i = 0; i < prices.length; i++) {
      const d = Math.abs(prices[i] - priceAtX);
      if (d < bestDiff) {
        bestDiff = d;
        best = i;
      }
    }
    setHoverIdx(best);
  }

  const hover = hoverIdx != null ? {
    price: prices[hoverIdx],
    call: callPnl[hoverIdx],
    put: putPnl[hoverIdx],
    x: xScale(prices[hoverIdx]),
  } : null;

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={ariaLabel}
        className="block w-full"
        style={{ maxHeight: 360 }}
        onMouseMove={handleMove}
        onMouseLeave={() => setHoverIdx(null)}
      >
        {/* Grid */}
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

        {/* Strike marker */}
        <line
          x1={xScale(strike)} x2={xScale(strike)}
          y1={padT} y2={H - padB}
          stroke="var(--color-warn)" strokeDasharray="4 3" strokeWidth={1} opacity={0.7}
        />
        <text x={xScale(strike) + 4} y={padT + 10} fontSize={10} fill="var(--color-warn)">K</text>

        {/* Spot marker */}
        <line
          x1={xScale(spot)} x2={xScale(spot)}
          y1={padT} y2={H - padB}
          stroke="var(--color-fg-subtle)" strokeDasharray="4 3" strokeWidth={1} opacity={0.7}
        />
        <text x={xScale(spot) + 4} y={padT + 22} fontSize={10} fill="var(--color-fg-muted)">S</text>

        {/* Call curve (solid green) */}
        <path d={linePath(callPnl)} fill="none" stroke="var(--color-success)" strokeWidth={2} />
        {/* Put curve (dashed red for non-hue differentiation) */}
        <path d={linePath(putPnl)} fill="none" stroke="var(--color-error)" strokeWidth={2} strokeDasharray="6 4" />

        {/* Hover crosshair + markers */}
        {hover && (
          <g>
            <line
              x1={hover.x} x2={hover.x}
              y1={padT} y2={H - padB}
              stroke="var(--color-fg-default)" strokeWidth={1} opacity={0.35}
            />
            <circle cx={hover.x} cy={yScale(hover.call)} r={4}
              fill="var(--color-success)" stroke="var(--color-bg-base)" strokeWidth={1.5} />
            <circle cx={hover.x} cy={yScale(hover.put)} r={4}
              fill="var(--color-error)" stroke="var(--color-bg-base)" strokeWidth={1.5} />
          </g>
        )}

        {/* Axis labels */}
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

        {/* Legend */}
        <g fontSize={11} fill="var(--color-fg-default)">
          <rect x={W - padR - 116} y={padT - 2} width={116} height={34}
            fill="var(--color-surface-2)" opacity={0.9} rx={4} />
          <line x1={W - padR - 108} x2={W - padR - 92}
            y1={padT + 9} y2={padT + 9}
            stroke="var(--color-success)" strokeWidth={2} />
          <text x={W - padR - 88} y={padT + 12}>Call P&amp;L</text>
          <line x1={W - padR - 108} x2={W - padR - 92}
            y1={padT + 24} y2={padT + 24}
            stroke="var(--color-error)" strokeWidth={2} strokeDasharray="4 3" />
          <text x={W - padR - 88} y={padT + 27}>Put P&amp;L</text>
        </g>
      </svg>

      {/* Hover tooltip — overlaid, positioned relative to the SVG's pct X */}
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
          <div className="mt-0.5 flex items-center gap-2 font-mono tabular-nums">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ background: "var(--color-success)" }}
            />
            Call {hover.call >= 0 ? "+" : ""}${hover.call.toFixed(2)}
          </div>
          <div className="mt-0.5 flex items-center gap-2 font-mono tabular-nums">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ background: "var(--color-error)" }}
            />
            Put {hover.put >= 0 ? "+" : ""}${hover.put.toFixed(2)}
          </div>
        </div>
      )}
    </div>
  );
}
