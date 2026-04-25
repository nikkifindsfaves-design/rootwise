"use client";

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
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function applyThemeClass(theme: DGTheme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
}

/** Re-apply `html.dark` from localStorage / system preference (e.g. after leaving a route that forced light). */
export function syncDocumentThemeFromStorage() {
  if (typeof document === "undefined") return;
  applyThemeClass(readTheme());
}

function subscribe(onChange: () => void) {
  storeListeners.add(onChange);
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY || e.key === null) onChange();
  };
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  const onMq = () => onChange();
  window.addEventListener("storage", onStorage);
  mq.addEventListener("change", onMq);
  return () => {
    storeListeners.delete(onChange);
    window.removeEventListener("storage", onStorage);
    mq.removeEventListener("change", onMq);
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
  const theme = useSyncExternalStore(
    subscribe,
    getClientSnapshot,
    getServerSnapshot
  );

  useLayoutEffect(() => {
    applyThemeClass(theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    persistTheme(theme === "light" ? "dark" : "light");
  }, [theme]);

  const value = useMemo(
    () => ({ theme, toggleTheme }),
    [theme, toggleTheme]
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
