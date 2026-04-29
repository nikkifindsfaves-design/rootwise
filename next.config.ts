import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: "/dashboard/trees",
        destination: "/tree-select",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
