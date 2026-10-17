// Noir for Mac: a native app window around https://noirmusic.shop.
// The site itself is the app, so every Publish in Lovable shows up here instantly;
// this file only adds what a browser tab can't: Dock icon, menus, media keys,
// notifications, noir:// links, offline screen and auto-updates.
const { app, BrowserWindow, Menu, shell, session, dialog, screen } = require("electron");
const path = require("path");
const fs = require("fs");

const APP_URL = "https://noirmusic.shop";
const APP_HOSTS = new Set(["noirmusic.shop", "www.noirmusic.shop"]);
// Sign-in and payment pages that must stay inside the app window
// (Stripe checkout and payout setup, Google/Apple sign-in, Supabase auth redirects).
const IN_APP_HOSTS = [
  /(^|\.)noirmusic\.shop$/,
  /(^|\.)stripe\.com$/,
  /(^|\.)supabase\.co$/,
  /^accounts\.google\.com$/,
  /^appleid\.apple\.com$/,
];

let win = null;
let pendingUrl = null; // a noir:// link that arrived before the window existed

const isInApp = (url) => {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return false;
    return IN_APP_HOSTS.some((re) => re.test(u.hostname));
  } catch {
    return false;
  }
};

/** noir://artist/olmos -> https://noirmusic.shop/artist/olmos (same-site paths only). */
const fromDeepLink = (link) => {
  try {
    const u = new URL(link);
    if (u.protocol !== "noir:") return null;
    const p = `/${u.host}${u.pathname}`.replace(/\/+/g, "/").replace(/\/$/, "") || "/";
    return `${APP_URL}${p}${u.search}`;
  } catch {
    return null;
  }
};

// ---------- Window size memory ----------
const stateFile = () => path.join(app.getPath("userData"), "window-state.json");
function loadBounds() {
  try {
    const b = JSON.parse(fs.readFileSync(stateFile(), "utf8"));
    const onScreen = screen.getAllDisplays().some(({ workArea: a }) =>
      b.x >= a.x - 50 && b.y >= a.y - 50 && b.x < a.x + a.width && b.y < a.y + a.height);
    return onScreen ? b : { width: b.width, height: b.height };
  } catch {
    return { width: 1320, height: 860 };
  }
}
function saveBounds() {
  if (!win || win.isDestroyed() || win.isMinimized() || win.isFullScreen()) return;
  try { fs.writeFileSync(stateFile(), JSON.stringify(win.getBounds())); } catch { /* ignore */ }
}

// ---------- Main window ----------
function createWindow() {
  const bounds = loadBounds();
  win = new BrowserWindow({
    ...bounds,
    minWidth: 960,
    minHeight: 640,
    title: "Noir",
    backgroundColor: "#0B0B0C",
    show: false,
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      spellcheck: true,
    },
  });

  // Lets the site know it's running in the desktop app (e.g. hide "install the app" prompts).
  win.webContents.setUserAgent(`${win.webContents.getUserAgent()} NoirDesktop/${app.getVersion()}`);

  win.once("ready-to-show", () => win.show());
  win.on("resize", saveBounds);
  win.on("move", saveBounds);
  win.on("closed", () => { win = null; });

  // Links to other websites open in the person's normal browser, not inside Noir.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isInApp(url)) return { action: "allow", overrideBrowserWindowOptions: { backgroundColor: "#0B0B0C" } };
    if (/^https?:|^mailto:/.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (e, url) => {
    if (isInApp(url)) return;
    e.preventDefault();
    if (/^https?:|^mailto:/.test(url)) shell.openExternal(url);
  });

  // No internet: show a calm offline screen with a retry button instead of an error page.
  win.webContents.on("did-fail-load", (_e, code, _desc, url, isMainFrame) => {
    if (!isMainFrame || code === -3) return; // -3 = navigation cancelled, not a failure
    const retry = url && url.startsWith("http") ? url : APP_URL;
    win.loadFile(path.join(__dirname, "offline.html"), { query: { retry } });
  });

  win.loadURL(pendingUrl || APP_URL);
  pendingUrl = null;
}

function openInApp(url) {
  if (!url) return;
  if (!win) { pendingUrl = url; return; }
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
  win.loadURL(url);
}

