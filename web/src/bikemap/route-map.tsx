import { useEffect, useState } from "react";
import "leaflet/dist/leaflet.css";
import { CircleMarker, MapContainer, Polyline, Popup, TileLayer, Tooltip, useMap } from "react-leaflet";
import type { LatLng, Level, Mode, Route, Segment } from "./api";
import { HazardButton, HazardLayer } from "./hazard-report";
import { SegmentVote } from "./segment-vote";

const CUPERTINO: LatLng = [37.318, -122.04];

// Base-layer colours per map. Safe = traffic light; Green = green → concrete grey.
export const LEVEL_COLORS: Record<Mode, Record<Level, string>> = {
  safe: { good: "#16a34a", ok: "#f59e0b", bad: "#dc2626" },
  green: { good: "#15803d", ok: "#86c98f", bad: "#a8a29e" },
};
const ROUTE_COLOR: Record<Mode, string> = { safe: "#2563eb", green: "#047857" };

function Reasons({ seg }: { seg: Segment }) {
  return (
    <div className="text-xs">
      <div className="font-semibold">score {seg.score.toFixed(2)}</div>
      <ul className="list-disc pl-4">
        {seg.reasons.map((r) => (
          <li key={r}>{r}</li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Demo-day insurance: if the layout shifts (tab switch, panel resize) while
 * Leaflet measured a zero-size container, the map goes grey. Re-sync on mount
 * and on window resize.
 */
function FixMapSize() {
  const map = useMap();
  useEffect(() => {
    const t = setTimeout(() => map.invalidateSize(), 100);
    const onResize = () => map.invalidateSize();
    window.addEventListener("resize", onResize);
    return () => {
      clearTimeout(t);
      window.removeEventListener("resize", onResize);
    };
  }, [map]);
  return null;
}

type Props = {
  mode: Mode;
  network?: Segment[];
  showNetwork: boolean;
  fastest?: Route;
  recommended?: Route;
  /** Previous recommended route, kept dimmed for A/B comparison (BikeButler-style). */
  prevRecommended?: Route | null;
  start?: LatLng;
  end?: LatLng;
  onVoteSegment?: (seg: Segment, like: boolean) => void;
};

export function RouteMap({
  mode,
  network,
  showNetwork,
  fastest,
  recommended,
  prevRecommended,
  start,
  end,
  onVoteSegment,
}: Props) {
  const colors = LEVEL_COLORS[mode];
  const [hazardArmed, setHazardArmed] = useState(false);

  return (
    <div className="relative size-full">
      <MapContainer center={CUPERTINO} zoom={14} className="size-full" scrollWheelZoom>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          className="bm-tiles"
        />

        {showNetwork &&
          network?.map((seg) => (
            <Polyline
              key={`n${seg.coords.flat().join()}`}
              positions={seg.coords}
              pathOptions={{ color: colors[seg.level], weight: 3, opacity: 0.45 }}
            >
              <Popup>
                <Reasons seg={seg} />
              </Popup>
            </Polyline>
          ))}

        {prevRecommended && (
          <Polyline
            positions={prevRecommended.coords}
            pathOptions={{ color: "#a1a1aa", weight: 4, opacity: 0.55, dashArray: "2 7" }}
          >
            <Tooltip sticky>Previous route · {prevRecommended.duration_min} min</Tooltip>
          </Polyline>
        )}

        {fastest && (
          <Polyline positions={fastest.coords} pathOptions={{ color: "#52525b", weight: 4, dashArray: "6 8" }}>
            <Tooltip sticky>Fastest · {fastest.duration_min} min</Tooltip>
          </Polyline>
        )}

        {recommended && (
          <>
            <Polyline
              positions={recommended.coords}
              pathOptions={{ color: ROUTE_COLOR[mode], weight: 9, opacity: 0.35 }}
            />
            {recommended.segments.map((seg) => (
              <Polyline
                key={`r${seg.coords.flat().join()}`}
                positions={seg.coords}
                pathOptions={{ color: colors[seg.level], weight: 5 }}
              >
                <Popup>
                  <Reasons seg={seg} />
                  {onVoteSegment && <SegmentVote seg={seg} onVote={(like) => onVoteSegment(seg, like)} />}
                </Popup>
              </Polyline>
            ))}
          </>
        )}

        {start && (
          <CircleMarker
            center={start}
            radius={8}
            pathOptions={{ color: "#fff", fillColor: "#18181b", fillOpacity: 1 }}
          >
            <Tooltip>Start</Tooltip>
          </CircleMarker>
        )}
        {end && (
          <CircleMarker
            center={end}
            radius={8}
            pathOptions={{ color: "#fff", fillColor: ROUTE_COLOR[mode], fillOpacity: 1 }}
          >
            <Tooltip>End</Tooltip>
          </CircleMarker>
        )}

        <HazardLayer armed={hazardArmed} onDisarm={() => setHazardArmed(false)} />
        <FixMapSize />
      </MapContainer>

      <div className="absolute right-3 top-3 z-[1000]">
        <HazardButton armed={hazardArmed} onToggle={() => setHazardArmed((a) => !a)} />
      </div>
    </div>
  );
}
