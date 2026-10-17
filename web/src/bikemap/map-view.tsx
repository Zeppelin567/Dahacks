import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  MapContainer,
  Marker,
  Pane,
  Polyline,
  Popup,
  TileLayer,
  Tooltip,
  useMap,
  useMapEvents,
  ZoomControl,
} from "react-leaflet";
import type { LatLng, Level, Route, Segment } from "./api";
import { HazardLayer } from "./hazard-report";
import { SegmentVote } from "./segment-vote";
import { ACCENT, LEVEL_COLORS, TILES, type UiMode } from "./theme";
import type { Pin, TripPoint } from "./trip";

const CUPERTINO: LatLng = [37.318, -122.04];

type Props = {
  ui: UiMode;
  hazardArmed: boolean;
  onDisarmHazard: () => void;
  onVoteSegment?: (seg: Segment, like: boolean) => void;
  network?: Segment[];
  showNetwork: boolean;
  route?: Route;
  routeIsFresh: boolean;
  tripKey: string;
  start?: TripPoint;
  end?: TripPoint;
  pins: Pin[];
  showPins: boolean;
  selectedPinId?: string;
  selectedCoords?: LatLng[];
  clickAt: LatLng | null;
  flyTo: { at: LatLng; seq: number } | null;
  onMapClick: (at: LatLng | null) => void;
  onStreetClick: (at: LatLng) => void;
  onPinClick: (pin: Pin) => void;
  onSetStart: (at: LatLng) => void;
  onSetEnd: (at: LatLng) => void;
};

export function MapView(props: Props) {
  const { ui, route, start, end } = props;
  const [previous, setPrevious] = useState<Route>();
  const last = useRef<{ route?: Route; tripKey: string; ui: UiMode }>({ tripKey: props.tripKey, ui });
  useEffect(() => {
    if (last.current.tripKey !== props.tripKey || last.current.ui !== ui) {
      setPrevious(undefined);
      last.current = { tripKey: props.tripKey, ui };
    }
    if (props.routeIsFresh && route && last.current.route !== route) {
      setPrevious(last.current.route);
      last.current = { route, tripKey: props.tripKey, ui };
    }
  }, [route, props.routeIsFresh, props.tripKey, ui]);
  const colors = LEVEL_COLORS[ui];
  const accent = ACCENT[ui];

  return (
    <MapContainer center={CUPERTINO} zoom={14} className="size-full" zoomControl={false} preferCanvas>
      {/* Both basemaps stay mounted so the mode switch can crossfade between them. */}
      {(["modern", "nature"] as const).map((m) => (
        <TileLayer
          key={m}
          url={TILES[m].url}
          attribution={TILES[m].attribution}
          opacity={m === ui ? 1 : 0}
          zIndex={m === ui ? 2 : 1}
          className="bm-tiles"
          detectRetina
        />
      ))}
      <ZoomControl position="bottomright" />
      <ClickHandler onMapClick={props.onMapClick} />
      <HazardLayer armed={props.hazardArmed} onDisarm={props.onDisarmHazard} />
      <ResizeMap />
      <FlyTo target={props.flyTo} />
      <FitOnTrip tripKey={props.tripKey} coords={props.routeIsFresh ? route?.coords : undefined} />

      <Pane name="bm-network" style={{ zIndex: 390 }}>
        {props.showNetwork && props.network && (
          <NetworkLayer segments={props.network} colors={colors} onClick={props.onStreetClick} />
        )}
      </Pane>

      <Pane name="bm-previous-route" style={{ zIndex: 410 }}>
        {previous && (
          <Polyline
            positions={previous.coords}
            interactive={false}
            pathOptions={{ color: "#94a3b8", opacity: 0.5, weight: 6, dashArray: "8 8" }}
          />
        )}
      </Pane>
      <Pane name="bm-route" style={{ zIndex: 420 }}>
        <RouteLayer
          ui={ui}
          route={route}
          colors={colors}
          accent={accent}
          onClick={props.onStreetClick}
          onVote={props.routeIsFresh ? props.onVoteSegment : undefined}
        />
      </Pane>

      <Pane name="bm-select" style={{ zIndex: 430 }}>
        {props.selectedCoords && (
          <>
            <Polyline
              positions={props.selectedCoords}
              interactive={false}
              pathOptions={{ color: "#ffffff", weight: 12, opacity: 0.95, lineCap: "round" }}
            />
            <Polyline
              positions={props.selectedCoords}
              interactive={false}
              pathOptions={{ color: accent, weight: 6, opacity: 1, lineCap: "round" }}
            />
          </>
        )}
      </Pane>

      {props.showPins &&
        props.pins.map((p) => (
          <PinMarker key={p.id} pin={p} selected={p.id === props.selectedPinId} onClick={props.onPinClick} />
        ))}

      {start && <EndpointMarker point={start} kind="start" />}
      {end && <EndpointMarker point={end} kind="end" />}

      {props.clickAt && (
        <Popup position={props.clickAt} eventHandlers={{ remove: () => props.onMapClick(null) }}>
          <div className="grid gap-2">
            <div className="text-xs font-medium" style={{ color: "var(--bm-muted)" }}>
              Dropped pin
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                className="bm-btn"
                onClick={() => props.onSetStart(props.clickAt as LatLng)}
              >
                Start here
              </button>
              <button
                type="button"
                className="bm-btn bm-btn-primary"
                onClick={() => props.onSetEnd(props.clickAt as LatLng)}
              >
                Go here
              </button>
            </div>
          </div>
        </Popup>
      )}
    </MapContainer>
  );
}

function ResizeMap() {
  const map = useMap();
  useEffect(() => {
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(map.getContainer());
    return () => observer.disconnect();
  }, [map]);
  return null;
}

