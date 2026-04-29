import type { Metadata } from "next";
import { Playfair_Display, Source_Sans_3 } from "next/font/google";

const promoDisplay = Playfair_Display({
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600", "700"],
  variable: "--dg-promo-display",
});

const promoSans = Source_Sans_3({
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600"],
  variable: "--dg-promo-sans",
});

export const metadata: Metadata = {
  title: "Dead Gossip — Learn more",
  description:
    "Why we built Dead Gossip, the body of work so far, how credits work, and what's coming next.",
};

export default function LearnMoreLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div
      className={`${promoDisplay.variable} ${promoSans.variable}`}
      style={{
        minHeight: "100vh",
        backgroundColor: "#0c0a09",
        color: "rgba(250, 250, 249, 0.92)",
        fontFamily:
          'var(--dg-promo-sans), "Source Sans 3", system-ui, sans-serif',
      }}
    >
      {children}
    </div>
  );
}
