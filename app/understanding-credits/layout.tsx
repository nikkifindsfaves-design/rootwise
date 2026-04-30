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
  title: "Dead Gossip — Understanding credits",
  description:
    "How monthly and add-on credits work, what each feature costs, and what happens when credits run out.",
};

export default function UnderstandingCreditsLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div
      className={`${promoDisplay.variable} ${promoSans.variable}`}
      style={{
        minHeight: "100vh",
        backgroundColor: "#0c0a09",
        color: "rgba(250, 250, 250, 0.92)",
        fontFamily:
          'var(--dg-promo-sans), "Source Sans 3", system-ui, sans-serif',
      }}
    >
      {children}
    </div>
  );
}
