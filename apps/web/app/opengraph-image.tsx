import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "c0upons — Community Coupon Codes";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          background: "#ffffff",
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "Arial Black, Arial, sans-serif",
        }}
      >
        {/* Orange accent bar */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: 12,
            background: "#f97316",
          }}
        />
        {/* Logo text */}
        <div
          style={{
            fontSize: 120,
            fontWeight: 900,
            color: "#f97316",
            letterSpacing: "-2px",
          }}
        >
          c0upons
        </div>
        {/* Tagline */}
        <div
          style={{
            fontSize: 36,
            fontWeight: 400,
            color: "#374151",
            marginTop: 24,
          }}
        >
          Community Coupon Codes &amp; Deals
        </div>
        {/* Bottom accent bar */}
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: 12,
            background: "#f97316",
          }}
        />
      </div>
    ),
    { ...size }
  );
}
