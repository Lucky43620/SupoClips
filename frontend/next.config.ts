import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  // Skip ESLint during builds (generated Prisma code causes lint errors)
  eslint: {
    ignoreDuringBuilds: true,
  },
  // Skip TypeScript errors during builds for now
  typescript: {
    ignoreBuildErrors: false,
  },
};

export default nextConfig;
