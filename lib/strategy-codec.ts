/**
 * Encode/decode a strategy into a URL-safe base64 payload.
 *
 * Format: a compact array, not the full object, to keep URLs shorter.
 * [version, ticker, spot, volPct, rPct, [[action, type, qty, strike, premium, expiry], …]]
 */

import type { StrategyLeg, LegAction, LegType } from "./strategy";

type Encoded = {
  version: number;
  ticker: string | null;
  spot: number;
  volPct: number;
  rPct: number;
  legs: StrategyLeg[];
};

const VERSION = 1;

// URL-safe base64 (RFC 4648 base64url)
function b64UrlEncode(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64UrlDecode(input: string): string {
  const pad = input.length % 4 === 0 ? "" : "=".repeat(4 - (input.length % 4));
  const b64 = input.replace(/-/g, "+").replace(/_/g, "/") + pad;
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

export function encodeStrategy(state: {
  ticker: string | null;
  spot: number;
  volPct: number;
  rPct: number;
  legs: StrategyLeg[];
}): string {
  const compact = [
    VERSION,
    state.ticker ?? "",
    +state.spot.toFixed(4),
    +state.volPct.toFixed(4),
    +state.rPct.toFixed(4),
    state.legs.map((l) => [
      l.action === "buy" ? 1 : 0,
      l.type === "call" ? 0 : l.type === "put" ? 1 : 2,
      l.qty,
      +l.strike.toFixed(4),
      +l.premium.toFixed(4),
      l.expiry,
    ]),
  ];
  return b64UrlEncode(JSON.stringify(compact));
}

export function decodeStrategy(s: string): Encoded | null {
  try {
    const json = b64UrlDecode(s);
    const parsed = JSON.parse(json) as unknown;
    if (!Array.isArray(parsed) || parsed.length !== 6) return null;
    const [version, ticker, spot, vol, r, legsArr] = parsed as [
      number,
      string,
      number,
      number,
      number,
      unknown,
    ];
    if (version !== VERSION) return null;
    if (!Array.isArray(legsArr)) return null;

    const legs: StrategyLeg[] = [];
    for (let i = 0; i < legsArr.length; i++) {
      const row = legsArr[i];
      if (!Array.isArray(row) || row.length !== 6) return null;
      const [actionN, typeN, qty, strike, premium, expiry] = row as [
        number,
        number,
        number,
        number,
        number,
        string,
      ];
      if (![0, 1].includes(actionN)) return null;
      if (![0, 1, 2].includes(typeN)) return null;
      if (!Number.isFinite(qty) || qty < 1) return null;
      if (!Number.isFinite(strike) || strike <= 0) return null;
      if (!Number.isFinite(premium) || premium < 0) return null;
      if (typeof expiry !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(expiry)) return null;
      const action: LegAction = actionN === 1 ? "buy" : "sell";
      const type: LegType = typeN === 0 ? "call" : typeN === 1 ? "put" : "stock";
      legs.push({ id: i, action, type, qty, strike, premium, expiry });
    }

    return {
      version: VERSION,
      ticker: ticker ? String(ticker).toUpperCase() : null,
      spot: Number(spot),
      volPct: Number(vol),
      rPct: Number(r),
      legs,
    };
  } catch {
    return null;
  }
}

// ── Saved strategies (localStorage) ───────────────────────────────

export type SavedStrategy = {
  id: string;
  name: string;
  savedAt: number;
  ticker: string | null;
  spot: number;
  volPct: number;
  rPct: number;
  legs: StrategyLeg[];
};

const STORAGE_KEY = "bs-suite:saved-strategies:v1";

export function listSaved(): SavedStrategy[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed as SavedStrategy[];
  } catch {
    return [];
  }
}

export function saveStrategy(strat: Omit<SavedStrategy, "id" | "savedAt">): SavedStrategy {
  const entry: SavedStrategy = {
    ...strat,
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    savedAt: Date.now(),
  };
  const all = listSaved();
  all.unshift(entry);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all.slice(0, 50)));
  return entry;
}

export function removeSaved(id: string): void {
  const all = listSaved().filter((s) => s.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
}
