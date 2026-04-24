import Link from "next/link";
import { SiteHeader } from "@/components/site-header";

export default function LandingPage() {
  return (
    <>
      <SiteHeader />
      <main
        id="main-content"
        tabIndex={-1}
        className="mx-auto flex w-full max-w-[1200px] flex-1 flex-col items-center justify-center px-6 py-16"
      >
        <section className="grid items-center gap-12 md:grid-cols-[1.15fr_1fr]">
          <div>
            <p
              className="mb-5 inline-flex items-center gap-2 text-[0.72rem] font-semibold uppercase tracking-[0.18em]"
              style={{ color: "var(--color-accent)" }}
            >
              <span
                className="inline-block h-1.5 w-1.5 rounded-full"
                style={{
                  background: "var(--color-accent)",
                  boxShadow: "0 0 12px var(--color-accent)",
                }}
              />
              Options Analytics · v2
            </p>
            <h1
              className="text-5xl font-bold leading-[1.02] tracking-tight md:text-6xl"
              style={{ fontFamily: "var(--font-libre), serif" }}
            >
              Black-
              <em className="not-italic" style={{ color: "var(--color-accent)" }}>
                Scholes
              </em>
              <br />
              <span style={{ color: "var(--color-fg-muted)" }}>Suite.</span>
            </h1>
            <p
              className="mt-6 max-w-xl text-base leading-relaxed"
              style={{ color: "var(--color-fg-muted)" }}
            >
              Live market data, a 3-D volatility surface, full Greeks, and multi-leg strategy
              construction. Server-rendered, typed end-to-end, built for the browser.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/pricer"
                className="press-scale rounded-md px-5 py-2.5 text-sm font-semibold glow-accent transition-all"
                style={{
                  background: "var(--color-accent)",
                  color: "#0a0a0a",
                }}
              >
                Open Pricer →
              </Link>
              <Link
                href="/strategies"
                className="press-scale surface-1 tile-hover rounded-md px-5 py-2.5 text-sm font-semibold transition-colors"
                style={{ color: "var(--color-fg-default)" }}
              >
                Strategy Builder
              </Link>
            </div>

            <ul className="mt-12 grid gap-2 text-sm md:grid-cols-2">
              {[
                ["Live chains", "CBOE delayed quotes — no auth, full chain in one call."],
                ["3-D vol surface", "Moneyness × time × IV, with smile and 25Δ skew breakout."],
                ["Net Greeks", "Δ, Γ, Θ, ν aggregated across every leg."],
                ["Typed end-to-end", "Next.js 15, TypeScript, server-rendered routes."],
              ].map(([t, d]) => (
                <li key={t} className="flex gap-3">
                  <span
                    aria-hidden="true"
                    className="mt-1.5 inline-block h-1 w-1 flex-shrink-0 rounded-full"
                    style={{ background: "var(--color-accent)" }}
                  />
                  <span>
                    <strong style={{ color: "var(--color-fg-default)" }}>{t}.</strong>{" "}
                    <span style={{ color: "var(--color-fg-muted)" }}>{d}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* Decorative live-data mock — purely visual, aria-hidden */}
          <MockQuoteCard />
        </section>
      </main>
    </>
  );
}

function MockQuoteCard() {
  return (
    <div aria-hidden="true" className="surface-1 p-5">
      <div className="flex items-center justify-between text-[0.65rem] font-semibold uppercase tracking-[0.12em]">
        <span style={{ color: "var(--color-fg-subtle)" }}>Sample Quote</span>
        <span className="flex items-center gap-1.5" style={{ color: "var(--color-accent)" }}>
          <span
            className="inline-block h-1.5 w-1.5 rounded-full"
            style={{
              background: "var(--color-accent)",
              boxShadow: "0 0 8px var(--color-accent)",
            }}
          />
          LIVE
        </span>
      </div>

      <div className="mt-3 flex items-baseline gap-3">
        <span
          className="text-3xl font-bold"
          style={{ fontFamily: "var(--font-libre), serif", color: "var(--color-fg-default)" }}
        >
          SPY
        </span>
        <span
          className="font-mono text-2xl font-semibold tabular-nums"
          style={{ color: "var(--color-fg-default)" }}
        >
          $486.24
        </span>
        <span
          className="font-mono text-xs font-semibold tabular-nums"
          style={{ color: "var(--color-accent)" }}
        >
          ▲ 0.48%
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <div
          className="glow-accent rounded border-l-[3px] px-3 py-2"
          style={{ borderColor: "var(--color-accent)", background: "var(--color-surface-2)" }}
        >
          <div className="text-[0.6rem] font-semibold uppercase tracking-wide" style={{ color: "var(--color-fg-muted)" }}>
            Call
          </div>
          <div
            className="mt-0.5 font-mono text-xl font-bold tabular-nums"
            style={{ color: "var(--color-accent)", fontFamily: "var(--font-libre), serif" }}
          >
            $4.20
          </div>
        </div>
        <div
          className="glow-error rounded border-l-[3px] px-3 py-2"
          style={{ borderColor: "var(--color-error)", background: "var(--color-surface-2)" }}
        >
          <div className="text-[0.6rem] font-semibold uppercase tracking-wide" style={{ color: "var(--color-fg-muted)" }}>
            Put
          </div>
          <div
            className="mt-0.5 font-mono text-xl font-bold tabular-nums"
            style={{ color: "var(--color-error)", fontFamily: "var(--font-libre), serif" }}
          >
            $3.85
          </div>
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-3 gap-2 text-[0.7rem]">
        {[
          ["Δ", "0.54", "var(--color-fg-default)"],
          ["Γ", "0.018", "var(--color-fg-default)"],
          ["Θ", "−0.08", "var(--color-error)"],
          ["ν", "0.42", "var(--color-fg-default)"],
          ["IV", "22.4%", "var(--color-warn)"],
          ["DTE", "7d", "var(--color-fg-muted)"],
        ].map(([k, v, c]) => (
          <div
            key={k as string}
            className="rounded px-2 py-1.5"
            style={{ background: "var(--color-surface-2)", borderColor: "var(--color-border)" }}
          >
            <dt className="font-mono" style={{ color: "var(--color-fg-subtle)" }}>
              {k}
            </dt>
            <dd className="font-mono font-semibold tabular-nums" style={{ color: c as string }}>
              {v}
            </dd>
          </div>
        ))}
      </dl>

      {/* Faux spark / IV curve */}
      <svg viewBox="0 0 200 36" className="mt-4 w-full" preserveAspectRatio="none">
        <path
          d="M0,26 C30,22 50,18 80,14 S130,6 160,10 S200,20 200,22"
          fill="none"
          stroke="var(--color-accent)"
          strokeWidth={1.5}
          opacity={0.8}
        />
        <path
          d="M0,26 C30,22 50,18 80,14 S130,6 160,10 S200,20 200,22 L200,36 L0,36 Z"
          fill="var(--color-accent)"
          opacity={0.1}
        />
      </svg>
    </div>
  );
}
