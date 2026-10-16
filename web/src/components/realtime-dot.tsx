import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { type RealtimeStatus, useRealtimeStatus } from "@/lib/realtime";

const LABEL: Record<RealtimeStatus, string> = {
  open: "Realtime connected",
  connecting: "Realtime connecting…",
  closed: "Realtime disconnected — retrying",
};

const COLOR: Record<RealtimeStatus, string> = {
  open: "bg-emerald-500",
  connecting: "bg-amber-500 animate-pulse",
  closed: "bg-red-500",
};

/** Small status dot for the app header. */
export function RealtimeDot() {
  const status = useRealtimeStatus();
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="flex size-8 items-center justify-center" aria-label={LABEL[status]} role="status">
          <span className={`size-2 rounded-full ${COLOR[status]}`} />
        </span>
      </TooltipTrigger>
      <TooltipContent>{LABEL[status]}</TooltipContent>
    </Tooltip>
  );
}
