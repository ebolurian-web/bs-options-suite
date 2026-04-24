import Link from "next/link";
import { ThemeToggle } from "./theme-toggle";

export function SiteHeader() {
  return (
    <header
      className="sticky top-0 z-40 border-b backdrop-blur-md"
      style={{
        background: "color-mix(in oklab, var(--color-bg-base) 85%, transparent)",
        borderColor: "var(--color-border)",
      }}
    >
      <div className="mx-auto flex max-w-[1400px] items-center justify-between px-6 py-3">
        <Link
          href="/"
          className="font-semibold tracking-tight"
          style={{ color: "var(--color-fg-default)", fontFamily: "var(--font-libre), serif" }}
        >
          BS Suite
        </Link>
        <nav aria-label="Primary" className="flex items-center gap-5 text-sm">
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
          <Link
            href="/surface"
            className="transition-colors hover:underline"
            style={{ color: "var(--color-fg-muted)" }}
          >
            Vol Surface
          </Link>
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}
