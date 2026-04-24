/**
 * Black-Scholes option pricing with the Merton (1973) dividend extension.
 * All inputs are continuous / annualized. Time in years, rates as decimals.
 *
 * Design notes:
 * - Pure functions. No DOM, no side effects.
 * - Returns `null` for invalid inputs rather than throwing so callers can
 *   render "—" without a try/catch on every render.
 * - IV solver uses Newton-Raphson with guardrails; falls back to bisection
 *   for edge cases (deep ITM/OTM where vega collapses).
 */

/** Single set of pricing inputs. */
export type BSInputs = {
  /** Spot price of the underlying. */
  S: number;
  /** Strike. */
  K: number;
  /** Time to expiry in years. */
  T: number;
  /** Risk-free rate as a decimal (e.g., 0.045 for 4.5%). */
  r: number;
  /** Volatility as a decimal (e.g., 0.25 for 25%). */
  sigma: number;
  /** Continuous dividend yield as a decimal (0 by default). */
  q?: number;
};

/** Full pricing + Greeks output. */
export type BSResult = {
  call: number;
  put: number;
  /** d1 from the BS formula, exposed for downstream tooling. */
  d1: number;
  d2: number;
  greeks: {
    /** Call delta: dC/dS. Range: [0, e^(-qT)]. */
    deltaCall: number;
    /** Put delta: dP/dS. Range: [-e^(-qT), 0]. */
    deltaPut: number;
    /** Gamma: d²(C|P)/dS². Same for call and put. */
    gamma: number;
    /** Call theta per calendar day. Typically negative for long options. */
    thetaCallPerDay: number;
    thetaPutPerDay: number;
    /** Vega per 1% (i.e., per 0.01 in sigma). */
    vegaPer1Pct: number;
    /** Rho per 1% change in r. */
    rhoCallPer1Pct: number;
    rhoPutPer1Pct: number;
  };
};

/** Standard normal cumulative distribution function. Abramowitz–Stegun 26.2.17. */
export function normCdf(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989422804014327 * Math.exp(-0.5 * x * x);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - p : p;
}