// ---------- Permissions: notifications, and camera/mic for going Live ----------
function setupPermissions() {
  const allowed = new Set(["notifications", "media", "clipboard-sanitized-write", "fullscreen"]);
  session.defaultSession.setPermissionRequestHandler((wc, permission, callback) => {
    let host = "";
    try { host = new URL(wc.getURL()).hostname; } catch { /* ignore */ }
    callback(APP_HOSTS.has(host) && allowed.has(permission));
  });
}

// ---------- Menus ----------
function buildMenu() {
  const go = (p) => () => openInApp(`${APP_URL}${p}`);
  const template = [
    {
      label: "Noir",
      submenu: [
        { role: "about" },
        { label: "Check for Updates…", click: () => checkForUpdates(true) },
        { type: "separator" },
        { label: "Settings…", accelerator: "Cmd+,", click: go("/artist-plus?tab=settings") },
        { type: "separator" },
        { role: "services" },
        { type: "separator" },
        { role: "hide" }, { role: "hideOthers" }, { role: "unhide" },
        { type: "separator" },
        { role: "quit" },
      ],
    },
    { role: "editMenu" },
    {
      label: "Go",
      submenu: [
        { label: "Home", accelerator: "Cmd+Shift+H", click: go("/") },
        { label: "Feed", accelerator: "Cmd+1", click: go("/feed") },
        { label: "Browse", accelerator: "Cmd+2", click: go("/browse") },
        { label: "Live", accelerator: "Cmd+3", click: go("/live") },
        { label: "Studio", accelerator: "Cmd+4", click: go("/artist-plus?tab=dashboard") },
        { label: "Upload", accelerator: "Cmd+U", click: go("/artist/upload") },
        { type: "separator" },
        { label: "Back", accelerator: "Cmd+[", click: () => win?.webContents.navigationHistory?.canGoBack() && win.webContents.navigationHistory.goBack() },
        { label: "Forward", accelerator: "Cmd+]", click: () => win?.webContents.navigationHistory?.canGoForward() && win.webContents.navigationHistory.goForward() },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { type: "separator" },
        { role: "resetZoom" }, { role: "zoomIn" }, { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
        ...(app.isPackaged ? [] : [{ role: "toggleDevTools" }]),
      ],
    },
    { role: "windowMenu" },
    {
      role: "help",
      submenu: [
        { label: "Noir Website", click: () => shell.openExternal(APP_URL) },
        { label: "Contact Support", click: go("/contact") },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ---------- Auto-updates (from GitHub Releases) ----------
let updater = null;
function checkForUpdates(manual = false) {
  if (!app.isPackaged) {
    if (manual) dialog.showMessageBox({ message: "Updates are checked in the installed app only." });
    return;
  }
  try {
    if (!updater) {
      updater = require("electron-updater").autoUpdater;
      updater.autoDownload = true;
      updater.on("update-downloaded", async (info) => {
        const { response } = await dialog.showMessageBox({
          type: "info",
          buttons: ["Restart Now", "Later"],
          defaultId: 0,
          message: `Noir ${info.version} is ready`,
          detail: "Restart Noir to finish updating.",
        });
        if (response === 0) updater.quitAndInstall();
      });
      if (manual) {
        updater.once("update-not-available", () => dialog.showMessageBox({ message: "You're on the latest version of Noir." }));
      }
    }
    updater.checkForUpdates().catch(() => undefined);
  } catch {
    /* updates are best-effort; the app keeps working */
  }
}

// ---------- App lifecycle ----------
app.setName("Noir");
app.setAsDefaultProtocolClient("noir");

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", (_e, argv) => {
    const link = argv.find((a) => a.startsWith("noir://"));
    openInApp(link ? fromDeepLink(link) : null);
    if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
  });

  // macOS delivers noir:// links here, sometimes before the app is ready.
  app.on("open-url", (e, link) => {
    e.preventDefault();
    const url = fromDeepLink(link);
    if (app.isReady()) openInApp(url);
    else pendingUrl = url;
  });

  app.whenReady().then(() => {
    app.setAboutPanelOptions({
      applicationName: "Noir",
      applicationVersion: app.getVersion(),
      copyright: "Sound for the independents.",
      website: APP_URL,
    });
    setupPermissions();
    buildMenu();
    createWindow();
    checkForUpdates();
    setInterval(() => checkForUpdates(), 6 * 60 * 60 * 1000);

    // Clicking the Dock icon with no window open brings Noir back.
    app.on("activate", () => { if (!win) createWindow(); else win.show(); });
  });

  // Mac apps stay running when the window closes (like Spotify); Cmd+Q quits.
  app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
}
