// Map-aware overlays: the control stack (recenter · zoom · 2D/3D) and the scale bar. Render as <MapLibreMap> children.
import { useEffect, useState } from "react";
import { useBikeMap, useMapCamera } from "./context";
import { clamp } from "./geo";

const Svg = ({ d }: { d: string }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d={d} />
  </svg>
);

export function MapControls({
  view3d,
  onToggle3d,
  onRecenter,
}: {
  view3d: boolean;
  onToggle3d: () => void;
  onRecenter: () => void;
}) {
  const { handle } = useBikeMap();
  return (
    <div className="bm-ctrls bm-ui">
      <button type="button" aria-label="Recenter" title="Recenter" onClick={onRecenter}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="7" />
          <circle cx="12" cy="12" r="2.2" fill="currentColor" />
          <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3" />
        </svg>
      </button>
      <hr className="zoom" />
      <button type="button" className="zoom" aria-label="Zoom in" onClick={() => handle.zoomIn()}>
        <Svg d="M12 5v14M5 12h14" />
      </button>
      <button type="button" className="zoom" aria-label="Zoom out" onClick={() => handle.zoomOut()}>
        <Svg d="M5 12h14" />
      </button>
      <hr />
      <button
        type="button"
        aria-pressed={view3d}
        aria-label={view3d ? "Switch to flat 2D view" : "Switch to 3D view"}
        onClick={onToggle3d}
      >
        {view3d ? "2D" : "3D"}
      </button>
    </div>
  );
}

// halves of the bar are round numbers of feet
const STEPS = [25, 50, 100, 200, 250, 500, 1000, 1320, 2640, 5280, 10560, 26400, 52800];
// miles only for clean quarter-miles (2,000 ft stays in feet rather than "0.378… mi")
const label = (f: number) => (f >= 1320 && f % 1320 === 0 ? `${f / 5280} mi` : `${f.toLocaleString()} ft`);

export function ScaleBar() {
  const { zoom, lat } = useMapCamera();
  const { maps } = useBikeMap();
  const [mobile, setMobile] = useState(() => maps.modern.getContainer().clientWidth < 700);
  useEffect(() => {
    const on = () => setMobile(maps.modern.getContainer().clientWidth < 700);
    maps.modern.on("resize", on);
    return () => {
      maps.modern.off("resize", on);
    };
  }, [maps]);
  const ftpp = ((40075016.686 * Math.cos((lat * Math.PI) / 180)) / (512 * 2 ** zoom)) * 3.28084;
  const maxPx = mobile ? 110 : 150;
  const fits = STEPS.filter((v) => (2 * v) / ftpp <= maxPx);
  const half = fits[fits.length - 1] ?? (STEPS[0] as number);
  const w = Math.round((2 * half) / ftpp);

  // Marker sizes follow the zoom: crossing beads (--bm-bead) and photo pins (--bm-pin).
  useEffect(() => {
    const rs = document.documentElement.style;
    rs.setProperty("--bm-bead", `${(clamp((zoom - 14) / 3) * 6 + (mobile ? 20 : 22)).toFixed(1)}px`);
    rs.setProperty("--bm-pin", `${(34 + 10 * clamp(zoom - 13.5)).toFixed(1)}px`);
  }, [zoom, mobile]);

  return (
    <div className="bm-scale bm-ui" aria-hidden="true">
      <div className="z">Zoom {zoom.toFixed(1)}</div>
      <div className="bar" style={{ width: w }}>
        <i />
        <i />
      </div>
      <div className="lab" style={{ width: w }}>
        <span>0</span>
        <span
          style={{ left: w / 2, visibility: w / 2 < label(half * 2).length * 6.5 + 8 ? "hidden" : undefined }}
        >
          {label(half).replace(/ (ft|mi)$/, "")}
        </span>
        <span style={{ left: w }}>{label(half * 2)}</span>
      </div>
    </div>
  );
}
