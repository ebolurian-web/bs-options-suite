# BS Options Suite

[![Live](https://img.shields.io/badge/live-options.bolurian.com-00d084)](https://options.bolurian.com) [![Stack](https://img.shields.io/badge/Next.js-16-black)](https://nextjs.org) [![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6)](https://www.typescriptlang.org)

Black-Scholes options pricing suite with live market data, a 3-D volatility surface, and a multi-leg strategy builder.

**Live:** https://options.bolurian.com
**Built by:** [Eden Bolurian](https://bolurian.com)

---

## Features

### Trade Ideas (`/trade`)
- Start from a view — **up, down, flat, or a big move** — plus a target price, a date, and an optional max loss
- Ranked candidate trades (spreads, single options, condors, butterflies, straddles) built from the strikes actually listed for that expiry
- Every leg priced at the live bid/ask mid with **its own implied volatility** (skew-aware), with market vs. flat-σ Black-Scholes shown side by side
- Exact max loss, max gain, and break-evens; probability of profit from the risk-neutral log-normal
- One P&L chart: payoff at expiry plus a mark-to-model curve at any date, driven by **price / date / IV sliders**
- "Is it cheap?" verdict comparing ATM IV to 20-day realized vol and its 1-year rank
- Greeks in plain dollars ("SPY +$1 → +$26"), shareable URLs, and one-click hand-off to the Strategy Builder

### Option Explorer (`/pricer`)
- Live option chain: pick an expiration, then click any call or put (price, IV and delta per strike, in-the-money shading, spot marker)
- Buy/Sell and Call/Put switches; cost, break-even, chance of profit, chance of finishing in the money, max loss/gain
- Shared P&L chart with price / date / IV sliders
- "Is the price fair?": contract IV vs 20-day realized vol, market mid vs Black-Scholes at ATM IV, with a plain-English skew note
- Greeks in dollars per contract, plus plain-English explanations; editable rate and dividend yield
- Volatility section: **3-D surface**, smile, 25Δ skew and term structure, and the **historical vol cone**
- Newton-Raphson IV solver with bisection fallback where the provider IV is missing

### Strategy Builder (`/strategies`)
- Templates grouped by view (bullish, bearish, neutral, big move, income) that snap to listed strikes ~45 days out
- Leg editor: side, quantity, listed contract, expiry, and a price that **follows the live mid** until you type over it
- Mixed expirations (calendars/diagonals) and stock legs supported; each leg marked at its own IV
- Net cost/credit, max gain/loss, break-evens, chance of profit; P&L chart with scenario sliders or a "where it could land" probability view
- Position Greeks in dollars with a one-line read of what the trade is betting on
- **Shareable URLs** (`?s=`) and **saved strategies** in localStorage (reopen at live prices)

---

## Accessibility

WCAG 2.2 AA target. Built a11y-first:

- Every chart ships with a keyboard-accessible data-table alternative inside `<details>`
- `prefers-reduced-motion` disables backdrop drift, hover lifts, glows, and in-chart animations
- Dark-first palette with verified 4.5:1 text and 3:1 UI contrast
- Full keyboard operability; 2 px focus outline + 4 px glow
- Single polite live region for strategy/ticker updates; debounced summaries, no per-tile spam
- Plain-language Greek explanations with `aria-expanded` disclosures (not hover-only tooltips)
- Skip link, semantic heading hierarchy, per-cell `aria-label` on editable tables

---

## Data

Primary: **CBOE public delayed quotes** (`cdn.cboe.com/api/global/delayed_quotes/options/`) — free, no auth, full chain with Greeks and IV in a single request, ~15-minute delay.

Stock history: **Polygon.io** free tier — 1-year daily aggregates for realized volatility and the vol cone.

Fallback: **Marketdata.app** anonymous endpoint.

All requests are proxied through Next.js API routes — no CORS, no client-exposed keys.

---

## Stack

- **Next.js 16** (App Router, Turbopack, React 19)
- **TypeScript 5**
- **Tailwind CSS v4** + design tokens in CSS custom properties
- **Plotly.js** (dynamically imported; 3-D surface, smile, skew, distribution, vol cone)
- **Vercel** (deploy target)

---

## Development

```bash
nvm use                                # Node 20
cp .env.example .env.local
# Add POLYGON_API_KEY to .env.local
npm install
npm run dev                            # http://localhost:3000
```

## Production

```bash
npm run build
npm start
```

---

## Deployment

Deployed to **Vercel** at `options.bolurian.com` (CNAME from GoDaddy).

To deploy your own fork:

1. **Push to GitHub** (this repo), then go to https://vercel.com/new and import it.
2. **Environment variables** in Vercel → Settings → Environment Variables:
   - `POLYGON_API_KEY` — your Polygon.io free-tier key (required)
   - `MARKETDATA_API_TOKEN` — optional; empty is fine
   - `NEXT_PUBLIC_ENABLE_LIVE_DATA` — `true`
3. **Custom domain** (optional):
   - Vercel → Settings → Domains → add `options.yourdomain.com`
   - Copy the CNAME target Vercel provides (e.g., `cname.vercel-dns.com`)
   - In your DNS provider, add a CNAME record: `options` → `cname.vercel-dns.com`
4. Wait ~60 seconds for DNS and Vercel SSL provisioning.

---

## License

MIT
