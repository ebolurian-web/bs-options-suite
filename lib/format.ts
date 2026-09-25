/** Display formatting shared across the suite. */

const MINUS = "−";

/** Whole-dollar P&L with sign: "+$1,068", "−$240", "$0", "Unlimited". */
export function fmtSigned(n: number): string {
  if (!Number.isFinite(n)) return n > 0 ? "Unlimited" : `${MINUS}Unlimited`;
  const r = Math.round(n);
  const abs = Math.abs(r).toLocaleString("en-US");
  return r > 0 ? `+$${abs}` : r < 0 ? `${MINUS}$${abs}` : "$0";
}

/** Whole dollars, no sign: "$1,240". */
export function usd(n: number): string {
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

/** Signed percent with a real minus sign: "+0.48%". */
export function fmtPct(n: number, digits = 2): string {
  return `${n >= 0 ? "+" : MINUS}${Math.abs(n).toFixed(digits)}%`;
}

/** Strike without trailing zeros: 590, 592.5. */
export function fmtStrike(k: number): string {
  return Number.isInteger(k) ? String(k) : k.toFixed(2).replace(/0$/, "");
}

export function parseIso(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12));
}

export function addDays(n: number): Date {
  return new Date(Date.now() + n * 86400_000);
}

/** "Nov 20, 2026" */
export function fmtDate(iso: string): string {
  return parseIso(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

/** "Nov 20" */
export function fmtShort(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}
