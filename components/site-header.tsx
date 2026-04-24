import Link from "next/link";
import { ThemeToggle } from "./theme-toggle";

/**
 * Site header with the Bolurian monogram (external link back to the portfolio),
 * section navigation, and the theme toggle.
 */
export function SiteHeader() {
  return (
    <header
      className="sticky top-0 z-40 border-b backdrop-blur-md"
      style={{
        background: "color-mix(in oklab, var(--color-bg-base) 85%, transparent)",
        borderColor: "var(--color-border)",
      }}
    >
      <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-6 px-6 py-3">
        <div className="flex items-center gap-6">
          <a
            href="https://bolurian.com"
            className="inline-flex items-center border-2 px-3 py-1.5 text-base font-normal transition-colors"
            style={{
              fontFamily: "var(--font-libre), serif",
              borderColor: "var(--color-fg-default)",
              color: "var(--color-fg-default)",
            }}
          >
            Bolurian.com
          </a>
          <span
            className="hidden text-xs tracking-[0.12em] uppercase md:inline"
            style={{ color: "var(--color-fg-subtle)" }}
          >
            / BS Suite
          </span>
        </div>
        <nav aria-label="Primary" className="flex items-center gap-5 text-sm">
          <Link
            href="/"
            className="transition-colors hover:underline"
            style={{ color: "var(--color-fg-muted)" }}
          >
            Home
          </Link>
          <Link
            href="/pricer"
            className="transition-colors hover:underline"
            style={{ color: "var(--color-fg-muted)" }}
          >
            Pricer
          </Link>
          <Link
            href="/strategies"
            className="transition-colors hover:underline"
            style={{ color: "var(--color-fg-muted)" }}
          >
            Strategies
          </Link>
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}
