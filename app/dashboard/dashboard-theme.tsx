"use client";

import type { ReactNode } from "react";
import { ThemeProvider } from "@/lib/theme/theme-context";

/** Ensures dashboard client trees see ThemeProvider even if root boundary quirks occur. */
export function DashboardThemeProvider({ children }: { children: ReactNode }) {
  return <ThemeProvider>{children}</ThemeProvider>;
}
