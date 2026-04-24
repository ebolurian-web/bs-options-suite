"use client";

import { useEffect, useState } from "react";

/**
 * Subscribes to `prefers-reduced-motion`. Default true on the server so SSR
 * output is the reduced-motion-safe version — we fade in animations only
 * after hydration confirms the user hasn't requested reduction.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(true);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return reduced;
}

export type Theme = "light" | "dark";

/** Read/write theme with localStorage. Default dark. No system mode. */
export function useTheme(): [Theme, (t: Theme) => void] {
  const [theme, setThemeState] = useState<Theme>("dark");

  useEffect(() => {
    const stored = localStorage.getItem("theme");
    const resolved: Theme = stored === "light" ? "light" : "dark";
    setThemeState(resolved);
    document.documentElement.dataset.theme = resolved;
  }, []);

  const setTheme = (t: Theme) => {
    localStorage.setItem("theme", t);
    document.documentElement.dataset.theme = t;
    setThemeState(t);
  };

  return [theme, setTheme];
}
