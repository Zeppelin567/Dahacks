import { ThumbsDown, ThumbsUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Segment } from "./api";

/**
 * BikeButler-style segment voting. Renders nothing until the backend ships
 * per-segment `features` (see INTEGRATION.md) — graceful degradation.
 */
export function SegmentVote({
  seg,
  onVote,
}: {
  seg: Segment;
  onVote: (like: boolean) => void;
}) {
  if (!seg.features) return null;
  return (
    <div className="mt-1 flex items-center gap-1">
      <span className="text-xs text-muted-foreground">This segment:</span>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-7"
        aria-label="Like this segment"
        onClick={() => onVote(true)}
      >
        <ThumbsUp className="size-3.5" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-7"
        aria-label="Dislike this segment"
        onClick={() => onVote(false)}
      >
        <ThumbsDown className="size-3.5" />
      </Button>
    </div>
  );
}
