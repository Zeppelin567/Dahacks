import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { bikemap, type LatLng, LEVEL_COLORS_BY_MODE, type Level, type Mode, type Place } from "./index";

export function usePlaces() {
  return useQuery({
    queryKey: ["bikemap", "places"],
    queryFn: bikemap.places,
    staleTime: Number.POSITIVE_INFINITY,
  });
}

export function toLatLng(p?: Place): LatLng | undefined {
  return p ? [p.lat, p.lng] : undefined;
}

export function PlacePicker({
  label,
  value,
  onChange,
  places,
}: {
  label: string;
  value: string;
  onChange: (id: string) => void;
  places: Place[];
}) {
  return (
    <label className="grid gap-1 text-sm">
      <span className="font-medium">{label}</span>
      <select
        className="h-9 rounded-md border bg-background px-2"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {places.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
    </label>
  );
}

export function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card className="gap-3 py-4">
      <CardHeader className="px-4">
        <CardTitle className="text-sm">{title}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 px-4">{children}</CardContent>
    </Card>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="rounded-md border p-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold tabular-nums">{value}</div>
      {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

export function Legend({ mode, labels }: { mode: Mode; labels: Record<Level, string> }) {
  const colors = LEVEL_COLORS_BY_MODE[mode];
  return (
    <div className="flex flex-wrap gap-3 text-xs">
      {(Object.keys(labels) as Level[]).map((lvl) => (
        <span key={lvl} className="flex items-center gap-1">
          <span className="inline-block h-1.5 w-5 rounded" style={{ background: colors[lvl] }} />
          {labels[lvl]}
        </span>
      ))}
    </div>
  );
}
