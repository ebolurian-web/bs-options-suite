import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "BS Options Suite — Black-Scholes pricing, 3D volatility surface, multi-leg strategy builder";
export const contentType = "image/png";
export const size = { width: 1200, height: 630 };

export default async function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          background:
            "linear-gradient(135deg, #0a0a0a 0%, #111111 55%, #0a0a0a 100%)",
          color: "#ededed",
          fontFamily: "serif",
          position: "relative",
        }}
      >
        {/* Decorative grid */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage:
              "radial-gradient(circle at 25% 30%, rgba(0,208,132,0.18) 0 3px, transparent 4px), radial-gradient(circle at 75% 70%, rgba(52,211,153,0.12) 0 3px, transparent 4px), radial-gradient(circle at 90% 25%, rgba(248,113,113,0.1) 0 2px, transparent 3px)",
            backgroundSize: "280px 280px",
            opacity: 0.85,
            display: "flex",
          }}
        />

        {/* Top eyebrow */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            fontSize: 22,
            letterSpacing: 4,
            textTransform: "uppercase",
            color: "#00d084",
            fontFamily: "sans-serif",
            fontWeight: 600,
            position: "relative",
          }}
        >
          <div
            style={{
              width: 10,
              height: 10,
              borderRadius: 999,
              background: "#00d084",
              display: "flex",
            }}
          />
          Options Analytics · v2
        </div>

        {/* Main headline */}
        <div style={{ display: "flex", flexDirection: "column", gap: 24, position: "relative" }}>
          <div
            style={{
              fontSize: 118,
              lineHeight: 1.0,
              fontWeight: 700,
              letterSpacing: -2,
              display: "flex",
              color: "#ededed",
            }}
          >
            Black-<span style={{ color: "#00d084" }}>Scholes</span>
          </div>
          <div
            style={{
              fontSize: 72,
              lineHeight: 1.0,
              fontWeight: 400,
              color: "#a1a1a1",
              letterSpacing: -1.5,
              display: "flex",
            }}
          >
            Options Suite.
          </div>
          <div
            style={{
              marginTop: 28,
              fontSize: 28,
              color: "#a1a1a1",
              maxWidth: 900,
              lineHeight: 1.4,
              fontFamily: "sans-serif",
              display: "flex",
              flexWrap: "wrap",
              gap: 10,
            }}
          >
            Live market data · 3D volatility surface · net position Greeks · multi-leg strategies
          </div>
        </div>

        {/* Bottom bar */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
            fontSize: 22,
            fontFamily: "sans-serif",
            position: "relative",
          }}
        >
          <div style={{ display: "flex", color: "#ededed", fontWeight: 600 }}>
            options.bolurian.com
          </div>
          <div style={{ display: "flex", color: "#737373" }}>Built by Eden Bolurian</div>
        </div>
      </div>
    ),
    { ...size },
  );
}
