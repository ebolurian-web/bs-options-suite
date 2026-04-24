"use client";

import { useEffect } from "react";
import { useReducedMotion } from "@/lib/hooks";

/**
 * Play/pause button for animations.
 *
 * - Native <button>, so Space/Enter trigger click by default (no custom handler).
 * - aria-pressed reflects play state.
 * - Escape key resets the animation while the button is focused.
 * - Respects prefers-reduced-motion: disables the control and calls onReset
 *   to force the end state once.
 */
export type AnimationToggleButtonProps = {
  playing: boolean;
  onToggle: (next: boolean) => void;
  onReset: () => void;
  labelPlay?: string;
  labelPause?: string;
  className?: string;
};

export function AnimationToggleButton({
  playing,
  onToggle,
  onReset,
  labelPlay = "Play animation",
  labelPause = "Pause animation",
  className = "",
}: AnimationToggleButtonProps) {
  const reduced = useReducedMotion();

  // When user flips to reduced motion mid-playback, stop and snap to end.
  useEffect(() => {
    if (reduced && playing) {
      onToggle(false);
      onReset();
    }
    // Only fire on `reduced` changes — intentional dep list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced]);

  const label = reduced
    ? "Animation unavailable (reduced motion). Showing end state."
    : playing
      ? labelPause
      : labelPlay;

  return (
    <button
      type="button"
      aria-pressed={playing}
      aria-label={label}
      disabled={reduced}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          onReset();
          if (playing) onToggle(false);
        }
      }}
      onClick={() => onToggle(!playing)}
      className={`inline-flex items-center gap-2 rounded border px-3 py-1.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
      style={{
        background: playing ? "var(--color-surface-3)" : "var(--color-surface-2)",
        borderColor: "var(--color-border)",
        color: "var(--color-fg-default)",
      }}
    >
      <span aria-hidden="true">{playing ? "❚❚" : "▶"}</span>
      <span>{playing ? "Pause" : "Play"}</span>
    </button>
  );
}
