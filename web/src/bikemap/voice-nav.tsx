import { useEffect, useRef, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Route } from "./api";
import { buildInstructions } from "./route-utils";

/**
 * Voice turn-by-turn via the Web Speech API (Pointz-style "turn up the volume").
 * Speaks one utterance per route segment, sequentially. No dependencies.
 */
export function VoiceNavButton({ route }: { route?: Route }) {
  const [speaking, setSpeaking] = useState(false);
  const stopRef = useRef(false);
  // Chrome GC bug: a queued utterance with no live JS reference can be
  // garbage-collected mid-speech and go silent. Keep one around.
  const utterRef = useRef<SpeechSynthesisUtterance | null>(null);

  useEffect(() => {
    return () => {
      stopRef.current = true;
      try {
        window.speechSynthesis?.cancel();
      } catch {
        // speechSynthesis unavailable — nothing to cancel
      }
    };
  }, []);

  const toggle = () => {
    let synth: SpeechSynthesis | undefined;
    try {
      synth = window.speechSynthesis;
    } catch {
      synth = undefined;
    }
    if (!synth || !route || route.segments.length === 0) return;

    if (speaking) {
      stopRef.current = true;
      synth.cancel();
      setSpeaking(false);
      return;
    }

    const engine = synth;
    stopRef.current = false;
    setSpeaking(true);
    const steps = buildInstructions(route);
    let i = 0;
    const speakNext = () => {
      if (stopRef.current || i >= steps.length) {
        setSpeaking(false);
        return;
      }
      const u = new SpeechSynthesisUtterance(steps[i]);
      i += 1;
      utterRef.current = u; // see GC note above
      u.onend = speakNext;
      u.onerror = () => setSpeaking(false);
      engine.speak(u);
    };
    // Chrome loads voices asynchronously; wait for them if needed.
    if (engine.getVoices().length > 0) {
      speakNext();
    } else {
      engine.onvoiceschanged = () => speakNext();
    }
  };

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={!route}
      onClick={toggle}
      aria-pressed={speaking}
    >
      {speaking ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
      {speaking ? "Stop voice" : "Voice nav"}
    </Button>
  );
}
