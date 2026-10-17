import type { Comparison, Mode, RouteResponse } from "./api";

function km(m: number): string {
  return `${(m / 1000).toFixed(1)} km`;
}

/**
 * Quantified tradeoff card (Pointz-style): fastest vs recommended side by side,
 * with an explicit "+X min" cost chip and the mode-specific gain underneath.
 * Renders nothing misleading when the backend leaves a field null.
 */
export function TradeoffCard({ data, mode }: { data: RouteResponse; mode: Mode }) {
  const { fastest, recommended, compare } = data;
  const c: Comparison = compare;

  return (
    <div className="grid gap-2">
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-md border p-2">
          <div className="text-xs text-muted-foreground">Fastest</div>
          <div className="text-lg font-semibold tabular-nums">{fastest.duration_min} min</div>
          <div className="text-xs text-muted-foreground">{km(fastest.distance_m)}</div>
        </div>
        <div className="rounded-md border p-2">
          <div className="text-xs text-muted-foreground">Recommended</div>
          <div className="text-lg font-semibold tabular-nums">{recommended.duration_min} min</div>
          <div className="mt-0.5">
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-900 dark:text-emerald-100">
              +{c.extra_min} min
            </span>
          </div>
        </div>
      </div>

      {mode === "green" ? (
        <GreeneryBars fastest={c.greenery_pct_fastest ?? 0} recommended={c.greenery_pct_recommended ?? 0} />
      ) : (
        <div className="text-sm">
          Risky segments{" "}
          <span className="font-semibold tabular-nums">
            {c.risky_segments_fastest ?? "–"} → {c.risky_segments_recommended ?? "–"}
          </span>{" "}
          <span className="text-xs text-muted-foreground">(fastest → safe)</span>
        </div>
      )}

      {c.noise_reduction_db != null && (
        <div className="text-xs text-muted-foreground">
          ≈ −{c.noise_reduction_db} dB traffic noise <span>(estimated)</span>
        </div>
      )}
    </div>
  );
}

function GreeneryBars({ fastest, recommended }: { fastest: number; recommended: number }) {
  const row = (label: string, pct: number, barClass: string) => (
    <div>
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-semibold tabular-nums">{pct}%</span>
      </div>
      <div className="mt-0.5 h-1.5 overflow-hidden rounded bg-muted">
        <div
          className={`h-full rounded ${barClass}`}
          style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
        />
      </div>
    </div>
  );
  return (
    <div className="grid gap-1.5">
      {row("Greenery · fastest", fastest, "bg-stone-400")}
      {row("Greenery · recommended", recommended, "bg-emerald-600")}
    </div>
  );
}
