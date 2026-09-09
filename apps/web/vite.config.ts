import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
  },
  // Relative asset paths so the built SPA works both hosted at a domain
  // root (Vercel etc.) and loaded via file:// inside the Electron desktop
  // shell (apps/desktop) — an absolute "/assets/..." base breaks under
  // file://.
  base: "./",
});
