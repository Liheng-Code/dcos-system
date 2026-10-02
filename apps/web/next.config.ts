import type { NextConfig } from "next";
import { disabledRoutes, parseEnabledModules } from "./module-deployment.mjs";

// Deploy-time module selection (see module-deployment.mjs). Throws on an unknown key.
const rawEnabledModules = process.env.DCOS_ENABLED_MODULES;
const enabledModules = parseEnabledModules(rawEnabledModules);
const blockedRoutes = disabledRoutes(enabledModules);
// Pages go back to the dashboard; API and other routes answer 404.
const blockedPages = blockedRoutes.filter((r) => r.source.startsWith("/dashboard/"));
const blockedOther = blockedRoutes.filter((r) => !r.source.startsWith("/dashboard/"));
if (enabledModules) {
  console.log(`[dcos] modules enabled: ${[...enabledModules].join(", ")}`);
}

const nextConfig: NextConfig = {
  env: {
    // Client code (sidebar, module hub) reads the same selection.
    NEXT_PUBLIC_DCOS_ENABLED_MODULES: rawEnabledModules ?? "",
  },
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
  async rewrites() {
    return {
      beforeFiles: blockedOther.map((r) => ({
        source: `${r.source}/:path*`,
        destination: "/module-not-deployed",
      })),
    };
  },
  async redirects() {
    return [
      ...blockedPages.map((r) => ({
        source: `${r.source}/:path*`,
        destination: "/dashboard",
        permanent: false,
      })),
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
