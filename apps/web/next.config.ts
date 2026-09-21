import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Turbopack's on-disk dev cache grew to ~16 GB (old .sst files never pruned).
    // Disabled to stop unbounded growth; it is a build cache only and does not
    // affect app behaviour. Re-enable if dev restarts feel too slow.
    turbopackFileSystemCacheForDev: false,
  },
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
        destination: "/dashboard/qs/claims?sub=retention",
        permanent: true,
      },
      {
        source: "/dashboard/qs/payments",
        destination: "/dashboard/qs/claims?sub=payments",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
