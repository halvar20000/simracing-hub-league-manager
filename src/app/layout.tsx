import type { Metadata, Viewport } from "next";
import { Inter, Rajdhani } from "next/font/google";
import Nav from "@/components/nav";
import Footer from "@/components/footer";
import ContactFab from "@/components/ContactFab";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";
import MobileTabBar from "@/components/MobileTabBar";
import { auth } from "@/auth";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const rajdhani = Rajdhani({
  weight: ["500", "600", "700"],
  subsets: ["latin"],
  variable: "--font-rajdhani",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://league.simracing-hub.com"
  ),
  title: "CLS — CAS League Scoring",
  description:
    "League management for the CAS iRacing community. Six championships, live standings, Fair Play Rating, race-by-race results.",
  openGraph: {
    title: "CLS — CAS League Scoring",
    description:
      "League management for the CAS iRacing community. Six championships, live standings, Fair Play Rating, race-by-race results.",
    url: "/",
    siteName: "CLS",
    type: "website",
    images: [
      {
        url: "/logos/cls-league-scoring.png",
        alt: "CLS — CAS League Scoring",
      },
    ],
  },
  appleWebApp: {
    capable: true,
    title: "CAS League",
    statusBarStyle: "black",
  },
  icons: {
    apple: "/icons/apple-touch-icon.png",
  },
  twitter: {
    card: "summary",
    title: "CLS — CAS League Scoring",
    description:
      "League management for the CAS iRacing community. Six championships, live standings, Fair Play Rating, race-by-race results.",
    images: ["/logos/cls-league-scoring.png"],
  },
};

export const viewport: Viewport = {
  themeColor: "#09090b",
  // Lets the bottom tab bar pad itself for the iPhone home indicator.
  viewportFit: "cover",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  return (
    <html lang="en" className="dark">
      <body
        className={`${inter.variable} ${rajdhani.variable} font-sans min-h-screen flex flex-col pb-[calc(4rem+env(safe-area-inset-bottom))] lg:pb-0`}
        style={{ fontFamily: "var(--font-inter), system-ui, sans-serif" }}
      >
        <Nav />
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-10">
          {children}
        </main>
        <Footer />
        <ContactFab />
        <MobileTabBar signedIn={!!session?.user} />
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
