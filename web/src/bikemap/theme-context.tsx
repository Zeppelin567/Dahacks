// <BikeRoot ui> is the app's root element: it carries data-ui (which switches every --bm-* token in theme.css,
// with a 0.9s cross-fade) and provides useBikeTheme() to everything below it.
import "@fontsource/m-plus-rounded-1c/latin-500.css";
import "@fontsource/m-plus-rounded-1c/latin-700.css";
import "@fontsource/m-plus-rounded-1c/latin-800.css";
import "./theme.css";
import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from "react";
import { PAL, type Palette } from "./map/style";
import { ENGINE_MODE, PIP, type UiMode } from "./theme";

export type BikeTheme = {
  ui: UiMode;
  /** Map paint colours for this mode (same values as the CSS tokens). */
  pal: Palette;
  engine: (typeof ENGINE_MODE)[UiMode];
  pip: string;
  /** prefers-reduced-motion: skip draw-ins, count-ups, hops; jump to end states. */
  reducedMotion: boolean;
};

const Ctx = createContext<BikeTheme | null>(null);

export function useReducedMotion(): boolean {
  const q = "(prefers-reduced-motion: reduce)";
  const [rm, setRm] = useState(() => typeof matchMedia !== "undefined" && matchMedia(q).matches);
  useEffect(() => {
    const m = matchMedia(q);
    const on = () => setRm(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return rm;
}

export function BikeRoot({ ui, children }: { ui: UiMode; children: ReactNode }) {
  const reducedMotion = useReducedMotion();
  const value = useMemo<BikeTheme>(
    () => ({ ui, pal: PAL[ui], engine: ENGINE_MODE[ui], pip: PIP[ui], reducedMotion }),
    [ui, reducedMotion],
  );
  // Keep the browser chrome in step with the paper colour.
  useEffect(() => {
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", PAL[ui].bg);
  }, [ui]);
  return (
    <Ctx.Provider value={value}>
      <div className="bm-app" data-ui={ui}>
        {children}
      </div>
    </Ctx.Provider>
  );
}

export function useBikeTheme(): BikeTheme {
  const t = useContext(Ctx);
  if (!t) throw new Error("useBikeTheme() must be used inside <BikeRoot>");
  return t;
}
