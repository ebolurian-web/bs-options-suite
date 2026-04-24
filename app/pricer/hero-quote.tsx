"use client";

/**
 * Hero quote strip — dense at-a-glance summary.
 *
 * Accessibility:
 * - <section aria-labelledby> with a visible <h2> ("Current quote"). The H1
 *   of the page stays stable ("Black-Scholes Pricer") so screen reader users
 *   don't lose page identity when the ticker changes.
 * - The numerical data is a <dl> with explicit <dt>/<dd> pairs so AT reads
 *   "Ticker, AAPL. Price, $272.60. Call, $4.20 …"
 */

export type HeroQuoteProps = {
  ticker: string | null;
  companyName: string | null;
  price: number | null;
  previousClose: number | null;
  callPrice: number | null;
  putPrice: number | null;
  strike: number | null;
  dte: number | null;
  moneyness: "ITM" | "ATM" | "OTM" | null;
};

export function HeroQuote(props: HeroQuoteProps) {
  const { ticker, companyName, price, previousClose, callPrice, putPrice, strike, dte, moneyness } = props;

  // Empty state — before a ticker is loaded
  if (!ticker || price == null) {
    return (
      <section
        aria-labelledby="h-hero"
        className="rounded-md border p-5"
        style={{
          background: "var(--color-surface-1)",
          borderColor: "var(--color-border)",
        }}
      >
        <h2 id="h-hero" className="sr-only">
          Current quote
        </h2>
        <p className="text-sm" style={{ color: "var(--color-fg-muted)" }}>
          Enter a ticker to load live market data, or expand{" "}
          <span className="font-semibold" style={{ color: "var(--color-fg-default)" }}>
            Manual overrides
          </span>{" "}
          below to price from scratch.
        </p>
      </section>
    );
  }

  const pctChange =
    previousClose != null && previousClose > 0
      ? ((price - previousClose) / previousClose) * 100
      : null;
  const changeTone = pctChange == null ? "muted" : pctChange >= 0 ? "up" : "down";
  const changeColor =
    changeTone === "up"
      ? "var(--color-success)"
      : changeTone === "down"
        ? "var(--color-error)"
        : "var(--color-fg-muted)";
  const changeArrow = changeTone === "up" ? "▲" : changeTone === "down" ? "▼" : "•";

  const moneynessColor =
    moneyness === "ITM"
      ? "var(--color-success)"
      : moneyness === "OTM"
        ? "var(--color-error)"
        : "var(--color-warn)";

  return (
    <section
      aria-labelledby="h-hero"
      className="rounded-md border"
      style={{
        background: "var(--color-surface-1)",
        borderColor: "var(--color-border)",
      }}
    >
      <h2 id="h-hero" className="sr-only">
        Current quote
      </h2>

      <dl className="grid grid-cols-1 gap-4 p-5 md:grid-cols-[1.3fr_1fr_1fr_1fr]">
        {/* Ticker + price */}
        <div>
          <dt
            className="text-[0.65rem] font-semibold uppercase tracking-[0.1em]"
            style={{ color: "var(--color-fg-muted)" }}
          >
            Ticker
          </dt>
          <dd
            className="mt-0.5 flex items-baseline gap-3"
            style={{ fontFamily: "var(--font-libre), serif" }}
          >
            <span className="text-2xl font-bold" style={{ color: "var(--color-fg-default)" }}>
              {ticker}
            </span>
            {companyName && (
              <span className="text-xs font-normal" style={{ color: "var(--color-fg-subtle)" }}>
                {companyName}
              </span>
            )}
          </dd>
          <dt
            className="mt-2 text-[0.65rem] font-semibold uppercase tracking-[0.1em]"
            style={{ color: "var(--color-fg-muted)" }}
          >
            Price
          </dt>
          <dd className="mt-0.5 flex items-baseline gap-2">
            <span
              className="text-3xl font-bold tabular-nums"
              style={{ color: "var(--color-fg-default)", fontFamily: "var(--font-libre), serif" }}
            >
              ${price.toFixed(2)}
            </span>
            {pctChange != null && (
              <span
                className="text-sm font-semibold tabular-nums"
                style={{ color: changeColor }}
                aria-label={`${changeTone === "up" ? "up" : "down"} ${Math.abs(pctChange).toFixed(2)} percent from previous close`}
              >
                <span aria-hidden="true">{changeArrow}</span> {Math.abs(pctChange).toFixed(2)}%
              </span>
            )}
          </dd>
        </div>

        {/* Call */}
        <div
          className="rounded border-l-[3px] pl-3"
          style={{ borderColor: "var(--color-accent)" }}
        >
          <dt
            className="text-[0.65rem] font-semibold uppercase tracking-[0.1em]"
            style={{ color: "var(--color-fg-muted)" }}
          >
            Call
          </dt>
          <dd
            className="mt-0.5 text-3xl font-bold tabular-nums"
            style={{ color: "var(--color-accent)", fontFamily: "var(--font-libre), serif" }}
          >
            {callPrice != null ? `$${callPrice.toFixed(2)}` : "—"}
          </dd>
        </div>

        {/* Put */}
        <div
          className="rounded border-l-[3px] pl-3"
          style={{ borderColor: "var(--color-error)" }}
        >
          <dt
            className="text-[0.65rem] font-semibold uppercase tracking-[0.1em]"
            style={{ color: "var(--color-fg-muted)" }}
          >
            Put
          </dt>
          <dd
            className="mt-0.5 text-3xl font-bold tabular-nums"
            style={{ color: "var(--color-error)", fontFamily: "var(--font-libre), serif" }}
          >
            {putPrice != null ? `$${putPrice.toFixed(2)}` : "—"}
          </dd>
        </div>

        {/* Contract context */}
        <div>
          <dt
            className="text-[0.65rem] font-semibold uppercase tracking-[0.1em]"
            style={{ color: "var(--color-fg-muted)" }}
          >
            Contract
          </dt>
          <dd className="mt-0.5 space-y-0.5 text-sm">
            {strike != null && (
              <div className="flex items-baseline gap-2">
                <span
                  className="text-[0.65rem] font-semibold uppercase"
                  style={{ color: "var(--color-fg-subtle)" }}
                >
                  Strike
                </span>
                <span className="tabular-nums" style={{ color: "var(--color-fg-default)" }}>
                  ${strike.toFixed(2)}
                </span>
              </div>
            )}
            {dte != null && (
              <div className="flex items-baseline gap-2">
                <span
                  className="text-[0.65rem] font-semibold uppercase"
                  style={{ color: "var(--color-fg-subtle)" }}
                >
                  Expiry
                </span>
                <span className="tabular-nums" style={{ color: "var(--color-fg-default)" }}>
                  {Math.round(dte)}d
                </span>
              </div>
            )}
            {moneyness && (
              <div className="flex items-baseline gap-2">
                <span
                  className="text-[0.65rem] font-semibold uppercase"
                  style={{ color: "var(--color-fg-subtle)" }}
                >
                  Moneyness
                </span>
                <span className="font-semibold" style={{ color: moneynessColor }}>
                  {moneyness}
                </span>
              </div>
            )}
          </dd>
        </div>
      </dl>
    </section>
  );
}
