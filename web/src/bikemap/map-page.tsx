import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Panel, PlacePicker, toLatLng, usePlaces } from "./controls";
import { bikemap, type GreenPrefs, type LatLng, type Mode, RouteMap, type RouteResponse } from "./index";
import { useTrip } from "./shell";

// Layout shared by both maps: control column on the left, map on the right.
// Each page passes its own controls (`children`) and stats (`stats`).
export function MapPage({
  mode,
  title,
  blurb,
  rural,
  prefs,
  showNetwork,
  children,
  stats,
}: {
  mode: Mode;
  title: string;
  blurb: string;
  rural?: number;
  prefs?: GreenPrefs;
  showNetwork: boolean;
  children?: ReactNode;
  stats: (r: RouteResponse) => ReactNode;
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
    queryKey: ["bikemap", "route", mode, start, end, rural, prefs],
    queryFn: () => bikemap.route({ start: start as LatLng, end: end as LatLng, mode, rural, prefs }),
    enabled: !!start && !!end,
    placeholderData: (prev) => prev, // keep the old route on screen while the slider moves
  });

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
          recommended={route.data?.recommended}
          start={start}
          end={end}
        />
      </section>
    </div>
  );
}