function ClickHandler({ onMapClick }: { onMapClick: (at: LatLng | null) => void }) {
  useMapEvents({ click: (e) => onMapClick([e.latlng.lat, e.latlng.lng]) });
  return null;
}

function FlyTo({ target }: { target: { at: LatLng; seq: number } | null }) {
  const map = useMap();
  useEffect(() => {
    if (target) map.flyTo(target.at, Math.max(map.getZoom(), 15), { duration: 0.8 });
  }, [map, target]);
  return null;
}

// Frame the route once per trip (not on every slider move), leaving room for the floating cards.
function FitOnTrip({ tripKey, coords }: { tripKey: string; coords?: LatLng[] }) {
  const map = useMap();
  const fitted = useRef<string | null>(null);
  useEffect(() => {
    if (!coords?.length || fitted.current === tripKey) return;
    fitted.current = tripKey;
    const wide = map.getSize().x >= 900;
    map.fitBounds(L.latLngBounds(coords), {
      paddingTopLeft: wide ? [360, 90] : [24, 170],
      paddingBottomRight: wide ? [400, 90] : [24, 120],
      maxZoom: 16,
    });
  }, [map, tripKey, coords]);
  return null;
}

// ~10k streets: plain Leaflet on one canvas, not one React component per street.
function NetworkLayer({
  segments,
  colors,
  onClick,
}: {
  segments: Segment[];
  colors: Record<Level, string>;
  onClick: (at: LatLng) => void;
}) {
  const map = useMap();
  const onClickRef = useRef(onClick);
  onClickRef.current = onClick;

  useEffect(() => {
    const renderer = L.canvas({ pane: "bm-network", tolerance: 6 });
    const group = L.featureGroup();
    for (const s of segments) {
      L.polyline(s.coords, {
        renderer,
        pane: "bm-network",
        color: colors[s.level],
        weight: 2,
        opacity: 0.5,
      }).addTo(group);
    }
    group.on("click", (e: L.LeafletMouseEvent) => {
      L.DomEvent.stopPropagation(e);
      onClickRef.current([e.latlng.lat, e.latlng.lng]);
    });
    group.addTo(map);
    return () => {
      group.remove();
      renderer.remove();
    };
  }, [map, segments, colors]);
  return null;
}

function RouteLayer({
  ui,
  route,
  colors,
  accent,
  onClick,
  onVote,
}: {
  ui: UiMode;
  route?: Route;
  colors: Record<Level, string>;
  accent: string;
  onVote?: (seg: Segment, like: boolean) => void;
  onClick: (at: LatLng) => void;
}) {
  const renderer = useMemo(() => L.canvas({ pane: "bm-route", tolerance: 8 }), []);
  if (!route) return null;
  const click = {
    click: (e: L.LeafletMouseEvent) => {
      L.DomEvent.stopPropagation(e);
      onClick([e.latlng.lat, e.latlng.lng]);
    },
  };
  return (
    <>
      <Polyline
        positions={route.coords}
        renderer={renderer}
        interactive={false}
        pathOptions={{
          color: ui === "modern" ? "#0b0d12" : "#ffffff",
          weight: 15,
          opacity: 0.9,
          lineCap: "round",
        }}
      />
      <Polyline
        positions={route.coords}
        renderer={renderer}
        interactive={false}
        pathOptions={{ color: accent, weight: 12, opacity: 0.5, lineCap: "round" }}
      />
      {route.segments.map((seg) => (
        <Polyline
          key={`${seg.coords[0]}-${seg.coords.length}-${seg.level}`}
          positions={seg.coords}
          renderer={renderer}
          eventHandlers={click}
          pathOptions={{
            color: colors[seg.level],
            weight: 7,
            opacity: 1,
            lineCap: "round",
            lineJoin: "round",
          }}
        >
          <Popup>
            <div className="grid gap-2">
              <strong>Segment score: {Math.round(seg.score * 100)}%</strong>
              {seg.reasons.map((reason) => (
                <div key={reason}>{reason}</div>
              ))}
              {onVote && <SegmentVote seg={seg} onVote={(like) => onVote(seg, like)} />}
            </div>
          </Popup>
        </Polyline>
      ))}
    </>
  );
}

function PinMarker({ pin, selected, onClick }: { pin: Pin; selected: boolean; onClick: (p: Pin) => void }) {
  const icon = useMemo(
    () =>
      L.divIcon({
        className: "bm-pin-icon",
        html: `<div class="bm-pin${selected ? " is-selected" : ""}">${pin.icon}</div>`,
        iconSize: [34, 34],
        iconAnchor: [17, 17],
      }),
    [pin.icon, selected],
  );
  return (
    <Marker
      position={[pin.lat, pin.lng]}
      icon={icon}
      zIndexOffset={selected ? 1000 : 0}
      eventHandlers={{ click: () => onClick(pin) }}
    >
      <Tooltip direction="top" offset={[0, -16]}>
        {pin.name}
      </Tooltip>
    </Marker>
  );
}

function EndpointMarker({ point, kind }: { point: TripPoint; kind: "start" | "end" }) {
  const icon = useMemo(
    () =>
      L.divIcon({
        className: "bm-pin-icon",
        html: `<div class="bm-endpoint bm-endpoint-${kind}">${kind === "start" ? "A" : "B"}</div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      }),
    [kind],
  );
  return (
    <Marker position={[point.lat, point.lng]} icon={icon} zIndexOffset={2000}>
      <Tooltip direction="top" offset={[0, -14]}>
        {kind === "start" ? "From" : "To"}: {point.name}
      </Tooltip>
    </Marker>
  );
}
