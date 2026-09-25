import Link from "next/link";
import { NavLinks } from "./nav-links";
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
      <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-3 px-4 py-3 sm:gap-6 sm:px-6">
        <div className="flex items-center gap-6">
          <a
            href="https://bolurian.com"
            className="inline-flex items-center border-2 px-2 py-1 text-sm font-normal transition-colors sm:px-3 sm:py-1.5 sm:text-base"
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
        <nav aria-label="Primary" className="flex items-center gap-3 whitespace-nowrap text-[0.8rem] sm:gap-5 sm:text-sm">
          <Link
            href="/"
            className="hidden transition-colors hover:underline sm:inline"
            style={{ color: "var(--color-fg-muted)" }}
          >
            Home
          </Link>
          <NavLinks />
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}
