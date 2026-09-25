"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { fmtSigned } from "@/lib/format";
import { scenarioPnl, type PositionLeg } from "@/lib/position";

/**
 * Profit & loss chart for one trade: the expiry payoff (dashed) and a
 * mark-to-model curve at the scenario date (solid), with the 1σ expected
 * move shaded, spot and target marked, and the scenario point highlighted.
 *
 * Inline SVG (not Plotly) so it re-renders instantly as the scenario sliders
 * move. Carries its own role="img" label plus a data-table alternative.
 */
export function PnlChart({
  legs,
  name,
  spot,
  target,
  expectedMove,
  breakEvens,
  tRemaining,
  ivShift,
  r,
  scenarioPrice,
  scenarioLabel,
  domain,
}: {
  legs: PositionLeg[];
  name: string;
  spot: number;
  /** The user's target price, if any. */
  target?: number | null;
  expectedMove: number;
  breakEvens: number[];
  /** Years left to expiry on the scenario date. */
  tRemaining: number;
  /** IV shift in decimal points (0.04 = +4 vol points). */
  ivShift: number;
  r: number;
  scenarioPrice: number;
  scenarioLabel: string;
  domain: { lo: number; hi: number };
}) {
  const clipId = useId().replace(/:/g, "");
  // Size the SVG to its container so text stays at its real pixel size on phones.
  const boxRef = useRef<HTMLDivElement>(null);
  const [boxW, setBoxW] = useState(760);
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setBoxW(Math.round(entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const W = Math.max(300, boxW);
  const H = W < 560 ? 260 : 340;
  const pad = { l: W < 560 ? 54 : 70, r: 12, t: 14, b: 30 };
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;

  const data = useMemo(() => {
    const N = 160;
    const xs: number[] = [];
    for (let i = 0; i <= N; i++) xs.push(domain.lo + ((domain.hi - domain.lo) * i) / N);
    const exp = xs.map((x) => scenarioPnl(legs, x, 0, ivShift, r));
    const now = xs.map((x) => scenarioPnl(legs, x, tRemaining, ivShift, r));
    let yMin = Math.min(0, ...exp, ...now);
    let yMax = Math.max(0, ...exp, ...now);
    const span = Math.max(1, yMax - yMin);
    yMin -= span * 0.08;
    yMax += span * 0.08;
    return { xs, exp, now, yMin, yMax };
  }, [legs, tRemaining, ivShift, r, domain.lo, domain.hi]);

  const sx = (x: number) => pad.l + ((x - domain.lo) / (domain.hi - domain.lo)) * iw;
  const sy = (y: number) => pad.t + ((data.yMax - y) / (data.yMax - data.yMin)) * ih;
  const y0 = sy(0);

  const line = (ys: number[]) =>
    ys.map((y, i) => `${i ? "L" : "M"}${sx(data.xs[i]).toFixed(1)},${sy(y).toFixed(1)}`).join(" ");
  const expPath = line(data.exp);
  const nowPath = line(data.now);
  const expArea = `${expPath} L${sx(domain.hi).toFixed(1)},${y0.toFixed(1)} L${sx(domain.lo).toFixed(1)},${y0.toFixed(1)} Z`;

  const scenarioY = scenarioPnl(legs, scenarioPrice, tRemaining, ivShift, r);
  const xTicks = niceTicks(domain.lo, domain.hi, W < 560 ? 4 : 7);
  const yTicks = niceTicks(data.yMin, data.yMax, 5);

  const emLo = Math.max(domain.lo, spot - expectedMove);
  const emHi = Math.min(domain.hi, spot + expectedMove);
  const inDomain = (x: number) => x >= domain.lo && x <= domain.hi;

  const beText = breakEvens.length
    ? `break-even ${breakEvens.map((b) => `$${b.toFixed(2)}`).join(" and ")}`
    : "no break-even in range";
  const ariaLabel =
    `${name} profit and loss. At expiry: ${beText}. ` +
    `On ${scenarioLabel} at $${scenarioPrice.toFixed(2)} the position is ${fmtSigned(scenarioY)}.`;

  // Data table: ~9 evenly spaced prices plus spot and target.
  const tablePrices = useMemo(() => {
    const pts = new Set<number>();
    for (let i = 0; i <= 8; i++) pts.add(+(domain.lo + ((domain.hi - domain.lo) * i) / 8).toFixed(2));
    pts.add(+spot.toFixed(2));
    if (target != null) pts.add(+target.toFixed(2));
    return Array.from(pts).sort((a, b) => a - b);
  }, [domain.lo, domain.hi, spot, target]);

  return (
    <div ref={boxRef}>
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="block h-auto max-w-full" role="img" aria-label={ariaLabel}>
        <defs>
          <clipPath id={`${clipId}-above`}>
            <rect x={0} y={0} width={W} height={Math.max(0, y0)} />
          </clipPath>
          <clipPath id={`${clipId}-below`}>
            <rect x={0} y={y0} width={W} height={Math.max(0, H - y0)} />
          </clipPath>
        </defs>

        {/* 1σ expected move band */}
        {emHi > emLo && (
          <rect
            x={sx(emLo)}
            y={pad.t}
            width={sx(emHi) - sx(emLo)}
            height={ih}
            style={{ fill: "var(--color-fg-default)", fillOpacity: 0.05 }}
          />
        )}

        {/* grid */}
        {yTicks.map((t) => (
          <g key={`y${t}`}>
            <line x1={pad.l} x2={W - pad.r} y1={sy(t)} y2={sy(t)} style={{ stroke: "var(--color-border)" }} />
            <text
              x={pad.l - 8}
              y={sy(t) + 4}
              textAnchor="end"
              className="font-mono"
              style={{ fill: "var(--color-fg-subtle)", fontSize: 11 }}
            >
              {fmtSignedShort(t)}
            </text>
          </g>
        ))}
        {xTicks.map((t) => (
          <text
            key={`x${t}`}
            x={sx(t)}
            y={H - 8}
            textAnchor="middle"
            className="font-mono"
            style={{ fill: "var(--color-fg-subtle)", fontSize: 11 }}
          >
            {fmtTick(t)}
          </text>
        ))}

        {/* profit / loss fills under the expiry payoff */}
        <path d={expArea} clipPath={`url(#${clipId}-above)`} style={{ fill: "var(--color-accent)", fillOpacity: 0.13 }} />
        <path d={expArea} clipPath={`url(#${clipId}-below)`} style={{ fill: "var(--color-error)", fillOpacity: 0.13 }} />

        <line x1={pad.l} x2={W - pad.r} y1={y0} y2={y0} style={{ stroke: "var(--color-border-strong)", strokeWidth: 1.5 }} />

        {/* curves */}
        <path d={expPath} fill="none" style={{ stroke: "var(--chart-4)", strokeWidth: 2, strokeDasharray: "6 5" }} />
        <path d={nowPath} fill="none" style={{ stroke: "var(--color-accent)", strokeWidth: 2.5 }} />

        {/* spot */}
        {inDomain(spot) && (
          <g>
            <line
              x1={sx(spot)}
              x2={sx(spot)}
              y1={pad.t}
              y2={pad.t + ih}
              style={{ stroke: "var(--color-fg-muted)", strokeDasharray: "2 4" }}
            />
            <text x={sx(spot) + 4} y={pad.t + ih - 6} style={{ fill: "var(--color-fg-muted)", fontSize: 11, fontWeight: 600 }}>
              Today ${spot.toFixed(2)}
            </text>
          </g>
        )}

        {/* target */}
        {target != null && inDomain(target) && Math.abs(target - spot) > 1e-9 && (
          <g>
            <line x1={sx(target)} x2={sx(target)} y1={pad.t} y2={pad.t + ih} style={{ stroke: "var(--color-warn)", strokeWidth: 1.5 }} />
            <text
              x={sx(target) + (target > spot ? 4 : -4)}
              y={pad.t + 12}
              textAnchor={target > spot ? "start" : "end"}
              style={{ fill: "var(--color-warn)", fontSize: 11, fontWeight: 600 }}
            >
              Your target ${fmtTick(target)}
            </text>
          </g>
        )}

        {/* break-evens */}
        {breakEvens.filter(inDomain).map((b, i, all) => {
          // With two break-evens, label the lower one to its left so they never collide.
          const left = all.length > 1 && i === 0;
          return (
            <g key={`be${b}`}>
              <circle cx={sx(b)} cy={y0} r={3.5} style={{ fill: "var(--color-fg-default)" }} />
              <text
                x={sx(b) + (left ? -6 : 6)}
                y={y0 + 15}
                textAnchor={left ? "end" : "start"}
                style={{ fill: "var(--color-fg-default)", fontSize: 11, fontWeight: 600 }}
              >
                B/E ${b.toFixed(2)}
              </text>
            </g>
          );
        })}

        {/* scenario point */}
        {inDomain(scenarioPrice) && (
          <g>
            <circle
              cx={sx(scenarioPrice)}
              cy={sy(scenarioY)}
              r={5.5}
              style={{ fill: "var(--color-accent)", stroke: "var(--color-bg-base)", strokeWidth: 2 }}
            />
            <text
              x={sx(scenarioPrice) + (scenarioPrice > (domain.lo + domain.hi) / 2 ? -10 : 10)}
              y={sy(scenarioY) - 10}
              textAnchor={scenarioPrice > (domain.lo + domain.hi) / 2 ? "end" : "start"}
              className="font-mono"
              style={{ fill: scenarioY >= 0 ? "var(--color-accent)" : "var(--color-error)", fontSize: 12, fontWeight: 700 }}
            >
              {fmtSigned(scenarioY)}
            </text>
          </g>
        )}
      </svg>

      <details className="mt-2 text-xs" style={{ color: "var(--color-fg-muted)" }}>
        <summary className="cursor-pointer select-none py-1">Show P&amp;L as a table</summary>
        <table className="mt-2 w-full font-mono tabular-nums">
          <caption className="sr-only">{name} profit and loss by stock price</caption>
          <thead>
            <tr style={{ color: "var(--color-fg-subtle)" }}>
              <th scope="col" className="py-1 text-left font-semibold">Stock price</th>
              <th scope="col" className="py-1 text-right font-semibold">On {scenarioLabel}</th>
              <th scope="col" className="py-1 text-right font-semibold">At expiry</th>
            </tr>
          </thead>
          <tbody>
            {tablePrices.map((p) => (
              <tr key={p} className="border-t" style={{ borderColor: "var(--color-border)" }}>
                <th scope="row" className="py-1 text-left font-normal">${p.toFixed(2)}</th>
                <td className="py-1 text-right">{fmtSigned(scenarioPnl(legs, p, tRemaining, ivShift, r))}</td>
                <td className="py-1 text-right">{fmtSigned(scenarioPnl(legs, p, 0, ivShift, r))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}

function niceTicks(lo: number, hi: number, target: number): number[] {
  const span = hi - lo;
  if (!(span > 0)) return [lo];
  const raw = span / target;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(+v.toFixed(6));
  return out;
}

const MINUS = "−";

function fmtSignedShort(n: number): string {
  const abs = Math.abs(n);
  const body = abs >= 10_000 ? `${(abs / 1000).toFixed(0)}k` : abs.toLocaleString("en-US", { maximumFractionDigits: 0 });
  return n > 0 ? `+$${body}` : n < 0 ? `${MINUS}$${body}` : "$0";
}

function fmtTick(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(n < 10 ? 2 : 1);
}
