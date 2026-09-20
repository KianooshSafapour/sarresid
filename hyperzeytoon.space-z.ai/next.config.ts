import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  // Hide the dev "N Issues" pill in the corner — staff see the app, not tooling.
  // (The pill's own Radix-based overlay was also the source of a bogus
  //  "DialogContent requires DialogTitle" console error on every boot.)
  devIndicators: false,
};

export default nextConfig;
