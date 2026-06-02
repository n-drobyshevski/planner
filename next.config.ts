import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Tree-shake barrel imports for heavy packages. lucide-react, date-fns and
    // recharts are already optimized by Next's defaults, so only the calendar's
    // timezone helper needs adding here.
    optimizePackageImports: ["@date-fns/tz"],
  },
};

export default nextConfig;
