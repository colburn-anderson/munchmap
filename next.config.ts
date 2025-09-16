import type { NextConfig } from "next";
const API_PROD = "https://stores-miniature-caution-internationally.trycloudflare.com";
const nextConfig: NextConfig = {
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
  // Expose ONLY your existing maps key names to the client
  env: {
    GOOGLE_MAPS_API_KEY: process.env.GOOGLE_MAPS_API_KEY,
    google_maps_api_key: process.env.GOOGLE_MAPS_API_KEY,
  },
  async rewrites() {
    if (process.env.NODE_ENV !== "production") {
      return [{ source: "/api/:path*", destination: "http://127.0.0.1:8000/api/:path*" }];
    }
    return [{ source: "/api/:path*", destination: `${API_PROD}/api/:path*` }];
  },
};
export default nextConfig;
