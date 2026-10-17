import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useMemo, useRef } from "react";
import {
  MapContainer,
  Marker,
  Pane,
  Popup,
  TileLayer,
  Tooltip,
  useMap,
  useMapEvents,
  ZoomControl,
} from "react-leaflet";
import type { GreenLayers, LatLng, Level, Route, Segment } from "./api";
import { LEVEL_COLORS, TILES, type UiMode } from "./theme";
import { initial, type Pin, type TripPoint } from "./trip";

const CUPERTINO: LatLng = [37.318, -122.04];

// Every line and area shares ONE canvas. Leaflet only hit-tests the top canvas, so a separate
// canvas per layer made the risk streets under the route unclickable. Order, bottom to top:
// green areas < street trees < risk streets < route < selected street.
type Stack = {
  green?: L.FeatureGroup;
  trees?: L.FeatureGroup;
  network?: L.FeatureGroup;
  route?: L.FeatureGroup;
  select?: L.Polyline;
};

function restack(s: Stack) {
  s.route?.bringToFront();
  s.select?.bringToFront();
  s.trees?.bringToBack();
  s.green?.bringToBack();
}

type Props = {
  ui: UiMode;
  network?: Segment[];
  showNetwork: boolean;
  greenLayers?: GreenLayers;
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
  const colors = LEVEL_COLORS[ui];
  const renderer = useMemo(() => L.canvas({ pane: "bm-lines", tolerance: 6 }), []);
  const stack = useMemo<Stack>(() => ({}), []);

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
      <ClickHandler onMapClick={props.onMapClick} onStreetClick={props.onStreetClick} />
      <FlyTo target={props.flyTo} />
      <FitOnTrip tripKey={props.tripKey} coords={props.routeIsFresh ? route?.coords : undefined} />

      <Pane name="bm-lines" style={{ zIndex: 400 }}>
        {props.greenLayers && <GreenLayer layers={props.greenLayers} renderer={renderer} stack={stack} />}
        {props.showNetwork && props.network && (
          <NetworkLayer
            segments={props.network}
            colors={colors}
            renderer={renderer}
            stack={stack}
            onClick={props.onStreetClick}
          />
        )}
        <RouteLayer
          route={route}
          colors={colors}
          renderer={renderer}
          stack={stack}
          onClick={props.onStreetClick}
        />
        {props.selectedCoords && (
          <SelectLayer
            coords={props.selectedCoords}
            color={ui === "modern" ? "#eef2f7" : "#13261c"}
            renderer={renderer}
            stack={stack}
          />
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

// Left click: drop a pin (start / go here). Right click (long-press on a phone): the nearest
// street's card, in either mode, whether or not the street is coloured on the map.
function ClickHandler({
  onMapClick,
  onStreetClick,
}: {
  onMapClick: (at: LatLng | null) => void;
  onStreetClick: (at: LatLng) => void;
}) {
  useMapEvents({
    click: (e) => onMapClick([e.latlng.lat, e.latlng.lng]),
    contextmenu: (e) => onStreetClick([e.latlng.lat, e.latlng.lng]),
  });
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

type LayerProps = { renderer: L.Canvas; stack: Stack };

function streetClick(onClick: (at: LatLng) => void) {
  return (e: L.LeafletMouseEvent) => {
    L.DomEvent.stopPropagation(e); // a street click is not a "drop a pin here" click
    onClick([e.latlng.lat, e.latlng.lng]);
  };
}

// Parks and water from py/data/green_layers.json (baked by 1_build_graph.py). Street trees only
// from zoom 15 up, where 3,000 dots read as trees instead of noise. Nothing here takes clicks.
function GreenLayer({ layers, renderer, stack }: LayerProps & { layers: GreenLayers }) {
  const map = useMap();
  useEffect(() => {
    const areas = L.featureGroup();
    for (const ring of layers.parks)
      L.polygon(ring, {
        renderer,
        interactive: false,
        color: "#2f8f47",
        weight: 0.8,
        opacity: 0.45,
        fillColor: "#46b366",
        fillOpacity: 0.32,
      }).addTo(areas);
    for (const ring of layers.water)
      L.polygon(ring, {
        renderer,
        interactive: false,
        stroke: false,
        fillColor: "#5aa9e6",
        fillOpacity: 0.45,
      }).addTo(areas);
    areas.addTo(map);
    stack.green = areas;

    const trees = L.featureGroup(
      layers.trees.map((t) =>
        L.circleMarker(t, {
          renderer,
          interactive: false,
          radius: 2.2,
          stroke: false,
          fillColor: "#2f8f47",
          fillOpacity: 0.7,
        }),
      ),
    );
    const syncTrees = () => {
      const show = map.getZoom() >= 15;
      if (show && !map.hasLayer(trees)) {
        trees.addTo(map);
        stack.trees = trees;
      } else if (!show && map.hasLayer(trees)) {
        trees.remove();
        stack.trees = undefined;
      }
      restack(stack);
    };
    syncTrees();
    map.on("zoomend", syncTrees);
    return () => {
      map.off("zoomend", syncTrees);
      areas.remove();
      trees.remove();
      stack.green = undefined;
      stack.trees = undefined;
    };
  }, [map, layers, renderer, stack]);
  return null;
}

// ~10k streets: plain Leaflet, not one React component per street.
function NetworkLayer({
  segments,
  colors,
  renderer,
  stack,
  onClick,
}: LayerProps & { segments: Segment[]; colors: Record<Level, string>; onClick: (at: LatLng) => void }) {
  const map = useMap();
  const onClickRef = useRef(onClick);
  onClickRef.current = onClick;

  useEffect(() => {
    const group = L.featureGroup(
      segments.map((s) =>
        L.polyline(s.coords, { renderer, color: colors[s.level], weight: 2, opacity: 0.5 }),
      ),
    );
    group.on(
      "click",
      streetClick((at) => onClickRef.current(at)),
    );
    group.addTo(map);
    stack.network = group;
    restack(stack);
    return () => {
      group.remove();
      stack.network = undefined;
    };
  }, [map, segments, colors, renderer, stack]);
  return null;
}

function RouteLayer({
  route,
  colors,
  renderer,
  stack,
  onClick,
}: LayerProps & { route?: Route; colors: Record<Level, string>; onClick: (at: LatLng) => void }) {
  const map = useMap();
  const onClickRef = useRef(onClick);
  onClickRef.current = onClick;

  useEffect(() => {
    if (!route) return;
    const group = L.featureGroup(
      route.segments.map((seg) =>
        L.polyline(seg.coords, {
          renderer,
          color: colors[seg.level],
          weight: 7,
          opacity: 1,
          lineCap: "round",
          lineJoin: "round",
        }),
      ),
    );
    group.on(
      "click",
      streetClick((at) => onClickRef.current(at)),
    );
    group.addTo(map);
    stack.route = group;
    restack(stack);
    return () => {
      group.remove();
      stack.route = undefined;
    };
  }, [map, route, colors, renderer, stack]);
  return null;
}

function SelectLayer({ coords, color, renderer, stack }: LayerProps & { coords: LatLng[]; color: string }) {
  const map = useMap();
  useEffect(() => {
    const line = L.polyline(coords, {
      renderer,
      interactive: false,
      color,
      weight: 8,
      opacity: 1,
      lineCap: "round",
    });
    line.addTo(map);
    stack.select = line;
    restack(stack);
    return () => {
      line.remove();
      stack.select = undefined;
    };
  }, [map, coords, color, renderer, stack]);
  return null;
}

function PinMarker({ pin, selected, onClick }: { pin: Pin; selected: boolean; onClick: (p: Pin) => void }) {
  const icon = useMemo(
    () =>
      L.divIcon({
        className: "bm-pin-icon",
        html: pin.icon
          ? `<div class="bm-pin${selected ? " is-selected" : ""}">${pin.icon}</div>`
          : `<div class="bm-pin bm-pin-dot${selected ? " is-selected" : ""}"></div>`,
        iconSize: pin.icon ? [34, 34] : [18, 18],
        iconAnchor: pin.icon ? [17, 17] : [9, 9],
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
        // Start = "you are here" dot; end = the destination's first letter.
        html:
          kind === "start"
            ? '<div class="bm-endpoint bm-endpoint-start"></div>'
            : `<div class="bm-endpoint bm-endpoint-end">${initial(point.name)}</div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      }),
    [kind, point.name],
  );
  return (
    <Marker position={[point.lat, point.lng]} icon={icon} zIndexOffset={2000}>
      <Tooltip direction="top" offset={[0, -14]}>
        {kind === "start" ? "You" : "To"}: {point.name}
      </Tooltip>
    </Marker>
  );
}
