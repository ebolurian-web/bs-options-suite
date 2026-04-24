/**
 * Shared Plotly theme. Pulls colors from CSS custom properties on the
 * `<html data-theme="…">` root so charts match the app's current theme.
 *
 * Components should subscribe via a MutationObserver on `data-theme` and
 * call `Plotly.relayout(el, plotlyLayout(theme))` when it changes — we
 * don't do automatic binding here to keep the theme module dependency-free.
 */

import type { Layout, Data } from "plotly.js-dist-min";

export type Theme = "dark" | "light";

function readCss(name: string, fallback: string): string {
  if (typeof document === "undefined") return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

/** Current theme, read from the html dataset. Defaults to dark. */
export function currentTheme(): Theme {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

/** Subscribe to theme flips on the <html data-theme> attribute. */
export function observeTheme(cb: (t: Theme) => void): () => void {
  if (typeof document === "undefined") return () => {};
  const html = document.documentElement;
  const mo = new MutationObserver(() => cb(currentTheme()));
  mo.observe(html, { attributes: true, attributeFilter: ["data-theme"] });
  return () => mo.disconnect();
}

/** Canonical layout applied to every Plotly chart in the app. */
export function plotlyLayout(): Partial<Layout> {
  const bg = readCss("--color-surface-1", "#111111");
  const plotBg = readCss("--color-bg-base", "#0a0a0a");
  const fg = readCss("--color-fg-default", "#ededed");
  const muted = readCss("--color-fg-muted", "#a1a1a1");
  const grid = readCss("--color-border", "#2e2e2e");
  const subtle = readCss("--color-fg-subtle", "#737373");
  return {
    paper_bgcolor: bg,
    plot_bgcolor: plotBg,
    font: { color: muted, family: "Inter, system-ui, sans-serif", size: 11 },
    xaxis: {
      gridcolor: grid,
      zerolinecolor: grid,
      color: muted,
      tickfont: { color: muted },
      title: { font: { color: fg } },
    },
    yaxis: {
      gridcolor: grid,
      zerolinecolor: grid,
      color: muted,
      tickfont: { color: muted },
      title: { font: { color: fg } },
    },
    margin: { l: 60, r: 20, t: 20, b: 50 },
    legend: {
      bgcolor: bg,
      bordercolor: grid,
      borderwidth: 1,
      font: { color: fg },
    },
    colorway: [
      readCss("--chart-1", "#00d084"),
      readCss("--chart-2", "#f87171"),
      readCss("--chart-3", "#fbbf24"),
      readCss("--chart-4", "#60a5fa"),
      readCss("--chart-5", "#c4b5fd"),
      readCss("--chart-6", "#22d3ee"),
    ],
    hoverlabel: {
      bgcolor: readCss("--color-surface-2", "#1a1a1a"),
      bordercolor: grid,
      font: { color: fg, family: "Inter, system-ui, sans-serif" },
    },
  };
}

/** 3D scene theme for Plotly surface charts. */
export function plotly3DScene(): NonNullable<Layout["scene"]> {
  const bg = readCss("--color-bg-base", "#0a0a0a");
  const fg = readCss("--color-fg-default", "#ededed");
  const grid = readCss("--color-border-strong", "#3f3f3f");
  return {
    bgcolor: bg,
    xaxis: {
      color: fg,
      gridcolor: grid,
      zerolinecolor: grid,
      backgroundcolor: bg,
      showbackground: true,
    },
    yaxis: {
      color: fg,
      gridcolor: grid,
      zerolinecolor: grid,
      backgroundcolor: bg,
      showbackground: true,
    },
    zaxis: {
      color: fg,
      gridcolor: grid,
      zerolinecolor: grid,
      backgroundcolor: bg,
      showbackground: true,
    },
    camera: { eye: { x: 1.45, y: -1.45, z: 0.85 } },
  };
}

/** Merge a chart-specific layout override on top of the theme. */
export function mergeLayout(override: Partial<Layout>): Partial<Layout> {
  const base = plotlyLayout();
  return {
    ...base,
    ...override,
    xaxis: { ...base.xaxis, ...(override.xaxis ?? {}) },
    yaxis: { ...base.yaxis, ...(override.yaxis ?? {}) },
    legend: { ...base.legend, ...(override.legend ?? {}) },
    margin: { ...base.margin, ...(override.margin ?? {}) },
  };
}

export type { Data };
