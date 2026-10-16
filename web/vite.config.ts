import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const API = "http://localhost:3000";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // VITE_* variables live in the repo-root .env next to the api's.
  envDir: "..",
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "src") },
  },
  build: {
    // One bundle is fine for a demo; silence the 500 kB advisory.
    chunkSizeWarningLimit: 1000,
  },
  server: {
    port: 5173,
    // Same-origin in dev too: the browser only ever talks to :5173, Vite
    // forwards /api (HTTP + WebSocket) and /docs to the api server. No CORS.
    proxy: {
      "/api": { target: API, ws: true },
      "/docs": { target: API },
    },
  },
});
