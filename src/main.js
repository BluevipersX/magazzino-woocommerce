const { app, BrowserWindow, ipcMain, dialog, Menu, shell } = require("electron");
const { autoUpdater } = require("electron-updater");
const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs/promises");

let mainWindow;
let startupWindow;
let startupUpdateInProgress = false;
let updateState = "Aggiornamenti non controllati.";
const windowIcon = path.join(__dirname, "..", "build", "icon.ico");
const appLogo = path.join(__dirname, "..", "build", "icon.png");
const latestYmlUrl = "https://github.com/BluevipersX/magazzino-woocommerce/releases/latest/download/latest.yml";
let attributeFilterCache = null;
let productCacheStatus = {
  syncing: false,
  complete: false,
  cached: 0,
  total: 0,
  rows: 0,
  downloadedBytes: 0,
  estimatedTotalBytes: 0,
  bytesPerSecond: 0,
  etaSeconds: 0,
  message: "Cache prodotti non inizializzata."
};
let productCachePromise = null;
const preloadingPages = new Set();
let productCacheStats = {
  startedAt: 0,
  downloadedBytes: 0
};
const diagnosticLog = [];
const productFields = [
  "id",
  "type",
  "name",
  "sku",
  "images",
  "regular_price",
  "sale_price",
  "stock_quantity",
  "stock_status",
  "manage_stock",
  "permalink",
  "date_modified_gmt",
  "attributes"
].join(",");
const variationFields = [
  "id",
  "sku",
  "image",
  "regular_price",
  "sale_price",
  "stock_quantity",
  "stock_status",
  "manage_stock",
  "date_modified_gmt",
  "attributes"
].join(",");

function addDiagnostic(event, detail = "") {
  const entry = {
    time: new Date().toISOString(),
    event,
    detail: String(detail || "").replace(/(consumer_(key|secret)|ck_[a-z0-9]+|cs_[a-z0-9]+)/gi, "[redatto]")
  };
  diagnosticLog.push(entry);
  if (diagnosticLog.length > 200) diagnosticLog.splice(0, diagnosticLog.length - 200);
}

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
  addDiagnostic("updates", message);
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
    sendUpdateState(`Controllo update non riuscito: ${friendlyUpdateError(error)}`);
    if (startupUpdateInProgress) {
      setTimeout(openMainAfterStartupCheck, 1200);
    }
  });
}

function parseVersion(value) {
  return String(value || "")
    .replace(/^v/i, "")
    .split(".")
    .map((part) => Number.parseInt(part, 10) || 0);
}

