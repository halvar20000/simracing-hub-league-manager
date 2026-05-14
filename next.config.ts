import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Default is 1 MB. Raw iRacing event-result JSON for IEC rounds is
      // ~3 MB (Watkins Glen). 10 MB gives comfortable headroom.
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
