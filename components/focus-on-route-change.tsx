"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * On every client-side route change, move focus to #main-content so screen
 * readers announce the new page's H1 instead of leaving focus on the nav link
 * that was just activated. Skips the very first render.
 */
export function FocusOnRouteChange() {
  const pathname = usePathname();
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const el = document.getElementById("main-content");
    el?.focus({ preventScroll: true });
  }, [pathname]);
  return null;
}
