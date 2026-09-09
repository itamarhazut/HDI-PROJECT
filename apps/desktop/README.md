# HDI Project — Desktop (Electron)

A thin Electron shell around `apps/web`'s built SPA. It doesn't run its own
backend — it talks directly to the same Supabase project as the browser
version, using whatever `apps/web/.env.local` had at build time (Vite
inlines those values into the built JS, so `apps/web` must already be
configured — see the root `SETUP.md` — before building the installer here).

## Building the Windows installer

Run this on a real Windows machine (not this sandbox) with the repo already
set up (`pnpm install` at the repo root, `apps/web/.env.local` filled in):

```
pnpm install
pnpm --filter @app/desktop build:win
```

This chains three steps automatically:
1. `pnpm --filter @app/web build` — builds the web app to `apps/web/dist`.
2. `scripts/copy-web-dist.js` — copies that into `apps/desktop/web-dist`.
3. `electron-builder --win` — packages an NSIS installer.

The first run downloads Electron's own binaries and NSIS build tools (a few
hundred MB, cached afterward), so it needs internet access and a few
minutes. The result lands in `apps/desktop/release/`, e.g.
`HDI Project Setup 0.1.0.exe`. Double-clicking it installs the app with a
Start Menu entry and (optionally) a desktop shortcut — a real installed
program, not a browser tab.

Because the installer isn't code-signed (that requires a paid certificate),
Windows SmartScreen will likely show "Windows protected your PC" the first
time it runs. That's expected for an unsigned installer — click **More
info** → **Run anyway**. Getting rid of that warning later means buying a
code-signing certificate; not needed for internal/personal use.

## Local development

`pnpm --filter @app/desktop dev` opens the Electron shell pointed at the
Vite dev server (`http://localhost:5173`), so `apps/web`'s dev server must
already be running (`pnpm dev:web` in another terminal) first.

## Icon / branding

`resources/icon.ico` is a placeholder (a generic bolt icon) generated for
this build — swap it for a real logo once one exists. It needs to stay a
multi-resolution `.ico` (16–256px) for Windows to pick the right size in
different places (taskbar, Start Menu, installer). Re-run
`pnpm --filter @app/desktop build:win` after replacing it.
