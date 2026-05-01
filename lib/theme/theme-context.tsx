"use client";

import { usePathname } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";

export type DGTheme = "light" | "dark";

type ThemeContextValue = {
  theme: DGTheme;
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

const STORAGE_KEY = "dg-theme";

const storeListeners = new Set<() => void>();

function emitStoreChange() {
  for (const l of storeListeners) l();
}

function readTheme(): DGTheme {
  if (typeof window === "undefined") return "light";
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "dark" || stored === "light") return stored;
  return "light";
}

function applyThemeClass(theme: DGTheme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
}

/** Re-apply `html.dark` from localStorage (path-aware callers may need to navigate so ThemeProvider applies). */
export function syncDocumentThemeFromStorage() {
  if (typeof document === "undefined") return;
  applyThemeClass(readTheme());
}

function subscribe(onChange: () => void) {
  storeListeners.add(onChange);
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY || e.key === null) onChange();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    storeListeners.delete(onChange);
    window.removeEventListener("storage", onStorage);
  };
}

function getServerSnapshot(): DGTheme {
  return "light";
}

function getClientSnapshot(): DGTheme {
  return readTheme();
}

function persistTheme(next: DGTheme) {
  localStorage.setItem(STORAGE_KEY, next);
  emitStoreChange();
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const storedTheme = useSyncExternalStore(
    subscribe,
    getClientSnapshot,
    getServerSnapshot
  );

  const appliedTheme: DGTheme =
    pathname === "/login" ? "light" : storedTheme;

  useLayoutEffect(() => {
    applyThemeClass(appliedTheme);
  }, [appliedTheme]);

  const toggleTheme = useCallback(() => {
    persistTheme(storedTheme === "light" ? "dark" : "light");
  }, [storedTheme]);

  const value = useMemo(
    () => ({ theme: appliedTheme, toggleTheme }),
    [appliedTheme, toggleTheme]
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return ctx;
}
