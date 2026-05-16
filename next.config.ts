import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
