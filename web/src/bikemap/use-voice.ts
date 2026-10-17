import { useCallback, useEffect, useRef, useState } from "react";
import type { Route } from "./api";
import { buildInstructions } from "./route-utils";

/** A spoken route overview, not GPS-triggered turn navigation. */
export function useRouteVoice(route?: Route) {
  const supported = typeof window !== "undefined" && "speechSynthesis" in window;
  const [speaking, setSpeaking] = useState(false);
  const [error, setError] = useState<string>();
  const generation = useRef(0);
  const utterance = useRef<SpeechSynthesisUtterance | null>(null);
  const stop = useCallback(() => {
    generation.current += 1;
    if (supported) window.speechSynthesis.cancel();
    utterance.current = null;
    setSpeaking(false);
  }, [supported]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new route must cancel the previous overview
  useEffect(() => {
    stop();
    return stop;
  }, [route, stop]);
  const toggle = () => {
    if (speaking) return stop();
    if (!supported || !route?.segments.length) return;
    stop();
    setError(undefined);
    const id = generation.current;
    const steps = buildInstructions(route);
    let index = 0;
    const next = () => {
      if (generation.current !== id) return;
      if (index >= steps.length) {
        setSpeaking(false);
        return;
      }
      const u = new SpeechSynthesisUtterance(steps[index++]);
      u.lang = "en-US";
      utterance.current = u;
      u.onend = next;
      u.onerror = () => {
        if (generation.current !== id) return;
        setSpeaking(false);
        setError("Audio couldn't start. Try Listen again.");
      };
      window.speechSynthesis.speak(u);
    };
    setSpeaking(true);
    next();
  };
  return { supported, speaking, toggle, stop, error };
}
