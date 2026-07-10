import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
