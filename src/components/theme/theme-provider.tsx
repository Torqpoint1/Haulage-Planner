"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

export type ThemePreference = "system" | "light" | "dark";
export type Density = "comfortable" | "compact";

const THEME_KEY = "hp-theme";
const DENSITY_KEY = "hp-density";

type ThemeContextValue = {
  theme: ThemePreference;
  resolvedTheme: "light" | "dark";
  setTheme: (theme: ThemePreference) => void;
  density: Density;
  setDensity: (density: Density) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

/**
 * Runs before first paint (inlined in <head>) so the page never flashes the
 * wrong theme or density. Keep in sync with `apply()` below.
 */
export const themeInitScript = `(function(){try{var d=document.documentElement;var t=localStorage.getItem("${THEME_KEY}")||"system";var dark=t==="dark"||(t==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);d.classList.toggle("dark",dark);d.dataset.density=localStorage.getItem("${DENSITY_KEY}")==="compact"?"compact":"comfortable";}catch(e){}})();`;

function read<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const value = localStorage.getItem(key);
    return allowed.includes(value as T) ? (value as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Private mode or blocked storage: the setting just won't persist.
  }
}

function systemPrefersDark() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemePreference>("system");
  const [density, setDensityState] = useState<Density>("comfortable");
  const [systemDark, setSystemDark] = useState(false);

  // Read stored preferences after hydration (the init script already applied them).
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- syncing from localStorage after hydration */
    setThemeState(read(THEME_KEY, ["system", "light", "dark"] as const, "system"));
    setDensityState(read(DENSITY_KEY, ["comfortable", "compact"] as const, "comfortable"));
    setSystemDark(systemPrefersDark());
    /* eslint-enable react-hooks/set-state-in-effect */
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  const resolvedTheme = theme === "system" ? (systemDark ? "dark" : "light") : theme;

  useEffect(() => {
    document.documentElement.classList.toggle("dark", resolvedTheme === "dark");
  }, [resolvedTheme]);

  useEffect(() => {
    document.documentElement.dataset.density = density;
  }, [density]);

  const setTheme = useCallback((next: ThemePreference) => {
    setThemeState(next);
    write(THEME_KEY, next);
  }, []);

  const setDensity = useCallback((next: Density) => {
    setDensityState(next);
    write(DENSITY_KEY, next);
  }, []);

  const value = useMemo(
    () => ({ theme, resolvedTheme, setTheme, density, setDensity }),
    [theme, resolvedTheme, setTheme, density, setDensity],
  );

  return <ThemeContext value={value}>{children}</ThemeContext>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside <ThemeProvider>");
  return ctx;
}
