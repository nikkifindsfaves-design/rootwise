import { Lato, Playfair_Display } from "next/font/google";
import type { ReactNode } from "react";

const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-dg-display",
  display: "swap",
});

const lato = Lato({
  subsets: ["latin"],
  weight: ["400", "700"],
  style: ["normal", "italic"],
  variable: "--font-dg-body",
  display: "swap",
});

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div
      className={`${playfair.variable} ${lato.variable} min-h-screen`}
      style={{
        backgroundColor: "var(--dg-bg-main)",
        fontFamily: "var(--font-dg-body), Lato, ui-sans-serif, system-ui, sans-serif",
      }}
    >
      {children}
    </div>
  );
}
