import type { NextConfig } from "next";

// API keys are read only inside server route handlers (src/app/api/**),
// so nothing secret is ever inlined into the client bundle.
const nextConfig: NextConfig = {};

export default nextConfig;
