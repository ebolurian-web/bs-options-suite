import Link from "next/link";
import { SiteHeader } from "@/components/site-header";

export default function LandingPage() {
  return (
    <>
      <SiteHeader />
      <main
        id="main-content"
        tabIndex={-1}
        className="mx-auto flex w-full max-w-[1100px] flex-1 flex-col items-center justify-center px-6 py-20 text-center"
      >
        <p
          className="mb-4 inline-flex items-center gap-2 text-[0.7rem] font-semibold uppercase tracking-[0.15em]"
          style={{ color: "var(--color-accent)" }}
        >
          <span
            className="inline-block h-1.5 w-1.5 rounded-full"
            style={{ background: "var(--color-accent)" }}
          />
          Options Analytics · v2
        </p>
        <h1
          className="text-4xl font-bold tracking-tight md:text-6xl"
          style={{ fontFamily: "var(--font-libre), serif" }}
        >
          Black-<em className="not-italic" style={{ color: "var(--color-accent)" }}>Scholes</em>{" "}
          Suite
        </h1>
        <p className="mt-5 max-w-xl text-sm md:text-base" style={{ color: "var(--color-fg-muted)" }}>
          Live market data, 3D volatility surface, full Greeks, and multi-leg strategy
          construction. Built with Next.js, TypeScript, and CBOE public quotes.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link
            href="/pricer"
            className="rounded-md px-5 py-2.5 text-sm font-semibold transition-all"
            style={{
              background: "var(--color-accent)",
              color: "#0a0a0a",
            }}
          >
            Open Pricer →
          </Link>
          <Link
            href="/strategies"
            className="rounded-md border px-5 py-2.5 text-sm font-semibold transition-colors"
            style={{
              borderColor: "var(--color-border)",
              color: "var(--color-fg-default)",
            }}
          >
            Strategy Builder
          </Link>
        </div>
      </main>
    </>
  );
}
