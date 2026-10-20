import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const API = "http://localhost:3000";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@mvp/shared": path.resolve(import.meta.dirname, "../shared/src"),
    },
    dedupe: ["react", "react-dom"],
  },
  server: {
    port: 5174,
    proxy: {
      "/api": { target: API, ws: true },
      "/docs": { target: API },
    },
  },
  build: {
    chunkSizeWarningLimit: 2500,
  },
});
