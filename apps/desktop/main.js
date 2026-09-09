// Electron main process for the HDI Project desktop app.
//
// This window is a thin shell: it just loads the same apps/web SPA that
// runs in the browser (built to web-dist/ before packaging — see
// scripts/copy-web-dist.js), talking directly to Supabase over the
// network exactly like the browser version does. No Node integration is
// exposed to the page (contextIsolation: true, nodeIntegration: false) —
// there's no reason for the web app to need OS-level access yet, and
// keeping that door closed is the safe default.
const { app, BrowserWindow, Menu, shell } = require("electron");
const path = require("node:path");

const isDev = !app.isPackaged;
const DEV_SERVER_URL = "http://localhost:5173";

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    title: "HDI Project",
    icon: path.join(__dirname, "resources", "icon.ico"),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // Open http(s) links (e.g. an invoice's external_url) in the user's
  // regular browser instead of inside the app window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http://") || url.startsWith("https://")) {
      void shell.openExternal(url);
    }
    return { action: "deny" };
  });

  if (isDev) {
    void win.loadURL(DEV_SERVER_URL);
    win.webContents.openDevTools({ mode: "detach" });
  } else {
    void win.loadFile(path.join(__dirname, "web-dist", "index.html"));
  }
}

app.whenReady().then(() => {
  // A plain business app doesn't need Electron's default File/Edit/View
  // menu bar — removing it makes the window read as a real installed
  // program instead of "a browser with no address bar".
  Menu.setApplicationMenu(null);

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
