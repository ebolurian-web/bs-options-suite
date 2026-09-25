import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { BuilderView } from "./builder-view";

export const metadata: Metadata = {
  title: "Strategy Builder",
  description:
    "Build multi-leg options strategies. Combined payoff at expiry, probability of profit, net position Greeks, shareable links.",
  alternates: { canonical: "/strategies" },
  openGraph: {
    title: "Strategy Builder — BS Options Suite",
    description:
      "Multi-leg options strategies with live market data, combined payoff, and net position Greeks.",
    url: "/strategies",
  },
};

export default function StrategiesPage() {
  return (
    <>
      <SiteHeader />
      <main
        id="main-content"
        tabIndex={-1}
        className="mx-auto w-full max-w-[1440px] px-4 py-6 md:px-6 md:py-8"
      >
        <header className="mb-6">
          <p
            className="text-[0.7rem] font-semibold uppercase tracking-[0.14em]"
            style={{ color: "var(--color-accent)" }}
          >
            Strategy Builder
          </p>
          <h1
            className="mt-1 text-2xl font-bold tracking-tight md:text-3xl"
            style={{ fontFamily: "var(--font-libre), serif" }}
          >
            Build any options position
          </h1>
          <p className="mt-1 text-sm" style={{ color: "var(--color-fg-muted)" }}>
            Combine calls, puts, and shares at live prices. See what the position can make or lose, on any date, and what it is really betting on.
          </p>
        </header>
        <BuilderView />
      </main>
    </>
  );
}
