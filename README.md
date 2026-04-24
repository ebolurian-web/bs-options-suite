# BS Options Suite

[![Live](https://img.shields.io/badge/live-options.bolurian.com-00d084)](https://options.bolurian.com) [![Stack](https://img.shields.io/badge/Next.js-16-black)](https://nextjs.org) [![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6)](https://www.typescriptlang.org)

Black-Scholes options pricing suite with live market data, a 3-D volatility surface, and a multi-leg strategy builder.

**Live:** https://options.bolurian.com
**Built by:** [Eden Bolurian](https://bolurian.com)

---

## Features

### Pricer (`/pricer`)
- Black-Scholes pricing with Merton dividend extension, full Greeks (Δ Γ Θ ν)
- Live options chains via CBOE public delayed quotes (no auth, single-call full chain)
- Newton-Raphson implied volatility solver with bisection fallback
- **3-D volatility surface** — moneyness × DTE × IV, with per-expiry smile and 25Δ skew/term-structure analytics
- **Historical vol cone** — rolling realized vol percentiles (20/60/120-day) vs current IV, plus HV rank and percentile
- Interactive payoff diagram with hover crosshair
- Plain-English explanations for every Greek
- `Manual overrides` disclosure for scenario analysis

### Strategy Builder (`/strategies`)
- 11 pre-built strategies (Long Call/Put, Covered Call, Iron Condor, Butterflies, Straddle/Strangle, etc.)
- Editable legs table with per-cell inputs
- Combined payoff at expiry with hover crosshair
- Log-normal probability distribution chart
- **Net position Greeks** aggregated across all legs (Δ, Γ, Θ, ν)
- **Shareable URLs** via `?s=base64` encoding
- **Saved strategies** persisted to localStorage

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
