import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    // Makes the app installable (Android "Add to Home Screen" prompt, iOS
    // via the apple-touch-icon/meta tags in index.html) and lets it keep
    // working — read-only, from cache — the moment a field visit loses
    // signal. `registerType: "autoUpdate"` refreshes the cached build
    // silently in the background instead of trapping the user on a stale
    // version behind an update prompt.
    //
    // NOTE: none of this makes the app installable from `pnpm dev`/
    // `pnpm dev:web` over plain http on the LAN — Android and iOS both
    // require a secure context (https, or literally "localhost") before
    // they'll offer to install a PWA. To actually try installing this on
    // a phone, build it (`pnpm build`) and serve the result somewhere
    // reachable over https (a real deploy, or a tool like ngrok/Cloudflare
    // Tunnel pointed at `pnpm preview` for a quick test).
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.ico", "apple-touch-icon.png"],
      manifest: {
        id: "./",
        name: "חזות חשמל — HDI PROJECT",
        short_name: "חזות חשמל",
        description: "ניהול עבודות, לקוחות, הצעות מחיר, חשבוניות, מלאי ומסמכים לעסק חשמלאות.",
        lang: "he",
        dir: "rtl",
        theme_color: "#1e3a8a",
        background_color: "#1e3a8a",
        display: "standalone",
        // Relative, not "/" — matches the app's own relative `base` below
        // (chosen originally so the same build also runs from file:// in
        // the Electron desktop shell), so the manifest resolves correctly
        // wherever the built site ends up being hosted from.
        start_url: "./",
        scope: "./",
        icons: [
          { src: "pwa-192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512.png", sizes: "512x512", type: "image/png" },
          { src: "maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        // Precache the built app shell (JS/CSS/HTML) plus icons/fonts so
        // it still opens offline; Supabase API calls themselves are never
        // cached — a job list from an hour ago presented as current would
        // be worse than no signal at all.
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
      },
      // Lets the service worker register in `pnpm dev`/`pnpm dev:web` too
      // (normally dev mode skips it) — useful for checking the install
      // prompt/offline shell locally before doing a real build.
      devOptions: {
        enabled: true,
      },
    }),
  ],
  server: {
    port: 5173,
  },
  // Relative asset paths so the built SPA works both hosted at a domain
  // root (Vercel etc.) and loaded via file:// inside the Electron desktop
  // shell (apps/desktop) — an absolute "/assets/..." base breaks under
  // file://.
  base: "./",
});
