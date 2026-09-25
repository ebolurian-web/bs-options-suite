import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { ExplorerView } from "./explorer-view";

export const metadata: Metadata = {
  title: "Option Explorer",
  description:
    "Browse a live option chain, pick any call or put, and see its break-even, odds, Greeks in dollars, scenario P&L, and the volatility surface.",
  alternates: { canonical: "/pricer" },
  openGraph: {
    title: "Option Explorer — BS Options Suite",
    description:
      "Live option chain, per-contract analysis, scenario P&L, and a 3D volatility surface.",
    url: "/pricer",
  },
};

export default function PricerPage() {
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
            Option explorer
          </p>
          <h1
            className="mt-1 text-2xl font-bold tracking-tight md:text-3xl"
            style={{ fontFamily: "var(--font-libre), serif" }}
          >
            Look inside any option
          </h1>
          <p className="mt-1 text-sm" style={{ color: "var(--color-fg-muted)" }}>
            Pick a contract from the live chain to see what it costs, where it breaks even, your odds, and whether the price is fair.
          </p>
        </header>
        <ExplorerView />
      </main>
    </>
  );
}
