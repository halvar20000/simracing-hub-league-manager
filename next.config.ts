import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emit a self-contained server bundle for the Docker image (self-hosting).
  output: "standalone",
  experimental: {
    serverActions: {
      // Default is 1 MB. iRacing event-result JSON for IEC rounds is ~3 MB,
      // and Twitch stream poster uploads can be 15+ MB for high-res PNGs.
      // 25 MB gives headroom for both.
      bodySizeLimit: "25mb",
    },
  },
};

export default nextConfig;
