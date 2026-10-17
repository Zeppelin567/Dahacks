import { createContext, useContext, useEffect, useState } from "react";
import { appConfig } from "@/app.config";

type Theme = "dark" | "light" | "system";

type ThemeContextValue = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
};

const STORAGE_KEY = "mvp-theme";
const ThemeContext = createContext<ThemeContextValue>({ theme: "system", setTheme: () => {} });

function readStoredTheme(): Theme {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "dark" || v === "light" || v === "system") return v;
  } catch {
    // storage unavailable (private mode etc.)
  }
  return "system";
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(readStoredTheme);

  useEffect(() => {
    const root = document.documentElement;
    const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const dark = theme === "dark" || (theme === "system" && systemDark);
    root.classList.toggle("dark", dark);
  }, [theme]);

  // Brand color from app.config.ts, applied once at startup.
  useEffect(() => {
    const color = appConfig.brandColor;
    if (!color) return;
    const root = document.documentElement.style;
    for (const v of ["--primary", "--ring", "--sidebar-primary", "--sidebar-ring"])
      root.setProperty(v, color);
  }, []);

  const setTheme = (t: Theme) => {
    try {
      localStorage.setItem(STORAGE_KEY, t);
    } catch {
      // ignore
    }
    setThemeState(t);
  };

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