/** Standard normal probability density function. */
export function normPdf(x: number): number {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

/**
 * Core Black-Scholes-Merton pricing. Returns null if inputs are invalid
 * (non-positive S/K/sigma, negative T, etc.).
 */
export function priceBS(inputs: BSInputs): BSResult | null {
  const { S, K, T, r, sigma } = inputs;
  const q = inputs.q ?? 0;
  if (!(S > 0) || !(K > 0) || !(sigma > 0) || T < 0 || !Number.isFinite(r)) return null;
  // At expiry: intrinsic values, no time value.
  if (T === 0) {
    const intrinsicCall = Math.max(0, S - K);
    const intrinsicPut = Math.max(0, K - S);
    return {
      call: intrinsicCall,
      put: intrinsicPut,
      d1: S > K ? Infinity : -Infinity,
      d2: S > K ? Infinity : -Infinity,
      greeks: {
        deltaCall: S > K ? 1 : 0,
        deltaPut: S > K ? 0 : -1,
        gamma: 0,
        thetaCallPerDay: 0,
        thetaPutPerDay: 0,
        vegaPer1Pct: 0,
        rhoCallPer1Pct: 0,
        rhoPutPer1Pct: 0,
      },
    };
  }
  const sqrtT = Math.sqrt(T);
  const d1 = (Math.log(S / K) + (r - q + 0.5 * sigma * sigma) * T) / (sigma * sqrtT);
  const d2 = d1 - sigma * sqrtT;
  const eqT = Math.exp(-q * T);
  const erT = Math.exp(-r * T);
  const Nd1 = normCdf(d1);
  const Nd2 = normCdf(d2);
  const NegNd1 = normCdf(-d1);
  const NegNd2 = normCdf(-d2);
  const pdfD1 = normPdf(d1);

  const call = S * eqT * Nd1 - K * erT * Nd2;
  const put = K * erT * NegNd2 - S * eqT * NegNd1;

  const deltaCall = eqT * Nd1;
  const deltaPut = eqT * (Nd1 - 1);
  const gamma = (eqT * pdfD1) / (S * sigma * sqrtT);
  const thetaCallPerYear =
    -(S * eqT * pdfD1 * sigma) / (2 * sqrtT) - r * K * erT * Nd2 + q * S * eqT * Nd1;
  const thetaPutPerYear =
    -(S * eqT * pdfD1 * sigma) / (2 * sqrtT) + r * K * erT * NegNd2 - q * S * eqT * NegNd1;
  const vegaPerUnit = S * eqT * pdfD1 * sqrtT; // per unit of sigma
  const rhoCallPerUnit = K * T * erT * Nd2;
  const rhoPutPerUnit = -K * T * erT * NegNd2;

  return {
    call,
    put,
    d1,
    d2,
    greeks: {
      deltaCall,
      deltaPut,
      gamma,
      thetaCallPerDay: thetaCallPerYear / 365,
      thetaPutPerDay: thetaPutPerYear / 365,
      vegaPer1Pct: vegaPerUnit / 100,
      rhoCallPer1Pct: rhoCallPerUnit / 100,
      rhoPutPer1Pct: rhoPutPerUnit / 100,
    },
  };
}

export type IVSolveResult =
  | { ok: true; sigma: number; iterations: number; method: "newton" | "bisection" }
  | { ok: false; reason: "no-convergence" | "outside-bounds" | "invalid-input" };

/**
 * Solve for implied volatility from an observed market price.
 * Newton-Raphson with bisection fallback when vega collapses or overshoots.
 *
 * @param params Same pricing inputs, but `sigma` is ignored — we solve for it.
 * @param marketPrice Observed market price of the option.
 * @param optionType "call" or "put".
 */
export function solveIV(
  params: Omit<BSInputs, "sigma">,
  marketPrice: number,
  optionType: "call" | "put",
): IVSolveResult {
  if (!(marketPrice > 0) || !(params.S > 0) || !(params.K > 0) || params.T <= 0) {
    return { ok: false, reason: "invalid-input" };
  }
  // Check arbitrage bounds: call price must be in [max(0, S*e^-qT - K*e^-rT), S*e^-qT]
  const q = params.q ?? 0;
  const erT = Math.exp(-params.r * params.T);
  const eqT = Math.exp(-q * params.T);
  const lowerBound =
    optionType === "call"
      ? Math.max(0, params.S * eqT - params.K * erT)
      : Math.max(0, params.K * erT - params.S * eqT);
  const upperBound = optionType === "call" ? params.S * eqT : params.K * erT;
  if (marketPrice < lowerBound - 1e-6 || marketPrice > upperBound + 1e-6) {
    return { ok: false, reason: "outside-bounds" };
  }

  // Newton-Raphson first
  let sigma = 0.3;
  for (let i = 0; i < 100; i++) {
    const res = priceBS({ ...params, sigma });
    if (!res) break;
    const modelPrice = optionType === "call" ? res.call : res.put;
    const vega = res.greeks.vegaPer1Pct * 100; // restore to per-unit
    const diff = modelPrice - marketPrice;
    if (Math.abs(diff) < 1e-8) {
      return { ok: true, sigma, iterations: i + 1, method: "newton" };
    }
    if (Math.abs(vega) < 1e-10) break;
    const step = diff / vega;
    sigma -= step;
    if (sigma <= 0 || sigma > 5) {
      // Bail out of Newton; let bisection handle it.
      break;
    }
  }

  // Bisection fallback on [0.001, 5]
  let lo = 0.001;
  let hi = 5;
  for (let i = 0; i < 200; i++) {
    const mid = 0.5 * (lo + hi);
    const res = priceBS({ ...params, sigma: mid });
    if (!res) return { ok: false, reason: "no-convergence" };
    const modelPrice = optionType === "call" ? res.call : res.put;
    const diff = modelPrice - marketPrice;
    if (Math.abs(diff) < 1e-8 || hi - lo < 1e-9) {
      return { ok: true, sigma: mid, iterations: i + 1, method: "bisection" };
    }
    if (diff > 0) hi = mid;
    else lo = mid;
  }
  return { ok: false, reason: "no-convergence" };
}

/** Put-call parity residual. Should be ~0 in an arbitrage-free market. */
export function parityResidual(inputs: BSInputs, callPrice: number, putPrice: number): number {
  const q = inputs.q ?? 0;
  const lhs = callPrice - putPrice;
  const rhs = inputs.S * Math.exp(-q * inputs.T) - inputs.K * Math.exp(-inputs.r * inputs.T);
  return lhs - rhs;
}

/**
 * Moneyness label: ATM if within 1% of spot, ITM/OTM by side.
 * Note: call ITM when S>K; put ITM when S<K. Here we return call-centric
 * labeling and let callers flip for puts.
 */
export function moneynessCall(S: number, K: number): "ITM" | "ATM" | "OTM" {
  if (K === 0) return "OTM";
  if (Math.abs(S - K) / K < 0.01) return "ATM";
  return S > K ? "ITM" : "OTM";
}
