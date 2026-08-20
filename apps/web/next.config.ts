import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // Telegram Mini App pages need to render inside Telegram's own
        // WebView, which embeds them in an iframe from web.telegram.org.
        // Scoped to /telegram-app only — the rest of the app has no such
        // requirement and should keep the browser's default framing rules.
        source: "/telegram-app/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: "frame-ancestors https://web.telegram.org https://telegram.org;",
          },
        ],
      },
    ];
  },
  async redirects() {
    return [
      {
        source: "/dashboard/qs/retention",
        destination: "/dashboard/qs/claims",
        permanent: true,
      },
      {
        source: "/dashboard/qs/payments",
        destination: "/dashboard/qs/claims",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
