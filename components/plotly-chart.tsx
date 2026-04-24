"use client";

import { useEffect, useRef } from "react";
import type { Data, Layout, Config } from "plotly.js-dist-min";
import { observeTheme } from "@/lib/plotly-theme";

/**
 * Thin React wrapper around plotly.js-dist-min.
 *
 * - Lazy-loads Plotly on mount (~3.7 MB chunk).
 * - Plotly.react for incremental updates.
 * - Subscribes to `<html data-theme>` changes and calls Plotly.relayout
 *   so theme toggles re-skin existing charts instead of leaving them
 *   stranded in the previous palette.
 * - scrollZoom disabled to return wheel events to the page.
 */
export type PlotlyChartProps = {
  data: Partial<Data>[];
  layout?: Partial<Layout>;
  /** Called on every theme change to produce a fresh layout. If omitted,
   *  the existing layout is reused (theme tokens won't update). */
  relayoutForTheme?: () => Partial<Layout>;
  config?: Partial<Config>;
  className?: string;
  style?: React.CSSProperties;
};

export function PlotlyChart({
  data,
  layout,
  relayoutForTheme,
  config,
  className,
  style,
}: PlotlyChartProps) {
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

  // Theme change → relayout existing chart
  useEffect(() => {
    if (!relayoutForTheme) return;
    const unsubscribe = observeTheme(() => {
      const el = ref.current;
      const Plotly = plotlyRef.current;
      if (!el || !Plotly) return;
      Plotly.relayout(el, relayoutForTheme());
    });
    return unsubscribe;
  }, [relayoutForTheme]);

  useEffect(() => {
    const el = ref.current;
    const Plotly = plotlyRef.current;
    return () => {
      if (el && Plotly) Plotly.purge(el);
    };
  }, []);

  return <div ref={ref} className={className} style={style} />;
}
