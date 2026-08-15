import { ImageResponse } from "next/og";

export const size = { width: 512, height: 512 };
export const contentType = "image/png";

export function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#223d81",
        }}
      >
        <span style={{ fontSize: 240, fontWeight: 700, color: "#ffffff", fontFamily: "sans-serif" }}>D</span>
      </div>
    ),
    size,
  );
}
