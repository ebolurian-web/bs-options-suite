"use client";

/**
 * Number + slider paired input for parameters like S, K, T, σ, r, q.
 *
 * Accessibility:
 * - One visible <label> linked to the number input via htmlFor.
 * - The slider shares the same label via aria-labelledby.
 * - aria-valuetext on the slider announces units (e.g., "25 %").
 * - A hidden hint describes range/step for AT context.
 * - No extra live region — the native range element's aria-valuetext updates
 *   are announced by screen readers on commit, avoiding double-announcement.
 */
export type ParamInputProps = {
  id: string;
  label: string;
  /** Display unit (rendered visually, and into aria-valuetext). */
  unit?: string;
  value: number;
  onChange: (next: number) => void;
  min: number;
  max: number;
  step?: number;
  /** Fallback text when the user hovers/focuses the label. */
  helpText?: string;
  /** Set true to hide the slider (some params are text-only by nature). */
  hideSlider?: boolean;
};

export function ParamInput({
  id,
  label,
  unit,
  value,
  onChange,
  min,
  max,
  step = 0.01,
  helpText,
  hideSlider,
}: ParamInputProps) {
  const labelId = `${id}-label`;
  const hintId = `${id}-hint`;
  const valueText = unit ? `${value} ${unit}` : String(value);

  return (
    <div className="grid gap-1">
      <label
        id={labelId}
        htmlFor={`${id}-num`}
        className="flex items-center justify-between text-xs font-medium tracking-wide uppercase"
        style={{ color: "var(--color-fg-muted)" }}
      >
        <span>{label}</span>
        {unit && (
          <span className="normal-case opacity-60" style={{ color: "var(--color-fg-subtle)" }}>
            {unit}
          </span>
        )}
      </label>
      <div className={`flex items-center gap-3 ${hideSlider ? "" : ""}`}>
        <input
          id={`${id}-num`}
          type="number"
          inputMode="decimal"
          value={Number.isFinite(value) ? value : ""}
          min={min}
          max={max}
          step={step}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (Number.isFinite(n)) onChange(n);
          }}
          aria-describedby={hintId}
          className="w-28 rounded border px-2 py-1.5 font-mono text-sm tabular-nums"
          style={{
            background: "var(--color-surface-2)",
            borderColor: "var(--color-border)",
            color: "var(--color-fg-default)",
          }}
        />
        {!hideSlider && (
          <input
            id={`${id}-slide`}
            type="range"
            value={value}
            min={min}
            max={max}
            step={step}
            aria-labelledby={labelId}
            aria-valuetext={valueText}
            onChange={(e) => onChange(Number(e.target.value))}
            className="flex-1 accent-[color:var(--color-accent)]"
          />
        )}
      </div>
      <span id={hintId} className="sr-only">
        Range {min} to {max}, step {step}.
        {helpText ? ` ${helpText}` : ""}
      </span>
    </div>
  );
}
