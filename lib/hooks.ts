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

export type Theme = "system" | "light" | "dark";

/** Read/write theme with localStorage + system listener. */
export function useTheme(): [Theme, (t: Theme) => void] {
  const [theme, setThemeState] = useState<Theme>("system");

  useEffect(() => {
    const stored = (localStorage.getItem("theme") as Theme | null) ?? "system";
    setThemeState(stored);
  }, []);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const applyResolved = () => {
      const resolved = theme === "system" ? (mq.matches ? "dark" : "light") : theme;
      document.documentElement.dataset.theme = resolved;
    };
    applyResolved();
    if (theme === "system") {
      mq.addEventListener("change", applyResolved);
      return () => mq.removeEventListener("change", applyResolved);
    }
  }, [theme]);

  const setTheme = (t: Theme) => {
    localStorage.setItem("theme", t);
    setThemeState(t);
  };

  return [theme, setTheme];
}
