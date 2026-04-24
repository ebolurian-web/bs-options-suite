"use client";

import { useTheme, type Theme } from "@/lib/hooks";

const options: Theme[] = ["system", "light", "dark"];

export function ThemeToggle() {
  const [theme, setTheme] = useTheme();
  return (
    <fieldset
      className="flex items-center gap-0 rounded-md border p-0.5 text-xs"
      style={{ borderColor: "var(--color-border)", background: "var(--color-surface-1)" }}
    >
      <legend className="sr-only">Color theme</legend>
      {options.map((v) => {
        const selected = theme === v;
        return (
          <label
            key={v}
            className="cursor-pointer rounded px-2 py-1 capitalize transition-colors"
            style={{
              color: selected ? "var(--color-fg-default)" : "var(--color-fg-muted)",
              background: selected ? "var(--color-surface-3)" : "transparent",
            }}
          >
            <input
              type="radio"
              name="theme"
              value={v}
              checked={selected}
              onChange={() => setTheme(v)}
              className="sr-only"
            />
            <span>{v}</span>
          </label>
        );
      })}
    </fieldset>
  );
}
