# bs-options-suite

Black-Scholes options pricing suite — live market data, 3D volatility surface, multi-leg strategy builder.

Built with **Next.js 15 (App Router)**, **TypeScript**, **Tailwind CSS v4**, and **Polygon.io** market data. Deployed on Vercel.

---

## Features

### Pricer
- Black-Scholes pricing with Merton dividend extension
- Full Greeks: Δ, Γ, Θ, ν, ρ
- Newton-Raphson implied volatility solver
- Live options chain (click-to-load into the model)
- Time-decay animation — watch Greeks deform toward expiry
- Put-call parity verification

### Volatility Analytics
- Interactive 3D volatility surface (moneyness × DTE × IV)
- Per-expiry smile with polynomial fit
- 25-delta risk reversal, butterfly, term-structure analytics
- Historical vs implied volatility cone + IV rank/percentile

### Strategy Builder
- 12 pre-built strategies (spreads, condors, straddles, etc.)
- Combined payoff diagram at expiry with break-even detection
- Net position Greeks (Δ, Γ, Θ, ν) across all legs
- Log-normal probability of profit simulation
- Saved strategies with shareable URLs

---

## Data

Options chains: **CBOE public delayed quotes** (`cdn.cboe.com/api/global/delayed_quotes/options/`) — free, no auth, full chain with Greeks and IV for every expiry in a single call.
Stock quotes: **Polygon.io** free tier — prices, 52-week range, historical aggregates for realized-volatility calculation.
Fallback: **Marketdata.app** anonymous tier.
Always-on: committed JSON snapshots for SPY + AAPL so the site works with zero external connectivity.

Server-side API routes proxy all requests — no CORS dance, no client-side API keys.

---

## Development

```bash
nvm use               # Node 20
cp .env.example .env.local
# Fill in POLYGON_API_KEY in .env.local
npm install
npm run dev           # http://localhost:3000
```

## Production

```bash
npm run build && npm start
```

Deployed on Vercel. Environment variables configured in the Vercel dashboard mirror `.env.example`.

---

## Accessibility

WCAG 2.2 AA target. `prefers-reduced-motion` respected on every animation.
Data visualizations ship with keyboard-accessible data-table alternatives.
Dark-first theme with opt-in light mode.

---

## License

MIT
