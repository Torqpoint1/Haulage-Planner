import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The driver's offline support (public/sw.js) must always be checked for updates.
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
        ],
      },
    ];
  },
  experimental: {
    // CSV imports send up to 5,000 rows (only the mapped columns) to a server action.
    serverActions: { bodySizeLimit: "4mb" },
  },
};

export default nextConfig;
