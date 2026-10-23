import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The license contract shared with the tenant app ships as TypeScript source.
  transpilePackages: ["@dcos/licensing"],
};

export default nextConfig;
