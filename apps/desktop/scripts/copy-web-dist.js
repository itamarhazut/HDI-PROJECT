// Copies the built apps/web SPA (apps/web/dist) into apps/desktop/web-dist,
// which is what main.js loads in a packaged build and what electron-builder
// picks up via the "files" list in package.json's "build" config.
//
// Run this only after `pnpm --filter @app/web build` — see the "build:win"
// script in package.json, which chains both steps together.
const fs = require("node:fs");
const path = require("node:path");

const src = path.join(__dirname, "..", "..", "web", "dist");
const dest = path.join(__dirname, "..", "web-dist");

if (!fs.existsSync(src)) {
  console.error(
    "apps/web/dist not found. Run `pnpm --filter @app/web build` first (the build:win script does this automatically)."
  );
  process.exit(1);
}

fs.rmSync(dest, { recursive: true, force: true });
fs.cpSync(src, dest, { recursive: true });
console.log(`Copied ${src} -> ${dest}`);
