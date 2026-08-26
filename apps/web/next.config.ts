import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@recoverai/core", "@recoverai/database", "@recoverai/analysis"],
};

export default nextConfig;
