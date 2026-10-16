import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Panel, PlacePicker, toLatLng, usePlaces } from "./controls";
import {
  bikemap,
  type GreenPrefs,
  type LatLng,
  type Mode,
  RouteMap,
  type Route,
  type RouteResponse,
  type Segment,
} from "./index";
import { useTrip } from "./shell";

// Layout shared by both maps: control column on the left, map on the right.
// Each page passes its own controls (`children`) and stats (`stats`).
export function MapPage({
  mode,
  title,
  blurb,
  rural,
  prefs,
  prefOverride,
  showNetwork,
  children,
  stats,
  onVoteSegment,
}: {
  mode: Mode;
  title: string;
  blurb: string;
  rural?: number;
  prefs?: GreenPrefs;
  /** Direct [-5,5] preference vector; overrides the slider mapping when set. */
  prefOverride?: Record<string, number>;
  showNetwork: boolean;
  children?: ReactNode;
  stats: (r: RouteResponse) => ReactNode;
  onVoteSegment?: (seg: Segment, like: boolean) => void;
}) {
  const { startId, endId, setStartId, setEndId } = useTrip();
  const places = usePlaces();
  const start = toLatLng(places.data?.find((p) => p.id === startId));
  const end = toLatLng(places.data?.find((p) => p.id === endId));

  const network = useQuery({
    queryKey: ["bikemap", "network", mode],
    queryFn: () => bikemap.network(mode),
    staleTime: Number.POSITIVE_INFINITY,
  });
  const route = useQuery({
    queryKey: ["bikemap", "route", mode, start, end, rural, prefs, prefOverride],
    queryFn: () =>
      bikemap.route({
        start: start as LatLng,
        end: end as LatLng,
        mode,
        rural,
        prefs,
        ...(prefOverride ? { pref_override: prefOverride } : {}),
      }),
    enabled: !!start && !!end,
    placeholderData: (prev) => prev, // keep the old route on screen while the slider moves
  });

  // Faded previous route for instant A/B comparison (BikeButler-style).
  // placeholderData keeps route.data on the OLD object while refetching, so a
  // change of identity here always means fresh data has arrived.
  const [prevRecommended, setPrevRecommended] = useState<Route | null>(null);
  const lastRef = useRef<Route | undefined>(undefined);
  const tripKey = `${startId}|${endId}`;
  useEffect(() => {
    setPrevRecommended(null);
    lastRef.current = undefined;
  }, [tripKey]);
  const recommended = route.data?.recommended;
  useEffect(() => {
    if (recommended && lastRef.current && recommended !== lastRef.current) {
      setPrevRecommended(lastRef.current);
    }
    lastRef.current = recommended;
  }, [recommended]);

  const mock = route.data?.mock || network.data?.mock;
  const error = places.error ?? route.error ?? network.error;

  return (
    <div className="grid h-full grid-cols-[340px_1fr]">
      <aside className="grid content-start gap-3 overflow-y-auto border-r p-3">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-semibold">
            {title} {mock && <Badge variant="outline">MOCK DATA</Badge>}
          </h1>
          <p className="text-sm text-muted-foreground">{blurb}</p>
        </div>

        <Panel title="Trip">
          {places.data && (
            <>
              <PlacePicker label="From" value={startId} onChange={setStartId} places={places.data} />
              <PlacePicker label="To" value={endId} onChange={setEndId} places={places.data} />
            </>
          )}
        </Panel>

        {children}

        {route.data && <Panel title="Fastest vs recommended">{stats(route.data)}</Panel>}

        {error && (
          <p className="rounded-md border border-destructive p-2 text-sm text-destructive">
            {error.message} — is the Python service running? (<code>npm run dev:py</code>)
          </p>
        )}
      </aside>

      <section className="min-h-0">
        <RouteMap
          mode={mode}
          network={network.data?.segments}
          showNetwork={showNetwork}
          fastest={route.data?.fastest}
          recommended={recommended}
          prevRecommended={prevRecommended}
          start={start}
          end={end}
          onVoteSegment={onVoteSegment}
        />
      </section>
    </div>
  );
}
