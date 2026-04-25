"use client";

import { useLayoutEffect } from "react";
import { syncDocumentThemeFromStorage, useTheme } from "@/lib/theme/theme-context";

export default function LoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { theme } = useTheme();

  useLayoutEffect(() => {
    document.documentElement.classList.remove("dark");
    return () => {
      syncDocumentThemeFromStorage();
    };
  }, []);

  useLayoutEffect(() => {
    document.documentElement.classList.remove("dark");
  }, [theme]);

  return <>{children}</>;
}
