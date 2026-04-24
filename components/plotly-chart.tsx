"use client";

import { useEffect, useRef } from "react";
import type { Data, Layout, Config } from "plotly.js-dist-min";

/**
 * Thin React wrapper around plotly.js-dist-min.
 *
 * Lazy-loads Plotly on mount (it's a 3.7MB chunk) so the Pricer page itself
 * stays fast — the cost is paid only by users who actually open a chart.
 * Uses Plotly.react for efficient incremental updates.
 */
export type PlotlyChartProps = {
  data: Partial<Data>[];
  layout?: Partial<Layout>;
  config?: Partial<Config>;
  className?: string;
  style?: React.CSSProperties;
};

export function PlotlyChart({ data, layout, config, className, style }: PlotlyChartProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const plotlyRef = useRef<typeof import("plotly.js-dist-min").default | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const mod = await import("plotly.js-dist-min");
      const Plotly = mod.default;
      plotlyRef.current = Plotly;
      if (cancelled || !ref.current) return;
      await Plotly.react(ref.current, data, layout ?? {}, {
        responsive: true,
        displayModeBar: true,
        displaylogo: false,
        modeBarButtonsToRemove: ["lasso2d", "select2d"],
        scrollZoom: false,
        ...(config ?? {}),
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [data, layout, config]);

  useEffect(() => {
    const el = ref.current;
    const Plotly = plotlyRef.current;
    return () => {
      if (el && Plotly) Plotly.purge(el);
    };
  }, []);

  return <div ref={ref} className={className} style={style} />;
}
