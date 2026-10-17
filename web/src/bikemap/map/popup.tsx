// A React-rendered MapLibre popup on the visible map (rounded card styling in map.css: .bm-popup).
import maplibregl from "maplibre-gl";
import { type ReactNode, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import type { LatLng } from "../api";
import { useBikeMap } from "./context";
import { flip } from "./geo";

export function MapPopup({
  at,
  onClose,
  children,
  offset = 12,
  className = "bm-popup",
}: {
  at: LatLng;
  onClose: () => void;
  children: ReactNode;
  offset?: number;
  className?: string;
}) {
  const { handle, ui } = useBikeMap();
  const el = useMemo(() => document.createElement("div"), []);
  // biome-ignore lint/correctness/useExhaustiveDependencies: onClose is read at close time; re-attaching on each render would flicker
  useEffect(() => {
    const map = handle.active();
    if (!map) return;
    const p = new maplibregl.Popup({
      offset,
      className,
      closeButton: false,
      maxWidth: "320px",
      focusAfterOpen: false,
    })
      .setLngLat(flip(at))
      .setDOMContent(el)
      .addTo(map);
    let closing = false;
    p.on("close", () => {
      if (!closing) onClose();
    });
    return () => {
      closing = true;
      p.remove();
    };
  }, [at[0], at[1], el, handle, offset, className, ui]);
  return createPortal(children, el);
}
