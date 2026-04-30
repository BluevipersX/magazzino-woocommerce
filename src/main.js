const { app, BrowserWindow, ipcMain, dialog, Menu, shell } = require("electron");
const { autoUpdater } = require("electron-updater");
const path = require("path");
const fs = require("fs/promises");

let mainWindow;
let startupWindow;
let startupUpdateInProgress = false;
let updateState = "Aggiornamenti non controllati.";
const windowIcon = path.join(__dirname, "..", "build", "icon.ico");
const appLogo = path.join(__dirname, "..", "build", "icon.png");

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 1180,
    minHeight: 720,
    title: "Magazzino WooCommerce",
    icon: windowIcon,
    frame: false,
    backgroundColor: "#f4f7f5",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));
  mainWindow.on("maximize", () => mainWindow.webContents.send("window:maximized", true));
  mainWindow.on("unmaximize", () => mainWindow.webContents.send("window:maximized", false));
};

const createStartupWindow = () => {
  const iconDataUrl = `data:image/png;base64,${require("fs").readFileSync(appLogo).toString("base64")}`;
  startupWindow = new BrowserWindow({
    width: 460,
    height: 240,
    resizable: false,
    frame: false,
    show: true,
    title: "Controllo aggiornamenti",
    icon: windowIcon,
    backgroundColor: "#0d0d0d",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  startupWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          * { box-sizing: border-box; }
          body {
            margin: 0;
            width: 100vw;
            height: 100vh;
            display: grid;
            place-items: center;
            background: #0d0d0d;
            color: #f5f0e9;
            font-family: "Segoe UI", Arial, sans-serif;
            user-select: none;
          }
          main {
            width: 100%;
            padding: 28px;
            display: grid;
            gap: 14px;
            text-align: center;
          }
          img { width: 64px; height: 64px; margin: 0 auto; object-fit: contain; }
          h1 { margin: 0; color: #a6772f; font-size: 20px; }
          p { margin: 0; color: #d9cbc2; font-size: 13px; }
          .bar {
            width: 100%;
            height: 8px;
            overflow: hidden;
            border-radius: 999px;
            background: #2a2a2a;
          }
          .bar span {
            width: 42%;
            height: 100%;
            display: block;
            border-radius: inherit;
            background: #a6772f;
            animation: pulse 1.2s ease-in-out infinite alternate;
          }
          @keyframes pulse { from { transform: translateX(-20%); } to { transform: translateX(150%); } }
        </style>
      </head>
      <body>
        <main>
          <img src="${iconDataUrl}" alt="">
          <h1>Controllo aggiornamenti</h1>
          <p id="message">Preparazione avvio...</p>
          <div class="bar"><span></span></div>
        </main>
      </body>
    </html>
  `)}`);
};

function sendUpdateState(message) {
  updateState = message;
  if (startupWindow && !startupWindow.isDestroyed()) {
    startupWindow.webContents.executeJavaScript(
      `document.getElementById("message").textContent = ${JSON.stringify(message)};`
    ).catch(() => {});
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("updates:state", message);
  }
}

function setupAutoUpdates() {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("checking-for-update", () => {
    sendUpdateState("Controllo aggiornamenti...");
  });

  autoUpdater.on("update-available", (info) => {
    sendUpdateState(`Aggiornamento ${info.version} disponibile. Download in corso...`);
  });

  autoUpdater.on("update-not-available", () => {
    sendUpdateState("App aggiornata.");
    if (startupUpdateInProgress) openMainAfterStartupCheck();
  });

  autoUpdater.on("download-progress", (progress) => {
    sendUpdateState(`Download aggiornamento ${Math.round(progress.percent)}%.`);
  });

  autoUpdater.on("update-downloaded", async (info) => {
    sendUpdateState(`Aggiornamento ${info.version} pronto.`);
    if (startupUpdateInProgress) {
      autoUpdater.quitAndInstall(false, true);
      return;
    }
    const result = await dialog.showMessageBox(mainWindow, {
      type: "info",
      buttons: ["Riavvia e installa", "Dopo"],
      defaultId: 0,
      cancelId: 1,
      title: "Aggiornamento pronto",
      message: `La versione ${info.version} e stata scaricata.`,
      detail: "Riavvia l'app per installare subito l'aggiornamento."
    });

    if (result.response === 0) {
      autoUpdater.quitAndInstall(false, true);
    }
  });

  autoUpdater.on("error", (error) => {
    sendUpdateState(`Aggiornamenti non disponibili: ${error.message}`);
    if (startupUpdateInProgress) {
      setTimeout(openMainAfterStartupCheck, 1200);
    }
  });
}

async function checkForUpdates() {
  if (!app.isPackaged) {
    sendUpdateState("Aggiornamenti attivi nella versione installata.");
    return false;
  }

  sendUpdateState("Controllo aggiornamenti all'avvio...");
  await autoUpdater.checkForUpdates();
  return true;
}

function openMainAfterStartupCheck() {
  startupUpdateInProgress = false;
  if (!mainWindow || mainWindow.isDestroyed()) createWindow();
  if (startupWindow && !startupWindow.isDestroyed()) startupWindow.close();
  startupWindow = null;
}

async function checkForUpdatesBeforeStartup() {
  createStartupWindow();
  setupAutoUpdates();

  if (!app.isPackaged) {
    sendUpdateState("Aggiornamenti attivi nella versione installata.");
    setTimeout(openMainAfterStartupCheck, 800);
    return;
  }

  startupUpdateInProgress = true;
  sendUpdateState("Controllo aggiornamenti prima dell'avvio...");
  await autoUpdater.checkForUpdates();
}

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  checkForUpdatesBeforeStartup().catch((error) => {
    sendUpdateState(`Aggiornamenti non disponibili: ${error.message}`);
    setTimeout(openMainAfterStartupCheck, 1200);
  });
});

app.on("window-all-closed", () => {
  if (startupWindow && !startupWindow.isDestroyed()) return;
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

const configPath = () => path.join(app.getPath("userData"), "config.json");

async function readConfig() {
  try {
    const raw = await fs.readFile(configPath(), "utf8");
    return JSON.parse(raw);
  } catch {
    return { storeUrl: "", consumerKey: "", consumerSecret: "" };
  }
}

async function writeConfig(config) {
  const clean = {
    storeUrl: String(config.storeUrl || "").trim().replace(/\/+$/, ""),
    consumerKey: String(config.consumerKey || "").trim(),
    consumerSecret: String(config.consumerSecret || "").trim()
  };
  await fs.mkdir(path.dirname(configPath()), { recursive: true });
  await fs.writeFile(configPath(), JSON.stringify(clean, null, 2), "utf8");
  return clean;
}

function ensureConfig(config) {
  if (!config.storeUrl || !config.consumerKey || !config.consumerSecret) {
    throw new Error("Inserisci URL negozio, Consumer Key e Consumer Secret.");
  }
}

function authHeader(config) {
  return `Basic ${Buffer.from(`${config.consumerKey}:${config.consumerSecret}`).toString("base64")}`;
}

async function wooRequest(pathname, options = {}) {
  const config = await readConfig();
  ensureConfig(config);

  const url = new URL(`${config.storeUrl}/wp-json/wc/v3/${pathname.replace(/^\/+/, "")}`);
  if (options.query) {
    Object.entries(options.query).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, value);
    });
  }

  const response = await fetch(url, {
    method: options.method || "GET",
    headers: {
      Authorization: authHeader(config),
      "Content-Type": "application/json"
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!response.ok) {
    const message = data && data.message ? data.message : `Errore WooCommerce ${response.status}`;
    throw new Error(message);
  }

  return {
    data,
    total: Number(response.headers.get("x-wp-total") || 0),
    totalPages: Number(response.headers.get("x-wp-totalpages") || 1)
  };
}

function productRow(product, variation = null) {
  const item = variation || product;
  const stockQuantity = item.stock_quantity === null || item.stock_quantity === undefined ? "" : item.stock_quantity;
  const sku = item.sku || product.sku || "";
  const image = variation && variation.image && variation.image.src
    ? variation.image
    : (product.images && product.images.length ? product.images[0] : null);
  const name = variation
    ? `${product.name} - ${variation.attributes.map((attr) => attr.option).filter(Boolean).join(" / ")}`
    : product.name;

  return {
    id: item.id,
    parentId: variation ? product.id : null,
    type: variation ? "variation" : product.type,
    name,
    sku,
    imageUrl: image && image.src ? image.src : "",
    imageAlt: image && image.alt ? image.alt : name,
    regularPrice: item.regular_price || "",
    salePrice: item.sale_price || "",
    stockQuantity,
    stockStatus: item.stock_status || "",
    manageStock: Boolean(item.manage_stock),
    permalink: product.permalink || "",
    attributes: normalizeRowAttributes(product, variation)
  };
}

function normalizeSlug(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^pa_/, "")
    .replace(/[\s_-]+/g, "-");
}

function normalizeRowAttributes(product, variation = null) {
  const rows = [];

  for (const attr of product.attributes || []) {
    const key = normalizeSlug(attr.slug || attr.name);
    for (const option of attr.options || []) {
      rows.push({
        key,
        term: normalizeSlug(option),
        value: String(option || "")
      });
    }
  }

  for (const attr of (variation && variation.attributes) || []) {
    rows.push({
      key: normalizeSlug(attr.slug || attr.name),
      term: normalizeSlug(attr.option),
      value: String(attr.option || "")
    });
  }

  return rows;
}

function rowMatchesFilters(row, filters = {}) {
  const setTerm = normalizeSlug(filters.setTerm);
  const languageTerm = normalizeSlug(filters.languageTerm);
  const hasAttribute = (key, term) => !term || row.attributes.some((attr) => attr.key === key && attr.term === term);

  const hasLanguage = !languageTerm
    || hasAttribute("lingua", languageTerm)
    || hasAttribute("language", languageTerm);

  return hasAttribute("set", setTerm) && hasLanguage;
}

function findAttribute(attributes, wanted) {
  return attributes.find((attr) => {
    const slug = normalizeSlug(attr.slug || attr.name);
    const name = normalizeSlug(attr.name);
    return slug === wanted || name === wanted;
  });
}

async function getAttributeTerms(attribute) {
  if (!attribute) return [];
  const result = await wooRequest(`products/attributes/${attribute.id}/terms`, {
    query: { per_page: 100, orderby: "name", order: "asc" }
  });

  return (result.data || []).map((term) => ({
    id: term.id,
    name: term.name,
    slug: term.slug
  }));
}

ipcMain.handle("config:get", readConfig);
ipcMain.handle("config:save", async (_event, config) => writeConfig(config));
ipcMain.handle("updates:state", async () => updateState);
ipcMain.handle("updates:check", async () => checkForUpdates());
ipcMain.handle("window:minimize", () => mainWindow.minimize());
ipcMain.handle("window:toggle-maximize", () => {
  if (mainWindow.isMaximized()) mainWindow.unmaximize();
  else mainWindow.maximize();
  return mainWindow.isMaximized();
});
ipcMain.handle("window:close", () => mainWindow.close());
ipcMain.handle("window:is-maximized", () => mainWindow.isMaximized());
ipcMain.handle("app:quit", () => app.quit());
ipcMain.handle("app:open-repository", () => shell.openExternal("https://github.com/BluevipersX/magazzino-woocommerce"));
ipcMain.handle("app:show-help", () => dialog.showMessageBox(mainWindow, {
  type: "info",
  title: "Aiuto",
  message: "ATTACCATE AR CAZZO, AR CAZZO TE DEVI ATTACCÀ",
  buttons: ["OK"]
}));

ipcMain.handle("woo:test", async () => {
  await wooRequest("products", { query: { per_page: 1 } });
  return true;
});

ipcMain.handle("attributes:filters", async () => {
  const result = await wooRequest("products/attributes", { query: { per_page: 100 } });
  const attributes = result.data || [];
  const setAttribute = findAttribute(attributes, "set");
  const languageAttribute = findAttribute(attributes, "lingua") || findAttribute(attributes, "language");

  return {
    set: setAttribute ? {
      id: setAttribute.id,
      name: setAttribute.name,
      slug: setAttribute.slug,
      terms: await getAttributeTerms(setAttribute)
    } : null,
    language: languageAttribute ? {
      id: languageAttribute.id,
      name: languageAttribute.name,
      slug: languageAttribute.slug,
      terms: await getAttributeTerms(languageAttribute)
    } : null
  };
});

ipcMain.handle("products:list", async (_event, params = {}) => {
  const page = Math.max(Number(params.page || 1), 1);
  const search = String(params.search || "").trim();
  const stockStatus = String(params.stockStatus || "");
  const setTerm = String(params.setTerm || "").trim();
  const languageTerm = String(params.languageTerm || "").trim();
  const hasAttributeFilters = Boolean(setTerm || languageTerm);

  const rows = [];
  let total = 0;
  let totalPages = 1;
  const pagesToRead = hasAttributeFilters ? 10 : 1;

  for (let currentPage = 1; currentPage <= pagesToRead; currentPage += 1) {
    const result = await wooRequest("products", {
      query: {
        page: hasAttributeFilters ? currentPage : page,
        per_page: 100,
        search,
        status: "publish",
        stock_status: stockStatus
      }
    });

    total = result.total;
    totalPages = result.totalPages;

    for (const product of result.data || []) {
      if (product.type === "variable") {
        const variations = await wooRequest(`products/${product.id}/variations`, {
          query: { per_page: 100 }
        });
        for (const variation of variations.data || []) rows.push(productRow(product, variation));
      } else {
        rows.push(productRow(product));
      }
    }

    if (!hasAttributeFilters || currentPage >= result.totalPages) break;
  }

  const filteredRows = rows.filter((row) => rowMatchesFilters(row, { setTerm, languageTerm }));
  const pageSize = 100;
  const filteredPage = hasAttributeFilters ? page : 1;
  const pagedRows = hasAttributeFilters
    ? filteredRows.slice((filteredPage - 1) * pageSize, filteredPage * pageSize)
    : filteredRows;

  return {
    rows: pagedRows,
    page,
    total: hasAttributeFilters ? filteredRows.length : total,
    totalPages: hasAttributeFilters ? Math.max(Math.ceil(filteredRows.length / pageSize), 1) : totalPages
  };
});

ipcMain.handle("products:update", async (_event, row) => {
  const body = {
    regular_price: String(row.regularPrice ?? "").trim(),
    sale_price: String(row.salePrice ?? "").trim(),
    manage_stock: true,
    stock_quantity: row.stockQuantity === "" || row.stockQuantity === null ? null : Number(row.stockQuantity)
  };

  const endpoint = row.parentId
    ? `products/${row.parentId}/variations/${row.id}`
    : `products/${row.id}`;

  await wooRequest(endpoint, {
    method: "PUT",
    body
  });

  return true;
});
