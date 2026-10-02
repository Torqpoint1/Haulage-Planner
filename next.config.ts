import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // CSV imports send up to 5,000 rows (only the mapped columns) to a server action.
    serverActions: { bodySizeLimit: "4mb" },
  },
};

export default nextConfig;
