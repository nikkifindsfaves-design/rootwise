import type { Metadata } from "next";
import {
  Cormorant_Garamond,
  Courier_Prime,
  Geist,
  Geist_Mono,
  IBM_Plex_Mono,
  IM_Fell_English,
  Permanent_Marker,
  Playfair_Display,
  Special_Elite,
} from "next/font/google";
import { Analytics } from "@vercel/analytics/react";
import { ThemeProvider } from "@/lib/theme/theme-context";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const evidenceBoardFont = Special_Elite({
  variable: "--font-evidence-board",
  subsets: ["latin"],
  weight: "400",
});

const deadGossipFont = Permanent_Marker({
  variable: "--font-dead-gossip",
  subsets: ["latin"],
  weight: "400",
});

const heirloomFont = IM_Fell_English({
  variable: "--font-heirloom",
  subsets: ["latin"],
  weight: "400",
});

const evidenceBoardBodyFont = IBM_Plex_Mono({
  variable: "--font-evidence-board-body",
  subsets: ["latin"],
  weight: "400",
});

const deadGossipBodyFont = Courier_Prime({
  variable: "--font-dead-gossip-body",
  subsets: ["latin"],
  weight: "400",
});

const heirloomBodyFont = Cormorant_Garamond({
  variable: "--font-heirloom-body",
  subsets: ["latin"],
  weight: "400",
});

const playfairFont = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Dead Gossip — AI-Powered Genealogy Research",
  description:
    "Upload historical records. Let AI extract the details. Build your family tree with stories that bring your ancestors to life. The good, the bad, the buried.",
  icons: {
    icon: "/favicon.ico",
  },
  openGraph: {
    title: "Dead Gossip — AI-Powered Genealogy Research",
    description:
      "Upload historical records. Let AI extract the details. Build your family tree with stories that bring your ancestors to life. The good, the bad, the buried.",
    url: "https://www.deadgossip.app",
    siteName: "Dead Gossip",
    type: "website",
    images: [
      {
        url: "https://www.deadgossip.app/og-image.png",
        width: 1200,
        height: 630,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Dead Gossip — AI-Powered Genealogy Research",
    description:
      "Upload historical records. Let AI extract the details. Build your family tree with stories that bring your ancestors to life. The good, the bad, the buried.",
    images: ["https://www.deadgossip.app/og-image.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${evidenceBoardFont.variable} ${deadGossipFont.variable} ${heirloomFont.variable} ${evidenceBoardBodyFont.variable} ${deadGossipBodyFont.variable} ${heirloomBodyFont.variable} ${playfairFont.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="flex min-h-full flex-col">
        <ThemeProvider>{children}</ThemeProvider>
        <Analytics />
      </body>
    </html>
  );
}
