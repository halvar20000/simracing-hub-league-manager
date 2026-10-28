import type { MetadataRoute } from "next";

/** Web app manifest — makes CLS installable (Android, iOS home screen, desktop). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "CLS — CAS League Scoring",
    short_name: "CAS League",
    description:
      "Standings, results, RSVP and race notifications for the CAS iRacing leagues.",
    start_url: "/?source=app",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#09090b",
    theme_color: "#09090b",
    categories: ["sports", "games"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icons/maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      { name: "Calendar", url: "/calendar" },
      { name: "Streams", url: "/streams" },
      { name: "My notifications", url: "/profile#notifications" },
    ],
  };
}
