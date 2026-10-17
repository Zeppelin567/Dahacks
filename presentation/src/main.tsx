import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/m-plus-rounded-1c/latin-500.css";
import "@fontsource/m-plus-rounded-1c/latin-700.css";
import "@fontsource/m-plus-rounded-1c/latin-800.css";
import pixelPip from "../../web/public/pip/favicon.png";
import "@/index.css";
import Presentation from "@/presentation";

// Pip's pixel favicon, shared with the website.
const icon = document.createElement("link");
icon.rel = "icon";
icon.type = "image/png";
icon.href = pixelPip;
document.head.appendChild(icon);

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("#root not found");

// The deck is the whole app: every path shows it.
createRoot(rootEl).render(
  <StrictMode>
    <Presentation />
  </StrictMode>,
);
