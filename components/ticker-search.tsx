"use client";

import { useRef, useState } from "react";

/**
 * Labeled ticker input with submit button.
 * - <label htmlFor> linked to the input
 * - A polite live region announces fetch status (loading / error / success)
 * - Enter submits the form; native form submission is preserved
 */
export type TickerSearchProps = {
  onSubmit: (ticker: string) => void;
  busy: boolean;
  error: string | null;
  status: string;
  initial?: string;
};

export function TickerSearch({ onSubmit, busy, error, status, initial = "" }: TickerSearchProps) {
  const [value, setValue] = useState(initial);
  const statusId = "ticker-status";
  const errorId = "ticker-error";
  const inputRef = useRef<HTMLInputElement | null>(null);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const t = value.trim().toUpperCase();
        if (t) onSubmit(t);
      }}
      aria-labelledby="ticker-label"
      className="flex flex-col gap-2"
    >
      <label
        id="ticker-label"
        htmlFor="ticker-input"
        className="text-xs font-medium uppercase tracking-wide"
        style={{ color: "var(--color-fg-muted)" }}
      >
        Ticker
      </label>
      <div className="flex gap-2">
        <input
          id="ticker-input"
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value.toUpperCase())}
          placeholder="AAPL"
          maxLength={10}
          autoComplete="off"
          spellCheck={false}
          aria-describedby={`${statusId}${error ? ` ${errorId}` : ""}`}
          aria-invalid={error ? "true" : "false"}
          className="flex-1 rounded border px-3 py-2 font-mono uppercase tracking-wider"
          style={{
            background: "var(--color-surface-2)",
            borderColor: error ? "var(--color-error)" : "var(--color-border)",
            color: "var(--color-fg-default)",
          }}
        />
        <button
          type="submit"
          disabled={busy || !value.trim()}
          className="rounded px-4 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60"
          style={{
            background: "var(--color-accent)",
            color: "#0a0a0a",
          }}
        >
          {busy ? "Loading…" : "Load"}
        </button>
      </div>
      <p
        id={statusId}
        aria-live="polite"
        aria-atomic="true"
        className="min-h-[1em] text-xs"
        style={{ color: "var(--color-fg-muted)" }}
      >
        {status}
      </p>
      {error && (
        <p
          id={errorId}
          role="alert"
          className="text-xs"
          style={{ color: "var(--color-error)" }}
        >
          {error}
        </p>
      )}
    </form>
  );
}
