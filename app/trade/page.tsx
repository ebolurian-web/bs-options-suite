import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { TradeView } from "./trade-view";

export const metadata: Metadata = {
  title: "Trade Ideas",
  description:
    "Say where you think a stock is headed and get option trades that fit — priced at live market quotes, with max loss, max gain, break-even, and odds of profit.",
  alternates: { canonical: "/trade" },
  openGraph: {
    title: "Trade Ideas — BS Options Suite",
    description: "Your view in, ranked option trades out. Live quotes, per-strike IV, scenario P&L.",
    url: "/trade",
  },
};

export default function TradePage() {
  return (
    <>
      <SiteHeader />
      <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-[1440px] px-4 py-6 md:px-6 md:py-8">
        <header className="mb-6">
          <p
            className="text-[0.7rem] font-semibold uppercase tracking-[0.14em]"
            style={{ color: "var(--color-accent)" }}
          >
            Trade ideas
          </p>
          <h1
            className="mt-1 text-2xl font-bold tracking-tight md:text-3xl"
            style={{ fontFamily: "var(--font-libre), serif" }}
          >
            What do you think it will do?
          </h1>
          <p className="mt-1 text-sm" style={{ color: "var(--color-fg-muted)" }}>
            Pick a direction, a target, and a date. We&apos;ll find trades that fit and show exactly what you can
            make, what you can lose, and your odds.
          </p>
        </header>
        <TradeView />
      </main>
    </>
  );
}
