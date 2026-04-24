import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { StrategiesView } from "./strategies-view";

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
        className="mx-auto w-full max-w-[1400px] px-6 py-8"
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
            Multi-Leg Strategy Builder
          </h1>
          <p className="mt-1 text-sm" style={{ color: "var(--color-fg-muted)" }}>
            Build a position, see the combined payoff at expiry, and watch how net Greeks move as you edit.
          </p>
        </header>
        <StrategiesView />
      </main>
    </>
  );
}
