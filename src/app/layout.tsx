import type { Metadata } from "next";
import { Inter, Rajdhani } from "next/font/google";
import Nav from "@/components/nav";
import Footer from "@/components/footer";
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
  title: "Simracing-Hub League Manager — CAS iRacing Community",
  description:
    "League management for the CAS iRacing community. Six championships, live standings, Fair Play Rating, race-by-race results.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${inter.variable} ${rajdhani.variable} font-sans min-h-screen flex flex-col`}
        style={{ fontFamily: "var(--font-inter), system-ui, sans-serif" }}
      >
        <Nav />
        <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">
          {children}
        </main>
        <Footer />
      </body>
    </html>
  );
}
