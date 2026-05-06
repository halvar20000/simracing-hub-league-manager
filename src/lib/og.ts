import type { Metadata } from "next";

export const CLS_OG_IMAGE_URL = "/logos/cls-league-scoring.png";
export const CLS_OG_IMAGE_ALT = "CLS — CAS League Scoring";

export function pageMetadata(opts: {
  title: string;
  description: string;
  url?: string;
}): Metadata {
  return {
    title: opts.title,
    description: opts.description,
    openGraph: {
      title: opts.title,
      description: opts.description,
      url: opts.url,
      siteName: "CLS",
      type: "website",
      images: [{ url: CLS_OG_IMAGE_URL, alt: CLS_OG_IMAGE_ALT }],
    },
    twitter: {
      card: "summary",
      title: opts.title,
      description: opts.description,
      images: [CLS_OG_IMAGE_URL],
    },
  };
}
