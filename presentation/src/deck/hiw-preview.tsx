// TEMPORARY preview harness for the how-it-works slides. Delete before commit.
import { useEffect } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/m-plus-rounded-1c/latin-500.css";
import "@fontsource/m-plus-rounded-1c/latin-700.css";
import "@fontsource/m-plus-rounded-1c/latin-800.css";
import "../index.css";
import "./deck.css";
import { EveryStreetSlide, FeltDistanceSlide, HowWeBuiltSlide, ReadingStreetSlide, SpotsToStreetsSlide } from "./how-it-works";

function Preview() {
  useEffect(() => {
    const io = new IntersectionObserver(
      (es) => {
        for (const e of es) if (e.isIntersecting) e.target.classList.add("in");
      },
      { threshold: 0.45 },
    );
    for (const s of document.querySelectorAll(".slide")) io.observe(s);
    return () => io.disconnect();
  }, []);
  return (
    <main className="deck">
      <HowWeBuiltSlide />
      <EveryStreetSlide />
      <ReadingStreetSlide />
      <SpotsToStreetsSlide />
      <FeltDistanceSlide />
    </main>
  );
}

const el = document.getElementById("root");
if (el) createRoot(el).render(<Preview />);
