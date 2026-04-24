import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { PricerView } from "./pricer-view";

export const metadata: Metadata = {
  title: "Pricer — BS Options Suite",
  description:
    "Black-Scholes pricing with full Greeks, IV solver, and payoff diagram.",
};

export default function PricerPage() {
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
            Pricer
          </p>
          <h1
            className="mt-1 text-2xl font-bold tracking-tight md:text-3xl"
            style={{ fontFamily: "var(--font-libre), serif" }}
          >
            Black-Scholes Pricer
          </h1>
          <p className="mt-1 text-sm" style={{ color: "var(--color-fg-muted)" }}>
            Price calls and puts, explore Greeks, and solve for implied volatility.
            Live market data coming in Phase 2 — enter parameters manually for now.
          </p>
        </header>
        <PricerView />
      </main>
    </>
  );
}