function compareVersions(a, b) {
  const left = parseVersion(a);
  const right = parseVersion(b);
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const diff = (left[index] || 0) - (right[index] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function friendlyUpdateError(error) {
  const message = String(error && error.message ? error.message : error || "");
  if (message.includes("403")) return "GitHub temporaneamente non disponibile.";
  if (message.includes("404")) return "release non ancora pronta.";
  if (message.toLowerCase().includes("fetch failed")) return "connessione a GitHub non riuscita.";
  return message || "errore sconosciuto.";
}

function parseLatestYmlVersion(text) {
  const match = String(text || "").match(/^version:\s*["']?([^"'\r\n]+)["']?/m);
  return match ? match[1].trim() : "";
}

async function getLatestPublishedVersion() {
  const response = await fetch(latestYmlUrl, {
    headers: {
      "Accept": "text/yaml, text/plain, */*",
      "User-Agent": "Magazzino-WooCommerce"
    }
  });

  if (!response.ok) {
    throw new Error(`GitHub latest.yml ${response.status}`);
  }

  const latestVersion = parseLatestYmlVersion(await response.text());
  if (!latestVersion) throw new Error("latest.yml senza versione");
  return latestVersion;
}

async function configureHighestReleaseFeed() {
  const latestVersion = await getLatestPublishedVersion();
  const currentVersion = app.getVersion();
  if (compareVersions(latestVersion, currentVersion) <= 0) {
    sendUpdateState("App aggiornata.");
    return false;
  }

  const releaseFeedUrl = `https://github.com/BluevipersX/magazzino-woocommerce/releases/download/v${latestVersion}/`;
  autoUpdater.setFeedURL({
    provider: "generic",
    url: releaseFeedUrl
  });
  sendUpdateState(`Aggiornamento ${latestVersion} disponibile. Download in corso...`);
  return true;
}

async function checkForUpdates() {
  if (!app.isPackaged) {
    sendUpdateState("Aggiornamenti attivi nella versione installata.");
    return false;
  }

  sendUpdateState("Controllo aggiornamenti all'avvio...");
  const hasRemoteUpdate = await configureHighestReleaseFeed();
  if (!hasRemoteUpdate) return false;
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
  const hasRemoteUpdate = await configureHighestReleaseFeed();
  if (!hasRemoteUpdate) {
    setTimeout(openMainAfterStartupCheck, 800);
    return;
  }
  await autoUpdater.checkForUpdates();
}

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  checkForUpdatesBeforeStartup().catch((error) => {
    sendUpdateState(`Controllo update non riuscito: ${friendlyUpdateError(error)}`);
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
const productCachePath = () => path.join(app.getPath("userData"), "products-cache.json");
const productCacheBackupPath = () => path.join(app.getPath("userData"), "products-cache.json.backup");
const productCacheDbPath = () => path.join(app.getPath("userData"), "products-cache.sqlite");
const changeHistoryPath = () => path.join(app.getPath("userData"), "change-history.json");
let productDb = null;

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

function productRowTerms(row = {}, wantedKeys = []) {
  return (row.attributes || [])
    .filter((attr) => wantedKeys.includes(attr.key))
    .map((attr) => attr.term)
    .filter(Boolean)
    .join(" ");
}

function serializeCacheRow(row = {}) {
  const cachePage = row.cachePage === null || row.cachePage === undefined || row.cachePage === ""
    ? null
    : Number(row.cachePage);
  return {
    rowKey: rowKey(row),
    id: Number(row.id || 0),
    parentId: row.parentId === null || row.parentId === undefined || row.parentId === "" ? null : Number(row.parentId),
    type: String(row.type || ""),
    name: String(row.name || ""),
    sku: String(row.sku || ""),
    imageUrl: String(row.imageUrl || ""),
    imageAlt: String(row.imageAlt || ""),
    regularPrice: String(row.regularPrice ?? ""),
    salePrice: String(row.salePrice ?? ""),
    stockQuantity: String(row.stockQuantity ?? ""),
    stockStatus: String(row.stockStatus || ""),
    manageStock: row.manageStock ? 1 : 0,
    permalink: String(row.permalink || ""),
    modifiedAt: String(row.modifiedAt || ""),
    cachePage,
    searchIndex: rowSearchIndex(row),
    setTerms: productRowTerms(row, ["set"]),
    languageTerms: productRowTerms(row, ["lingua", "language"]),
    attributesJson: JSON.stringify(row.attributes || [])
  };
}

function deserializeCacheRow(row = {}) {
  let attributes = [];
  try {
    attributes = row.attributesJson ? JSON.parse(row.attributesJson) : [];
  } catch {
    attributes = [];
  }

  return {
    id: row.id,
    parentId: row.parentId,
    type: row.type || "",
    name: row.name || "",
    sku: row.sku || "",
    imageUrl: row.imageUrl || "",
    imageAlt: row.imageAlt || "",
    regularPrice: row.regularPrice || "",
    salePrice: row.salePrice || "",
    stockQuantity: row.stockQuantity || "",
    stockStatus: row.stockStatus || "",
    manageStock: Boolean(row.manageStock),
    permalink: row.permalink || "",
    modifiedAt: row.modifiedAt || "",
    attributes,
    cachePage: row.cachePage,
    searchIndex: row.searchIndex || ""
  };
}

function getProductDb() {
  if (productDb) return productDb;
  productDb = new Database(productCacheDbPath());
  productDb.pragma("journal_mode = WAL");
  productDb.pragma("synchronous = NORMAL");
  productDb.exec(`
    CREATE TABLE IF NOT EXISTS cache_meta (
      key TEXT PRIMARY KEY,
      value TEXT
    );
    CREATE TABLE IF NOT EXISTS cached_pages (
      page INTEGER PRIMARY KEY
    );
    CREATE TABLE IF NOT EXISTS product_rows (
      row_key TEXT PRIMARY KEY,
      id INTEGER NOT NULL,
      parent_id INTEGER,
      type TEXT,
      name TEXT,
      sku TEXT,
      image_url TEXT,
      image_alt TEXT,
      regular_price TEXT,
      sale_price TEXT,
      stock_quantity TEXT,
      stock_status TEXT,
      manage_stock INTEGER,
      permalink TEXT,
      modified_at TEXT,
      cache_page INTEGER,
      search_index TEXT,
      set_terms TEXT,
      language_terms TEXT,
      attributes_json TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_product_rows_id ON product_rows(id);
    CREATE INDEX IF NOT EXISTS idx_product_rows_parent_id ON product_rows(parent_id);
    CREATE INDEX IF NOT EXISTS idx_product_rows_sku ON product_rows(sku);
    CREATE INDEX IF NOT EXISTS idx_product_rows_name ON product_rows(name);
    CREATE INDEX IF NOT EXISTS idx_product_rows_cache_page ON product_rows(cache_page);
    CREATE INDEX IF NOT EXISTS idx_product_rows_stock_status ON product_rows(stock_status);
    CREATE INDEX IF NOT EXISTS idx_product_rows_modified_at ON product_rows(modified_at);
    CREATE INDEX IF NOT EXISTS idx_product_rows_search_index ON product_rows(search_index);
    CREATE INDEX IF NOT EXISTS idx_product_rows_set_terms ON product_rows(set_terms);
    CREATE INDEX IF NOT EXISTS idx_product_rows_language_terms ON product_rows(language_terms);
  `);
  return productDb;
}

function setCacheMeta(db, key, value) {
  db.prepare("INSERT OR REPLACE INTO cache_meta (key, value) VALUES (?, ?)").run(key, String(value ?? ""));
}

function getCacheMeta(db, key, fallback = "") {
  const row = db.prepare("SELECT value FROM cache_meta WHERE key = ?").get(key);
  return row ? row.value : fallback;
}

async function readJsonProductCache() {
  try {
    const raw = await fs.readFile(productCachePath(), "utf8");
    const cache = JSON.parse(raw);
    return {
      storeUrl: "",
      complete: false,
      total: 0,
      processedProducts: 0,
      rows: [],
      cachedPages: [],
      updatedAt: "",
      ...cache,
      cachedPages: Array.isArray(cache.cachedPages) ? cache.cachedPages : []
    };
  } catch {
    return { storeUrl: "", complete: false, total: 0, processedProducts: 0, rows: [], cachedPages: [], updatedAt: "" };
  }
}

function rowsFromDb(db) {
  return db.prepare(`
    SELECT
      id,
      parent_id AS parentId,
      type,
      name,
      sku,
      image_url AS imageUrl,
      image_alt AS imageAlt,
      regular_price AS regularPrice,
      sale_price AS salePrice,
      stock_quantity AS stockQuantity,
      stock_status AS stockStatus,
      manage_stock AS manageStock,
      permalink,
      modified_at AS modifiedAt,
      cache_page AS cachePage,
      search_index AS searchIndex,
      attributes_json AS attributesJson
    FROM product_rows
    ORDER BY COALESCE(cache_page, 999999), name COLLATE NOCASE, id
  `).all().map(deserializeCacheRow);
}

function cachedPagesFromDb(db) {
  return db.prepare("SELECT page FROM cached_pages ORDER BY page").all().map((row) => row.page);
}

function cacheFromDb(includeRows = true) {
  const db = getProductDb();
  const rows = includeRows ? rowsFromDb(db) : [];
  return {
    storeUrl: getCacheMeta(db, "storeUrl", ""),
    complete: getCacheMeta(db, "complete", "false") === "true",
    total: Number(getCacheMeta(db, "total", "0") || 0),
    processedProducts: Number(getCacheMeta(db, "processedProducts", "0") || 0),
    downloadedBytes: Number(getCacheMeta(db, "downloadedBytes", "0") || 0),
    updatedAt: getCacheMeta(db, "updatedAt", ""),
    rows,
    cachedPages: cachedPagesFromDb(db)
  };
}

function writeCacheToDb(cache) {
  const db = getProductDb();
  const insertRow = db.prepare(`
    INSERT OR REPLACE INTO product_rows (
      row_key, id, parent_id, type, name, sku, image_url, image_alt,
      regular_price, sale_price, stock_quantity, stock_status, manage_stock,
      permalink, modified_at, cache_page, search_index, set_terms, language_terms, attributes_json
    ) VALUES (
      @rowKey, @id, @parentId, @type, @name, @sku, @imageUrl, @imageAlt,
      @regularPrice, @salePrice, @stockQuantity, @stockStatus, @manageStock,
      @permalink, @modifiedAt, @cachePage, @searchIndex, @setTerms, @languageTerms, @attributesJson
    )
  `);
  const transaction = db.transaction(() => {
    db.prepare("DELETE FROM product_rows").run();
    db.prepare("DELETE FROM cached_pages").run();
    for (const row of cache.rows || []) {
      insertRow.run(serializeCacheRow(row));
    }
    for (const page of cache.cachedPages || []) {
      db.prepare("INSERT OR REPLACE INTO cached_pages (page) VALUES (?)").run(Number(page));
    }
    setCacheMeta(db, "storeUrl", cache.storeUrl || "");
    setCacheMeta(db, "complete", cache.complete ? "true" : "false");
    setCacheMeta(db, "total", Number(cache.total || 0));
    setCacheMeta(db, "processedProducts", Number(cache.processedProducts || 0));
    setCacheMeta(db, "downloadedBytes", Number(cache.downloadedBytes || 0));
    setCacheMeta(db, "updatedAt", cache.updatedAt || "");
  });
  transaction();
}

async function migrateJsonCacheToDbIfNeeded() {
  const db = getProductDb();
  if (getCacheMeta(db, "sqliteMigrated", "") === "true") return;
  const existingRows = db.prepare("SELECT COUNT(*) AS count FROM product_rows").get().count;
  if (existingRows > 0) {
    setCacheMeta(db, "sqliteMigrated", "true");
    return;
  }

  const jsonCache = await readJsonProductCache();
  if (!jsonCache.rows || !jsonCache.rows.length) {
    setCacheMeta(db, "sqliteMigrated", "true");
    return;
  }

  writeCacheToDb(jsonCache);
  setCacheMeta(db, "sqliteMigrated", "true");
  try {
    await fs.rm(productCacheBackupPath(), { force: true });
    await fs.rename(productCachePath(), productCacheBackupPath());
  } catch {}
  addDiagnostic("cache", `Cache JSON migrata in SQLite: ${jsonCache.rows.length} righe.`);
}

async function readProductCache() {
  await fs.mkdir(path.dirname(productCacheDbPath()), { recursive: true });
  await migrateJsonCacheToDbIfNeeded();
  return cacheFromDb();
}

async function readProductCacheSummary() {
  await fs.mkdir(path.dirname(productCacheDbPath()), { recursive: true });
  await migrateJsonCacheToDbIfNeeded();
  return cacheFromDb(false);
}

async function writeProductCache(cache) {
  await fs.mkdir(path.dirname(productCacheDbPath()), { recursive: true });
  writeCacheToDb(cache);
}

function historyRow(row = {}) {
  return {
    id: row.id,
    parentId: row.parentId || null,
    name: row.name || "",
    sku: row.sku || "",
    regularPrice: String(row.regularPrice ?? ""),
    salePrice: String(row.salePrice ?? ""),
    stockQuantity: String(row.stockQuantity ?? "")
  };
}

async function readChangeHistory() {
  try {
    const raw = await fs.readFile(changeHistoryPath(), "utf8");
    const entries = JSON.parse(raw);
    return Array.isArray(entries) ? entries : [];
  } catch {
    return [];
  }
}

async function writeChangeHistory(entries) {
  await fs.mkdir(path.dirname(changeHistoryPath()), { recursive: true });
  await fs.writeFile(changeHistoryPath(), JSON.stringify(entries.slice(-300), null, 2), "utf8");
}

async function appendChangeHistory(entry) {
  const history = await readChangeHistory();
  history.push({
    time: new Date().toISOString(),
    ...entry
  });
  await writeChangeHistory(history);
}

function formatHistoryEntry(entry) {
  const before = entry.before || {};
  const after = entry.after || {};
  const changes = ["regularPrice", "salePrice", "stockQuantity"]
    .filter((field) => String(before[field] ?? "") !== String(after[field] ?? ""))
    .map((field) => `${field}: ${before[field] ?? ""} -> ${after[field] ?? ""}`)
    .join("; ");
  return `[${entry.time}] ${entry.status} ID ${entry.productId}${entry.parentId ? ` padre ${entry.parentId}` : ""} SKU ${entry.sku || "-"} ${entry.name || ""}${changes ? ` | ${changes}` : ""}${entry.error ? ` | ${entry.error}` : ""}`;
}

async function clearChangeHistory() {
  await writeChangeHistory([]);
  addDiagnostic("history", "Storico modifiche svuotato.");
  return true;
}

async function getCacheInfo() {
  const cache = await readProductCacheSummary();
  const db = getProductDb();
  let size = 0;
  let exists = false;
  try {
    const stats = await fs.stat(productCacheDbPath());
    size = stats.size;
    exists = true;
  } catch {}
  const rows = db.prepare("SELECT COUNT(*) AS count FROM product_rows").get().count;

  return {
    exists,
    path: productCacheDbPath(),
    type: "SQLite",
    cachedPages: Array.isArray(cache.cachedPages) ? cache.cachedPages : [],
    rows,
    total: Number(cache.total || 0),
    updatedAt: cache.updatedAt || "",
    size
  };
}

async function clearProductCache() {
  try {
    if (productDb) {
      productDb.close();
      productDb = null;
    }
    await fs.rm(productCacheDbPath(), { force: true });
    await fs.rm(`${productCacheDbPath()}-wal`, { force: true });
    await fs.rm(`${productCacheDbPath()}-shm`, { force: true });
    await fs.rm(productCachePath(), { force: true });
  } catch {}
  sendCacheStatus({
    syncing: false,
    complete: false,
    cached: 0,
    total: 0,
    rows: 0,
    downloadedBytes: 0,
    estimatedTotalBytes: 0,
    bytesPerSecond: 0,
    etaSeconds: 0,
    message: "Cache prodotti svuotata."
  });
  addDiagnostic("cache", "Cache prodotti svuotata.");
  return getCacheInfo();
}

async function refreshCachePage(page) {
  const targetPage = Math.max(Number(page || 1), 1);
  const cache = await readProductCache();
  const nextCache = {
    ...cache,
    rows: (cache.rows || []).filter((row) => row.cachePage !== targetPage),
    cachedPages: (cache.cachedPages || []).filter((cachedPage) => cachedPage !== targetPage),
    updatedAt: new Date().toISOString()
  };
  await writeProductCache(nextCache);
  addDiagnostic("cache", `Pagina ${targetPage} invalidata dalla cache.`);
  sendCacheStatus({
    syncing: false,
    complete: false,
    cached: nextCache.cachedPages.length,
    total: nextCache.total || 0,
    rows: nextCache.rows.length,
    message: `Pagina ${targetPage} rimossa dalla cache.`
  });
  return getCacheInfo();
}

function sendCacheStatus(status) {
  productCacheStatus = { ...productCacheStatus, ...status };
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("cache:status", productCacheStatus);
  }
}

function ensureConfig(config) {
  if (!config.storeUrl || !config.consumerKey || !config.consumerSecret) {
    throw new Error("Inserisci URL negozio, Consumer Key e Consumer Secret.");
  }
}

function authHeader(config) {
  return `Basic ${Buffer.from(`${config.consumerKey}:${config.consumerSecret}`).toString("base64")}`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shouldRetryStatus(status) {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

function formatBytes(bytes) {
  const value = Number(bytes || 0);
  if (value >= 1024 ** 3) return `${(value / (1024 ** 3)).toFixed(2)} GB`;
  if (value >= 1024 ** 2) return `${(value / (1024 ** 2)).toFixed(1)} MB`;
  if (value >= 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${Math.round(value)} B`;
}

function formatEta(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "--:--";
  const rounded = Math.max(Math.round(seconds), 1);
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  const secs = rounded % 60;
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, "0")}m`;
  return `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function cacheProgressText(processedProducts, totalProducts, downloadedBytes = productCacheStats.downloadedBytes) {
  const estimatedTotalBytes = processedProducts > 0 && totalProducts > 0
    ? Math.max(downloadedBytes, Math.round((downloadedBytes / processedProducts) * totalProducts))
    : downloadedBytes;
  const elapsedSeconds = Math.max((Date.now() - productCacheStats.startedAt) / 1000, 1);
  const bytesPerSecond = downloadedBytes / elapsedSeconds;
  const etaSeconds = bytesPerSecond > 0
    ? Math.max((estimatedTotalBytes - downloadedBytes) / bytesPerSecond, 0)
    : 0;

  return {
    downloadedBytes,
    estimatedTotalBytes,
    bytesPerSecond,
    etaSeconds,
    text: `${formatBytes(downloadedBytes)}/${formatBytes(estimatedTotalBytes)} - ${formatBytes(bytesPerSecond)}/s - tempo stimato ${formatEta(etaSeconds)}`
  };
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

  const method = options.method || "GET";
  const retries = options.retries ?? (method === "GET" ? 4 : 1);
  let lastError = null;

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs || 35000);

    try {
      const response = await fetch(url, {
        method,
        headers: {
          Authorization: authHeader(config),
          "Content-Type": "application/json"
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
        signal: controller.signal
      });

      const text = await response.text();
      const bytes = Buffer.byteLength(text || "", "utf8");
      let data = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        data = text;
      }

      if (!response.ok) {
        const message = data && data.message ? data.message : `Errore WooCommerce ${response.status}`;
        if (attempt < retries && shouldRetryStatus(response.status)) {
          lastError = new Error(message);
          await sleep(650 * attempt);
          continue;
        }
        throw new Error(message);
      }

      addDiagnostic("woocommerce", `${method} ${pathname} OK (${response.status})`);
      return {
        data,
        bytes,
        total: Number(response.headers.get("x-wp-total") || 0),
        totalPages: Number(response.headers.get("x-wp-totalpages") || 1)
      };
    } catch (error) {
      lastError = error;
      addDiagnostic("woocommerce", `${method} ${pathname} errore: ${error.message}`);
      if (attempt >= retries) break;
      await sleep(650 * attempt);
    } finally {
      clearTimeout(timeout);
    }
  }

  const message = lastError && lastError.name === "AbortError"
    ? "WooCommerce non risponde entro 35 secondi."
    : (lastError && lastError.message ? lastError.message : "fetch failed");
  throw new Error(`Connessione WooCommerce non riuscita: ${message}`);
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

  const row = {
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
    modifiedAt: item.date_modified_gmt || product.date_modified_gmt || "",
    attributes: normalizeRowAttributes(product, variation)
  };
  row.searchIndex = rowSearchIndex(row);
  return row;
}

function normalizeSlug(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/^pa_/, "")
    .replace(/[\s_-]+/g, "-");
}

function normalizeSearchText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function rowSearchIndex(row = {}) {
  if (row.searchIndex) return row.searchIndex;
  const attributes = (row.attributes || [])
    .flatMap((attr) => [attr.key, attr.term, attr.value])
    .filter(Boolean)
    .join(" ");
  return normalizeSearchText([
    row.name,
    row.sku,
    row.id,
    row.parentId,
    row.type,
    row.stockStatus,
    attributes
  ].join(" "));
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

function rowMatchesSearch(row, search) {
  const needle = normalizeSearchText(search);
  if (!needle) return true;
  const haystack = rowSearchIndex(row);
  return needle.split(" ").every((token) => haystack.includes(token));
}

function rowMatchesStock(row, stockStatus) {
  return !stockStatus || row.stockStatus === stockStatus;
}

function filterCachedRows(rows, params) {
  return rows.filter((row) => {
    return rowMatchesSearch(row, params.search)
      && rowMatchesStock(row, params.stockStatus)
      && rowMatchesFilters(row, params);
  });
}

function paginateRows(rows, page, pageSize) {
  const start = (page - 1) * pageSize;
  return rows.slice(start, start + pageSize);
}

function rowsForCachedPage(cache, page, pageSize) {
  const rows = cache.rows || [];
  const pageRows = rows.filter((row) => row.cachePage === page);
  return pageRows.length ? pageRows : paginateRows(rows, page, pageSize);
}

function localProductResult(cache, params = {}) {
  const page = Math.max(Number(params.page || 1), 1);
  const pageSize = 100;
  const search = String(params.search || "").trim();
  const stockStatus = String(params.stockStatus || "");
  const setTerm = String(params.setTerm || "").trim();
  const languageTerm = String(params.languageTerm || "").trim();
  const hasFilters = Boolean(search || stockStatus || setTerm || languageTerm);
  const rows = cache.rows || [];

  if (hasFilters) {
    const filteredRows = filterCachedRows(rows, { search, stockStatus, setTerm, languageTerm });
    return {
      rows: paginateRows(filteredRows, page, pageSize),
      total: filteredRows.length,
      totalPages: Math.max(Math.ceil(filteredRows.length / pageSize), 1),
      page,
      source: "local-filter",
      hasFilters
    };
  }

  if ((cache.cachedPages || []).includes(page)) {
    return {
      rows: rowsForCachedPage(cache, page, pageSize),
      total: cache.total || rows.length,
      totalPages: Math.max(Math.ceil((cache.total || rows.length) / pageSize), 1),
      page,
      source: "cache",
      hasFilters
    };
  }

  return {
    rows: [],
    total: cache.total || rows.length,
    totalPages: Math.max(Math.ceil((cache.total || rows.length) / pageSize), 1),
    page,
    source: "miss",
    hasFilters
  };
}

function buildSqlLike(value) {
  return `%${String(value || "").replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}

function localProductResultFromDb(cache, params = {}) {
  const startedAt = Date.now();
  const db = getProductDb();
  const page = Math.max(Number(params.page || 1), 1);
  const pageSize = 100;
  const search = normalizeSearchText(params.search);
  const stockStatus = String(params.stockStatus || "");
  const setTerm = normalizeSlug(params.setTerm);
  const languageTerm = normalizeSlug(params.languageTerm);
  const hasFilters = Boolean(search || stockStatus || setTerm || languageTerm);
  const where = [];
  const bindings = {};

  if (hasFilters) {
    if (search) {
      search.split(" ").forEach((token, index) => {
        where.push(`search_index LIKE @search${index} ESCAPE '\\'`);
        bindings[`search${index}`] = buildSqlLike(token);
      });
    }
    if (stockStatus) {
      where.push("stock_status = @stockStatus");
      bindings.stockStatus = stockStatus;
    }
    if (setTerm) {
      where.push("set_terms LIKE @setTerm ESCAPE '\\'");
      bindings.setTerm = buildSqlLike(setTerm);
    }
    if (languageTerm) {
      where.push("language_terms LIKE @languageTerm ESCAPE '\\'");
      bindings.languageTerm = buildSqlLike(languageTerm);
    }
  } else if ((cache.cachedPages || []).includes(page)) {
    where.push("cache_page = @cachePage");
    bindings.cachePage = page;
  } else {
    addDiagnostic("sqlite", `Cache miss pagina ${page} in ${Date.now() - startedAt}ms.`);
    return {
      rows: [],
      total: cache.total || 0,
      totalPages: Math.max(Math.ceil((cache.total || 0) / pageSize), 1),
      page,
      source: "miss",
      hasFilters
    };
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const totalRow = db.prepare(`SELECT COUNT(*) AS total FROM product_rows ${whereSql}`).get(bindings);
  const total = Number(totalRow ? totalRow.total : 0);
  const offset = (page - 1) * pageSize;
  const rows = db.prepare(`
    SELECT
      id,
      parent_id AS parentId,
      type,
      name,
      sku,
      image_url AS imageUrl,
      image_alt AS imageAlt,
      regular_price AS regularPrice,
      sale_price AS salePrice,
      stock_quantity AS stockQuantity,
      stock_status AS stockStatus,
      manage_stock AS manageStock,
      permalink,
      modified_at AS modifiedAt,
      cache_page AS cachePage,
      search_index AS searchIndex,
      attributes_json AS attributesJson
    FROM product_rows
    ${whereSql}
    ORDER BY COALESCE(cache_page, 999999), name COLLATE NOCASE, id
    LIMIT @limit OFFSET @offset
  `).all({ ...bindings, limit: pageSize, offset }).map(deserializeCacheRow);

  addDiagnostic("sqlite", `${hasFilters ? "Query filtri" : "Query pagina"} ${page}: ${rows.length}/${total} righe in ${Date.now() - startedAt}ms.`);
  return {
    rows,
    total,
    totalPages: Math.max(Math.ceil(total / pageSize), 1),
    page,
    source: hasFilters ? "local-filter" : "cache",
    hasFilters
  };
}

function rowKey(row) {
  return `${row.parentId || 0}:${row.id}`;
}

function mergeRows(existingRows = [], nextRows = []) {
  const map = new Map(existingRows.map((row) => [rowKey(row), row]));
  for (const row of nextRows) {
    const key = rowKey(row);
    const existing = map.get(key);
    map.set(key, existing && existing.cachePage && !row.cachePage
      ? { ...row, cachePage: existing.cachePage }
      : row);
  }
  return Array.from(map.values());
}

async function mapLimit(items, limit, mapper) {
  const results = new Array(items.length);
  let cursor = 0;

  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(items[index], index);
    }
  });

  await Promise.all(workers);
  return results;
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

async function getAttributeFilterConfig() {
  if (attributeFilterCache) return attributeFilterCache;

  const result = await wooRequest("products/attributes", { query: { per_page: 100 } });
  const attributes = result.data || [];
  const setAttribute = findAttribute(attributes, "set");
  const languageAttribute = findAttribute(attributes, "lingua") || findAttribute(attributes, "language");

  attributeFilterCache = {
    set: setAttribute ? {
      id: setAttribute.id,
      name: setAttribute.name,
      slug: setAttribute.slug,
      queryName: setAttribute.slug || `pa_${normalizeSlug(setAttribute.name)}`,
      terms: await getAttributeTerms(setAttribute)
    } : null,
    language: languageAttribute ? {
      id: languageAttribute.id,
      name: languageAttribute.name,
      slug: languageAttribute.slug,
      queryName: languageAttribute.slug || `pa_${normalizeSlug(languageAttribute.name)}`,
      terms: await getAttributeTerms(languageAttribute)
    } : null
  };

  return attributeFilterCache;
}

function findTermSlug(filterConfig, type, selectedSlug) {
  const normalized = normalizeSlug(selectedSlug);
  const config = filterConfig && filterConfig[type];
  const term = config && (config.terms || []).find((item) => normalizeSlug(item.slug || item.name) === normalized);
  return term ? term.slug : selectedSlug;
}

function findTerm(filterConfig, type, selectedSlug) {
  const normalized = normalizeSlug(selectedSlug);
  const config = filterConfig && filterConfig[type];
  return config && (config.terms || []).find((item) => normalizeSlug(item.slug || item.name) === normalized);
}

async function productQueryFilters(params = {}) {
  const search = String(params.search || "").trim();
  const stockStatus = String(params.stockStatus || "");
  const setTerm = String(params.setTerm || "").trim();
  const languageTerm = String(params.languageTerm || "").trim();
  const query = {};
  let localAttributeFilter = Boolean(setTerm || languageTerm);

  if (search) {
    query.search = search;
    query.search_fields = "name,sku";
  }

  if (stockStatus) query.stock_status = stockStatus;

  if (setTerm || languageTerm) {
    const filterConfig = await getAttributeFilterConfig();
    const setTermInfo = setTerm ? findTerm(filterConfig, "set", setTerm) : null;
    const languageTermInfo = languageTerm ? findTerm(filterConfig, "language", languageTerm) : null;

    if (setTerm && filterConfig.set && setTermInfo) {
      query.attribute = filterConfig.set.queryName;
      query.attribute_term = setTermInfo.id || findTermSlug(filterConfig, "set", setTerm);
    } else if (languageTerm && filterConfig.language && languageTermInfo) {
      query.attribute = filterConfig.language.queryName;
      query.attribute_term = languageTermInfo.id || findTermSlug(filterConfig, "language", languageTerm);
    }
  }

  return { query, localAttributeFilter };
}

async function fetchProductRowsPage(page, params = {}) {
  const filters = await productQueryFilters(params);
  let useLocalAttributeFilter = filters.localAttributeFilter;
  let query = {
    page,
    per_page: 100,
    status: "publish",
    _fields: productFields,
    ...filters.query
  };
  let result = null;

  try {
    result = await wooRequest("products", { query });
  } catch (error) {
    if (!query.search_fields && !query.attribute) throw error;
    query = { ...query };
    delete query.search_fields;
    if (query.attribute) {
      delete query.attribute;
      delete query.attribute_term;
      useLocalAttributeFilter = Boolean(params.setTerm || params.languageTerm);
    }
    result = await wooRequest("products", { query });
  }

  const pageRows = await mapLimit(result.data || [], 3, async (product) => {
    if (product.type === "variable") {
      const variations = await wooRequest(`products/${product.id}/variations`, {
        query: { per_page: 100, _fields: variationFields }
      });
      return {
        rows: (variations.data || []).map((variation) => productRow(product, variation)),
        bytes: variations.bytes || 0
      };
    }
    return {
      rows: [productRow(product)],
      bytes: 0
    };
  });
  const unfilteredRows = pageRows.flatMap((item) => item.rows);
  let rows = unfilteredRows;
  let filteredLocally = false;
  if (useLocalAttributeFilter) {
    rows = filterCachedRows(rows, params);
    filteredLocally = rows.length !== unfilteredRows.length;
  }
  const bytes = (result.bytes || 0) + pageRows.reduce((total, item) => total + (item.bytes || 0), 0);

  return {
    rows: rows.map((row) => ({ ...row, cachePage: params.cachePage || null })),
    bytes,
    processedProducts: (result.data || []).length,
    total: filteredLocally ? rows.length : result.total,
    totalPages: result.totalPages
  };
}

async function fetchModifiedRows(modifiedAfter) {
  const rows = [];
  let total = 0;
  let totalPages = 1;
  let bytes = 0;

  for (let page = 1; page <= totalPages; page += 1) {
    const result = await wooRequest("products", {
      query: {
        page,
        per_page: 100,
        status: "publish",
        modified_after: modifiedAfter,
        dates_are_gmt: true,
        _fields: productFields
      }
    });
    total = result.total;
    totalPages = result.totalPages;
    bytes += result.bytes || 0;

    const pageRows = await mapLimit(result.data || [], 3, async (product) => {
      if (product.type === "variable") {
        const variations = await wooRequest(`products/${product.id}/variations`, {
          query: { per_page: 100, _fields: variationFields }
        });
        return {
          rows: (variations.data || []).map((variation) => productRow(product, variation)),
          bytes: variations.bytes || 0
        };
      }
      return { rows: [productRow(product)], bytes: 0 };
    });

    rows.push(...pageRows.flatMap((item) => item.rows));
    bytes += pageRows.reduce((sum, item) => sum + (item.bytes || 0), 0);
  }

  return { rows, total, bytes };
}

async function getRemoteProductTotal() {
  const result = await wooRequest("products", {
    query: {
      page: 1,
      per_page: 1,
      status: "publish"
    }
  });
  return result.total;
}

async function refreshModifiedProducts(cache) {
  if (!cache.updatedAt || productCachePromise) return;

  productCachePromise = (async () => {
    try {
      sendCacheStatus({
        syncing: false,
        complete: Boolean(cache.complete),
        cached: cache.processedProducts || cache.total || cache.rowCount || (cache.rows || []).length,
        total: cache.total || cache.rowCount || (cache.rows || []).length,
        rows: cache.rowCount || (cache.rows || []).length,
        message: "Controllo modifiche prodotti..."
      });

      const modified = await fetchModifiedRows(cache.updatedAt);
      if (modified.rows.length) {
        const freshCache = await readProductCache();
        freshCache.rows = mergeRows(freshCache.rows, modified.rows);
        freshCache.updatedAt = new Date().toISOString();
        await writeProductCache(freshCache);
        sendCacheStatus({
          syncing: false,
          complete: Boolean(freshCache.complete),
          cached: freshCache.processedProducts || freshCache.total || freshCache.rows.length,
          total: freshCache.total || freshCache.rows.length,
          rows: freshCache.rows.length,
          message: `Cache aggiornata: ${modified.rows.length} righe modificate.`
        });
        addDiagnostic("cache", `Aggiornate ${modified.rows.length} righe modificate.`);
      } else {
        const freshCache = await readProductCache();
        freshCache.updatedAt = new Date().toISOString();
        await writeProductCache(freshCache);
        sendCacheStatus({
          syncing: false,
          complete: Boolean(freshCache.complete),
          cached: freshCache.processedProducts || freshCache.total || freshCache.rows.length,
          total: freshCache.total || freshCache.rows.length,
          rows: freshCache.rows.length,
          message: "Cache ok."
        });
        addDiagnostic("cache", "Controllo modifiche completato: nessuna modifica.");
      }
    } catch (error) {
      addDiagnostic("cache", `Controllo modifiche non riuscito: ${error.message}`);
      sendCacheStatus({
        syncing: false,
        message: `Controllo modifiche non riuscito: ${error.message}`
      });
    } finally {
      productCachePromise = null;
    }
  })();
}

async function ensureProductCache(includeRows = true) {
  const config = await readConfig();
  ensureConfig(config);
  const cache = includeRows ? await readProductCache() : await readProductCacheSummary();
  const rowCount = includeRows
    ? (cache.rows || []).length
    : getProductDb().prepare("SELECT COUNT(*) AS count FROM product_rows").get().count;

  if (cache.storeUrl && cache.storeUrl !== config.storeUrl) {
    writeCacheToDb({
      storeUrl: config.storeUrl,
      complete: false,
      total: 0,
      processedProducts: 0,
      rows: [],
      cachedPages: [],
      updatedAt: ""
    });
    sendCacheStatus({
      syncing: false,
      complete: false,
      cached: 0,
      total: 0,
      message: "Cache prodotti non inizializzata."
    });
    return { storeUrl: config.storeUrl, complete: false, total: 0, processedProducts: 0, rows: [], cachedPages: [], updatedAt: "", rowCount: 0 };
  }

  sendCacheStatus({
    syncing: Boolean(productCachePromise),
    complete: Boolean(cache.complete),
    cached: cache.processedProducts || cache.total || rowCount,
    total: cache.total || rowCount,
    rows: rowCount,
    message: cache.complete
      ? `Cache SQLite pronta: ${cache.total || rowCount} prodotti base, ${rowCount} righe cache.`
      : `Cache SQLite parziale: ${cache.processedProducts || 0}/${cache.total || 0} prodotti base, ${rowCount} righe cache.`
  });

  return { ...cache, rowCount };
}

ipcMain.handle("config:get", readConfig);
ipcMain.handle("config:save", async (_event, config) => {
  attributeFilterCache = null;
  return writeConfig(config);
});
ipcMain.handle("updates:state", async () => updateState);
ipcMain.handle("updates:check", async () => checkForUpdates());
ipcMain.handle("cache:status", async () => productCacheStatus);
ipcMain.handle("cache:info", async () => getCacheInfo());
ipcMain.handle("cache:clear", async () => clearProductCache());
ipcMain.handle("cache:refresh-page", async (_event, page) => refreshCachePage(page));
ipcMain.handle("diagnostics:get", async () => diagnosticLog.map((entry) => `[${entry.time}] ${entry.event}: ${entry.detail}`).join("\n"));
ipcMain.handle("history:get", async () => (await readChangeHistory()).map(formatHistoryEntry).reverse().join("\n"));
ipcMain.handle("history:clear", async () => clearChangeHistory());
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
ipcMain.handle("app:version", () => app.getVersion());
ipcMain.handle("app:show-help", () => dialog.showMessageBox(mainWindow, {
  type: "info",
  title: "Aiuto",
  message: "ATTACCATE AR CAZZO, AR CAZZO TE DEVI ATTACCÀ",
  buttons: ["OK"]
}));

ipcMain.handle("woo:test", async () => {
  await wooRequest("products", { query: { per_page: 1 } });
  addDiagnostic("woocommerce", "Test collegamento riuscito.");
  return true;
});

ipcMain.handle("attributes:filters", async () => {
  return getAttributeFilterConfig();
});

ipcMain.handle("products:list", async (_event, params = {}) => {
  const startedAt = Date.now();
  const page = Math.max(Number(params.page || 1), 1);
  const search = String(params.search || "").trim();
  const stockStatus = String(params.stockStatus || "");
  const setTerm = String(params.setTerm || "").trim();
  const languageTerm = String(params.languageTerm || "").trim();
  const pageSize = 100;
  let cache = await ensureProductCache(false);
  const hasFilters = Boolean(search || stockStatus || setTerm || languageTerm);
  const localResult = localProductResultFromDb(cache, { page, search, stockStatus, setTerm, languageTerm });
  const forceRemote = Boolean(params.forceRemote);
  const localOnly = Boolean(params.localOnly);
  const silent = Boolean(params.silent);
  let remoteTotal = 0;

  if (localOnly) {
    addDiagnostic("cache", hasFilters
      ? `Ricerca locale pagina ${page}: ${localResult.rows.length}/${localResult.total} righe in ${Date.now() - startedAt}ms.`
      : (localResult.source === "cache" ? `Cache hit pagina ${page} in ${Date.now() - startedAt}ms.` : `Cache miss locale pagina ${page} in ${Date.now() - startedAt}ms.`));
    return localResult;
  }

  if (forceRemote || hasFilters || localResult.source === "miss") {
    addDiagnostic("cache", hasFilters
      ? `Ricerca remota pagina ${page}.`
      : `Cache miss pagina ${page}.`);
    productCacheStats = {
      startedAt: Date.now(),
      downloadedBytes: 0
    };
    if (!silent) {
      sendCacheStatus({
        syncing: true,
        complete: false,
        cached: cache.cachedPages ? cache.cachedPages.length : 0,
        total: cache.total || 0,
        rows: cache.rowCount || 0,
        message: hasFilters ? "Cerco prodotti su WooCommerce..." : `Carico pagina ${page} da WooCommerce...`
      });
    }

    let pageRows = null;
    try {
      pageRows = await fetchProductRowsPage(page, {
        search,
        stockStatus,
        setTerm,
        languageTerm,
        cachePage: hasFilters ? null : page
      });
    } catch (error) {
      addDiagnostic("cache", `Remoto non disponibile, uso cache locale: ${error.message}`);
      if (!silent) {
        sendCacheStatus({
          syncing: false,
          complete: false,
          cached: cache.cachedPages ? cache.cachedPages.length : 0,
          total: cache.total || localResult.total,
          rows: cache.rowCount || 0,
          message: localResult.rows.length
            ? `WooCommerce non risponde. Mostro ${localResult.rows.length} prodotti dalla cache.`
            : `WooCommerce non risponde: ${error.message}`
        });
      }
      if (localResult.rows.length) {
        return {
          ...localResult,
          source: "local-fallback",
          warning: error.message
        };
      }
      throw error;
    }
    remoteTotal = pageRows.total;
    productCacheStats.downloadedBytes += pageRows.bytes || 0;
    const config = await readConfig();
    const fullCache = await readProductCache();
    const nextRows = mergeRows(fullCache.rows || [], pageRows.rows);
    const nextCache = {
      storeUrl: config.storeUrl,
      complete: false,
      total: hasFilters ? (fullCache.total || cache.total || pageRows.total) : pageRows.total,
      processedProducts: hasFilters
        ? Number(fullCache.processedProducts || cache.processedProducts || 0)
        : Math.min(Math.max(Number(fullCache.processedProducts || cache.processedProducts || 0), page * 100), pageRows.total || page * 100),
      rows: nextRows,
      cachedPages: hasFilters
        ? (fullCache.cachedPages || cache.cachedPages || [])
        : Array.from(new Set([...(fullCache.cachedPages || cache.cachedPages || []), page])).sort((a, b) => a - b),
      downloadedBytes: productCacheStats.downloadedBytes,
      updatedAt: new Date().toISOString()
    };
    await writeProductCache(nextCache);
    cache = nextCache;
    const progress = cacheProgressText(Math.min(page * 100, pageRows.total || nextCache.total), pageRows.total || nextCache.total);
    if (!silent) {
      sendCacheStatus({
        syncing: false,
        complete: false,
        cached: hasFilters ? nextCache.cachedPages.length : nextCache.cachedPages.length * 100,
        total: nextCache.total,
        rows: nextCache.rows.length,
        downloadedBytes: progress.downloadedBytes,
        estimatedTotalBytes: progress.estimatedTotalBytes,
        bytesPerSecond: progress.bytesPerSecond,
        etaSeconds: progress.etaSeconds,
        message: hasFilters
          ? `Ricerca salvata in cache: ${pageRows.rows.length} righe trovate. Cache locale: ${nextCache.rows.length} righe.`
          : `Pagina ${page} salvata in cache. Cache locale: ${nextCache.cachedPages.length} pagine, ${nextCache.rows.length} righe.`
      });
    }
    addDiagnostic("cache", hasFilters
      ? `Ricerca remota pagina ${page} completata: ${pageRows.rows.length} righe in ${Date.now() - startedAt}ms.`
      : `Pagina ${page} scaricata: ${pageRows.rows.length} righe in ${Date.now() - startedAt}ms.`);
    return {
      rows: pageRows.rows,
      page,
      total: hasFilters ? (remoteTotal || pageRows.rows.length) : (cache.total || pageRows.rows.length),
      totalPages: hasFilters
        ? Math.max(Math.ceil((remoteTotal || pageRows.rows.length) / pageSize), 1)
        : Math.max(Math.ceil((cache.total || pageRows.rows.length) / pageSize), 1),
      source: "remote"
    };
  } else {
    addDiagnostic("cache", `Cache hit pagina ${page} in ${Date.now() - startedAt}ms.`);
  }

  if (!productCachePromise && cache.updatedAt) {
    refreshModifiedProducts(cache);
  }

  return localResult;
});

ipcMain.handle("products:preload-page", async (_event, params = {}) => {
  const page = Math.max(Number(params.page || 1), 1);
  const key = String(page);
  const startedAt = Date.now();
  if (preloadingPages.has(key)) return false;

  preloadingPages.add(key);
  try {
    const cache = await ensureProductCache(false);
    if ((cache.cachedPages || []).includes(page)) {
      addDiagnostic("cache", `Preload pagina ${page} saltato: gia in cache.`);
      return true;
    }

    addDiagnostic("cache", `Preload pagina ${page} avviato.`);
    const pageRows = await fetchProductRowsPage(page, { cachePage: page });
    const config = await readConfig();
    const fullCache = await readProductCache();
    const nextCache = {
      ...fullCache,
      storeUrl: config.storeUrl,
      complete: false,
      total: pageRows.total || fullCache.total || cache.total,
      processedProducts: Math.min(
        Math.max(Number(fullCache.processedProducts || cache.processedProducts || 0), page * 100),
        pageRows.total || page * 100
      ),
      rows: mergeRows(fullCache.rows || [], pageRows.rows),
      cachedPages: Array.from(new Set([...(fullCache.cachedPages || cache.cachedPages || []), page])).sort((a, b) => a - b),
      updatedAt: new Date().toISOString()
    };
    await writeProductCache(nextCache);
    addDiagnostic("cache", `Preload pagina ${page} completato: ${pageRows.rows.length} righe in ${Date.now() - startedAt}ms.`);
    return true;
  } catch (error) {
    addDiagnostic("cache", `Preload pagina ${page} non riuscito: ${error.message}`);
    return false;
  } finally {
    preloadingPages.delete(key);
  }
});

async function updateProductRemote(row) {
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
  addDiagnostic("products", `Prodotto ${row.parentId ? `${row.parentId}/` : ""}${row.id} salvato.`);
}

async function updateRowsInProductCache(rows) {
  const cache = await readProductCache();
  const updates = Array.isArray(rows) ? rows : [rows];
  if (cache.rows && cache.rows.length && updates.length) {
    cache.rows = cache.rows.map((cachedRow) => {
      const row = updates.find((update) => cachedRow.id === update.id && cachedRow.parentId === update.parentId);
      if (!row) return cachedRow;
      return {
        ...cachedRow,
        regularPrice: row.regularPrice,
        salePrice: row.salePrice,
        stockQuantity: row.stockQuantity
      };
    });
    cache.updatedAt = new Date().toISOString();
    await writeProductCache(cache);
  }
}

ipcMain.handle("products:update", async (_event, row, previousRow = null) => {
  if (productCacheStatus.syncing) {
    throw new Error("Cache prodotti in generazione. Attendi il completamento prima di modificare.");
  }

  try {
    await updateProductRemote(row);
    await updateRowsInProductCache(row);
    await appendChangeHistory({
      status: "ok",
      productId: row.id,
      parentId: row.parentId || null,
      name: row.name || "",
      sku: row.sku || "",
      before: historyRow(previousRow || row),
      after: historyRow(row)
    });
  } catch (error) {
    await appendChangeHistory({
      status: "errore",
      productId: row.id,
      parentId: row.parentId || null,
      name: row.name || "",
      sku: row.sku || "",
      before: historyRow(previousRow || row),
      after: historyRow(row),
      error: error.message || "Errore salvataggio"
    });
    addDiagnostic("products", `Errore salvataggio ${row.parentId ? `${row.parentId}/` : ""}${row.id}${row.sku ? ` SKU ${row.sku}` : ""}: ${error.message}`);
    throw error;
  }

  return true;
});

ipcMain.handle("products:bulk-update", async (_event, rows = []) => {
  if (productCacheStatus.syncing) {
    throw new Error("Cache prodotti in generazione. Attendi il completamento prima di modificare.");
  }

  const updates = Array.isArray(rows) ? rows : [];
  const results = await mapLimit(updates, 2, async (row) => {
    try {
      await updateProductRemote(row);
      return {
        ok: true,
        id: row.id,
        parentId: row.parentId || null,
        sku: row.sku || ""
      };
    } catch (error) {
      addDiagnostic("products", `Errore salvataggio ${row.parentId ? `${row.parentId}/` : ""}${row.id}${row.sku ? ` SKU ${row.sku}` : ""}: ${error.message}`);
      return {
        ok: false,
        id: row.id,
        parentId: row.parentId || null,
        sku: row.sku || "",
        error: error.message || "Errore salvataggio"
      };
    }
  });

  const savedRows = updates.filter((row) => results.some((result) => result.ok && result.id === row.id && result.parentId === (row.parentId || null)));
  await updateRowsInProductCache(savedRows);
  addDiagnostic("products", `Salvataggio bulk completato: ${savedRows.length} salvati, ${updates.length - savedRows.length} non salvati.`);

  return {
    saved: savedRows.length,
    failed: updates.length - savedRows.length,
    results
  };
});
