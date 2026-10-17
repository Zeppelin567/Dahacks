// Hosts the rounded street / crossing / photo card (port of v3 openStreetCard) as a MapLibre popup on the map the
// pick came from. The card's content is the app's (detail-card.tsx StreetCard); this owns the map side: where it is
// anchored (crossing cards sit BESIDE the numbered bead, no tip), and keeping the whole card on screen, clear of
// the sheet and the switch, also while its "Why" fold grows.
import maplibregl from "maplibre-gl";
import { type ReactNode, useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { useBikeMap } from "../context";
import { flip } from "../geo";
import { isMobile, type MapPick } from "./shared";

/**
 * <PickPopup pick={pick} className={CARD_POPUP_CLASS}><StreetCard pick={pick} onClose=.../></PickPopup>
 * Renders nothing for a null pick. `onClose` fires if MapLibre closes the popup itself.
 */
export function PickPopup({
  pick,
  className = "bm-popup bm-sc",
  onClose,
  children,
}: {
  pick: MapPick | null;
  className?: string;
  onClose?: () => void;
  children: ReactNode;
}) {
  const { maps } = useBikeMap();
  const el = useMemo(() => document.createElement("div"), []);
  const cb = useRef(onClose);
  cb.current = onClose;
  const at = pick?.at;
  const mode = pick?.mode;
  const cross = pick?.kind === "crossing";
  useEffect(() => {
    if (!at || !mode) return;
    const map = maps[mode];
    const opt = cross
      ? { anchor: "left" as const, offset: [28, -20] as [number, number], className: `${className} notip` }
      : { offset: 18, className };
    const popup = new maplibregl.Popup({
      maxWidth: "310px",
      focusAfterOpen: false,
      closeButton: false,
      closeOnClick: false, // a tap elsewhere is the app's call (it may be the next pick)
      ...opt,
    })
      .setLngLat(flip(at))
      .setDOMContent(el)
      .addTo(map);
    let closing = false;
    popup.on("close", () => {
      if (!closing) cb.current?.();
    });
    // keep the whole card on screen and clear of the sheet / switch, also while "Why" grows
    const fit = () => {
      if (map.isMoving()) {
        map.once("moveend", () => setTimeout(fit, 30));
        return;
      }
      const r = popup.getElement()?.getBoundingClientRect();
      if (!r) return;
      const mob = isMobile();
      const sheetH =
        Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--bm-sheet-h")) || 260;
      const top = mob ? 110 : 84;
      const bot = innerHeight - (mob ? sheetH + 16 : 16);
      let dy = 0;
      if (r.top < top) dy = r.top - top;
      else if (r.bottom > bot) dy = Math.min(r.bottom - bot, r.top - top);
      const left = mob ? 8 : 412;
      let dx = 0;
      if (r.left < left) dx = r.left - left;
      else if (r.right > innerWidth - 80) dx = r.right - (innerWidth - 80);
      if (Math.abs(dy) > 2 || Math.abs(dx) > 2) map.panBy([dx, dy], { duration: 300 });
    };
    let t = 0;
    const ro = new ResizeObserver(() => {
      clearTimeout(t);
      t = window.setTimeout(fit, 60);
    });
    ro.observe(el);
    return () => {
      clearTimeout(t);
      ro.disconnect();
      closing = true;
      popup.remove();
    };
  }, [at?.[0], at?.[1], mode, cross, maps, el, className]);
  if (!pick) return null;
  return createPortal(children, el);
}
