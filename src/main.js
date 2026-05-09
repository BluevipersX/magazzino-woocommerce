const { app, BrowserWindow, ipcMain, dialog, Menu, shell } = require("electron");
const { autoUpdater } = require("electron-updater");
const Database = require("better-sqlite3");
const path = require("path");
const crypto = require("crypto");
const { pathToFileURL } = require("url");
const fs = require("fs/promises");
const fsSync = require("fs");

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
  "categories",
  "date_created_gmt",
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
  "date_created_gmt",
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
const changeHistoryPath = () => path.join(app.getPath("userData"), "change-history.json");
let runtimeCacheDir = null;
let productDb = null;
const imageDownloads = new Set();
let ftsAvailable = false;

function canWriteDirectory(targetDir) {
  try {
    fsSync.mkdirSync(targetDir, { recursive: true });
    const probe = path.join(targetDir, `.write-test-${process.pid}`);
    fsSync.writeFileSync(probe, "ok");
    fsSync.unlinkSync(probe);
    return true;
  } catch {
    return false;
  }
}

function cacheDataDir() {
  if (runtimeCacheDir) return runtimeCacheDir;
  const installBase = app.isPackaged ? path.dirname(process.execPath) : path.dirname(app.getAppPath());
  const installDataDir = path.join(installBase, "dati");
  runtimeCacheDir = canWriteDirectory(installDataDir)
    ? installDataDir
    : path.join(app.getPath("userData"), "dati");
  if (!canWriteDirectory(runtimeCacheDir)) {
    runtimeCacheDir = app.getPath("userData");
    fsSync.mkdirSync(runtimeCacheDir, { recursive: true });
  }
  addDiagnostic("cache", `Cartella cache locale: ${runtimeCacheDir}`);
  return runtimeCacheDir;
}

const productCacheDbPath = () => path.join(cacheDataDir(), "products-cache.sqlite");
const imageCacheDir = () => path.join(cacheDataDir(), "image-cache");

function legacyProductCacheDbPath() {
  return path.join(app.getPath("userData"), "products-cache.sqlite");
}

function migrateLegacyProductDbToRuntimeDir() {
  const current = productCacheDbPath();
  const legacy = legacyProductCacheDbPath();
  if (current === legacy || fsSync.existsSync(current) || !fsSync.existsSync(legacy)) return;

  fsSync.mkdirSync(path.dirname(current), { recursive: true });
  for (const suffix of ["", "-wal", "-shm"]) {
    const from = `${legacy}${suffix}`;
    const to = `${current}${suffix}`;
    if (fsSync.existsSync(from) && !fsSync.existsSync(to)) {
      fsSync.copyFileSync(from, to);
    }
  }
  addDiagnostic("cache", `Cache SQLite migrata da ${legacy} a ${current}.`);
}

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

function productCategoryTerms(row = {}) {
  const terms = (row.categories || [])
    .flatMap((category) => [category.id, normalizeSlug(category.slug || category.name), normalizeSlug(category.name)])
    .filter(Boolean);
  return terms.length ? `|${terms.join("|")}|` : "";
}

function parseCategoryTerms(value = "") {
  return String(value || "")
    .split("|")
    .map((term) => term.trim())
    .filter(Boolean)
    .map((term) => ({ id: term, name: term, slug: term }));
}

function productFtsText(row = {}) {
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
    imageLocalPath: String(row.imageLocalPath || ""),
    imageStatus: String(row.imageStatus || ""),
    imageDownloadedAt: String(row.imageDownloadedAt || ""),
    createdAt: String(row.createdAt || ""),
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
    categoryTerms: productCategoryTerms(row),
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

  const imageLocalPath = row.imageLocalPath || "";
  const imageStatus = row.imageStatus || "";
  return {
    id: row.id,
    parentId: row.parentId,
    type: row.type || "",
    name: row.name || "",
    sku: row.sku || "",
    imageUrl: row.imageUrl || "",
    imageAlt: row.imageAlt || "",
    imageLocalPath,
    cachedImageUrl: imageLocalPath && imageStatus === "ok" ? pathToFileURL(imageLocalPath).toString() : "",
    imageStatus,
    imageDownloadedAt: row.imageDownloadedAt || "",
    createdAt: row.createdAt || "",
    regularPrice: row.regularPrice || "",
    salePrice: row.salePrice || "",
    stockQuantity: row.stockQuantity || "",
    stockStatus: row.stockStatus || "",
    manageStock: Boolean(row.manageStock),
    permalink: row.permalink || "",
    modifiedAt: row.modifiedAt || "",
    attributes,
    categories: parseCategoryTerms(row.categoryTerms || ""),
    cachePage: row.cachePage,
    searchIndex: row.searchIndex || ""
  };
}

function getProductDb() {
  if (productDb) return productDb;
  migrateLegacyProductDbToRuntimeDir();
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
      image_local_path TEXT,
      image_status TEXT,
      image_downloaded_at TEXT,
      created_at TEXT,
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
      category_terms TEXT,
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
  ensureProductRowColumn(productDb, "image_local_path", "TEXT");
  ensureProductRowColumn(productDb, "image_status", "TEXT");
  ensureProductRowColumn(productDb, "image_downloaded_at", "TEXT");
  ensureProductRowColumn(productDb, "created_at", "TEXT");
  ensureProductRowColumn(productDb, "category_terms", "TEXT");
  productDb.prepare("CREATE INDEX IF NOT EXISTS idx_product_rows_image_status ON product_rows(image_status)").run();
  productDb.prepare("CREATE INDEX IF NOT EXISTS idx_product_rows_created_at ON product_rows(created_at)").run();
  productDb.prepare("CREATE INDEX IF NOT EXISTS idx_product_rows_category_terms ON product_rows(category_terms)").run();
  setupFts(productDb);
  return productDb;
}

function setupFts(db) {
  try {
    db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS product_rows_fts USING fts5(
        row_key UNINDEXED,
        content,
        tokenize = 'unicode61 remove_diacritics 2'
      );
    `);
    ftsAvailable = true;
    const rowCount = db.prepare("SELECT COUNT(*) AS count FROM product_rows").get().count;
    const ftsCount = db.prepare("SELECT COUNT(*) AS count FROM product_rows_fts").get().count;
    const ftsVersion = getCacheMeta(db, "ftsVersion", "");
    if (rowCount && (ftsCount !== rowCount || ftsVersion !== "1")) {
      rebuildFtsIndex(db);
    }
  } catch (error) {
    ftsAvailable = false;
    addDiagnostic("sqlite", `FTS5 non disponibile, uso LIKE: ${error.message}`);
  }
}

function rebuildFtsIndex(db = getProductDb()) {
  if (!ftsAvailable) return;
  try {
    const rows = rowsFromDb(db);
    const insertFts = db.prepare("INSERT INTO product_rows_fts (row_key, content) VALUES (?, ?)");
    const transaction = db.transaction(() => {
      db.prepare("DELETE FROM product_rows_fts").run();
      rows.forEach((row) => insertFts.run(rowKey(row), productFtsText(row)));
      setCacheMeta(db, "ftsVersion", "1");
      setCacheMeta(db, "ftsUpdatedAt", new Date().toISOString());
    });
    transaction();
    addDiagnostic("sqlite", `Indice FTS ricostruito: ${rows.length} righe.`);
  } catch (error) {
    ftsAvailable = false;
    addDiagnostic("sqlite", `Ricostruzione FTS fallita, uso LIKE: ${error.message}`);
  }
}

function ftsQueryText(search) {
  const tokens = normalizeSearchText(search)
    .split(" ")
    .map((token) => token.trim())
    .filter(Boolean)
    .map((token) => `${token.replace(/"/g, "")}*`);
  return tokens.join(" ");
}

function ensureProductRowColumn(db, column, type) {
  const exists = db.prepare("PRAGMA table_info(product_rows)").all().some((row) => row.name === column);
  if (!exists) db.prepare(`ALTER TABLE product_rows ADD COLUMN ${column} ${type}`).run();
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
      image_local_path AS imageLocalPath,
      image_status AS imageStatus,
      image_downloaded_at AS imageDownloadedAt,
      created_at AS createdAt,
      regular_price AS regularPrice,
      sale_price AS salePrice,
      stock_quantity AS stockQuantity,
      stock_status AS stockStatus,
      manage_stock AS manageStock,
      permalink,
      modified_at AS modifiedAt,
      cache_page AS cachePage,
      search_index AS searchIndex,
      category_terms AS categoryTerms,
      attributes_json AS attributesJson
    FROM product_rows
    ORDER BY COALESCE(created_at, modified_at, '') DESC, id DESC
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
  const existingImages = new Map(db.prepare(`
    SELECT
      row_key AS rowKey,
      image_url AS imageUrl,
      image_local_path AS imageLocalPath,
      image_status AS imageStatus,
      image_downloaded_at AS imageDownloadedAt
    FROM product_rows
    WHERE image_local_path != ''
  `).all().map((row) => [row.rowKey, row]));
  const insertRow = db.prepare(`
    INSERT OR REPLACE INTO product_rows (
      row_key, id, parent_id, type, name, sku, image_url, image_alt, image_local_path, image_status, image_downloaded_at,
      created_at, regular_price, sale_price, stock_quantity, stock_status, manage_stock,
      permalink, modified_at, cache_page, search_index, set_terms, language_terms, category_terms, attributes_json
    ) VALUES (
      @rowKey, @id, @parentId, @type, @name, @sku, @imageUrl, @imageAlt, @imageLocalPath, @imageStatus, @imageDownloadedAt,
      @createdAt, @regularPrice, @salePrice, @stockQuantity, @stockStatus, @manageStock,
      @permalink, @modifiedAt, @cachePage, @searchIndex, @setTerms, @languageTerms, @categoryTerms, @attributesJson
    )
  `);
  const insertFts = ftsAvailable
    ? db.prepare("INSERT INTO product_rows_fts (row_key, content) VALUES (?, ?)")
    : null;
  const transaction = db.transaction(() => {
    db.prepare("DELETE FROM product_rows").run();
    db.prepare("DELETE FROM cached_pages").run();
    if (ftsAvailable) db.prepare("DELETE FROM product_rows_fts").run();
    for (const row of cache.rows || []) {
      const existingImage = existingImages.get(rowKey(row));
      const rowWithImage = existingImage && existingImage.imageUrl === row.imageUrl
        ? {
            ...row,
            imageLocalPath: row.imageLocalPath || existingImage.imageLocalPath || "",
            imageStatus: row.imageStatus || existingImage.imageStatus || "",
            imageDownloadedAt: row.imageDownloadedAt || existingImage.imageDownloadedAt || ""
          }
        : row;
      insertRow.run(serializeCacheRow(rowWithImage));
      if (insertFts) insertFts.run(rowKey(rowWithImage), productFtsText(rowWithImage));
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
    if (ftsAvailable) {
      setCacheMeta(db, "ftsVersion", "1");
      setCacheMeta(db, "ftsUpdatedAt", new Date().toISOString());
    }
  });
  transaction();
}

function productRowFromDb(db, key) {
  const row = db.prepare(`
    SELECT
      id,
      parent_id AS parentId,
      type,
      name,
      sku,
      image_url AS imageUrl,
      image_alt AS imageAlt,
      image_local_path AS imageLocalPath,
      image_status AS imageStatus,
      image_downloaded_at AS imageDownloadedAt,
      created_at AS createdAt,
      regular_price AS regularPrice,
      sale_price AS salePrice,
      stock_quantity AS stockQuantity,
      stock_status AS stockStatus,
      manage_stock AS manageStock,
      permalink,
      modified_at AS modifiedAt,
      cache_page AS cachePage,
      search_index AS searchIndex,
      category_terms AS categoryTerms,
      attributes_json AS attributesJson
    FROM product_rows
    WHERE row_key = @rowKey
  `).get({ rowKey: key });
  return row ? deserializeCacheRow(row) : null;
}

function upsertProductRowsInDb(rows) {
  const updates = (Array.isArray(rows) ? rows : [rows]).filter(Boolean);
  if (!updates.length) return 0;

  const db = getProductDb();
  const insertRow = db.prepare(`
    INSERT OR REPLACE INTO product_rows (
      row_key, id, parent_id, type, name, sku, image_url, image_alt, image_local_path, image_status, image_downloaded_at,
      created_at, regular_price, sale_price, stock_quantity, stock_status, manage_stock,
      permalink, modified_at, cache_page, search_index, set_terms, language_terms, category_terms, attributes_json
    ) VALUES (
      @rowKey, @id, @parentId, @type, @name, @sku, @imageUrl, @imageAlt, @imageLocalPath, @imageStatus, @imageDownloadedAt,
      @createdAt, @regularPrice, @salePrice, @stockQuantity, @stockStatus, @manageStock,
      @permalink, @modifiedAt, @cachePage, @searchIndex, @setTerms, @languageTerms, @categoryTerms, @attributesJson
    )
  `);
  const deleteFts = ftsAvailable ? db.prepare("DELETE FROM product_rows_fts WHERE row_key = ?") : null;
  const insertFts = ftsAvailable
    ? db.prepare("INSERT INTO product_rows_fts (row_key, content) VALUES (?, ?)")
    : null;
  const updatedAt = new Date().toISOString();

  const transaction = db.transaction(() => {
    for (const row of updates) {
      const key = rowKey(row);
      const existing = productRowFromDb(db, key);
      const merged = existing
        ? {
            ...existing,
            ...row,
            attributes: row.attributes && row.attributes.length ? row.attributes : existing.attributes,
            categories: row.categories && row.categories.length ? row.categories : existing.categories,
            cachePage: row.cachePage === undefined || row.cachePage === null ? existing.cachePage : row.cachePage,
            imageLocalPath: row.imageLocalPath || existing.imageLocalPath || "",
            imageStatus: row.imageStatus || existing.imageStatus || "",
            imageDownloadedAt: row.imageDownloadedAt || existing.imageDownloadedAt || "",
            modifiedAt: row.modifiedAt || updatedAt
          }
        : { ...row, modifiedAt: row.modifiedAt || updatedAt };
      insertRow.run(serializeCacheRow(merged));
      if (deleteFts && insertFts) {
        deleteFts.run(key);
        insertFts.run(key, productFtsText(merged));
      }
    }
    setCacheMeta(db, "updatedAt", updatedAt);
    if (ftsAvailable) setCacheMeta(db, "ftsUpdatedAt", updatedAt);
  });
  transaction();
  return updates.length;
}

function rowCountFromDb(db = getProductDb()) {
  return db.prepare("SELECT COUNT(*) AS count FROM product_rows").get().count;
}

function updateCacheMetaInDb(meta = {}) {
  const db = getProductDb();
  const updatedAt = meta.updatedAt || new Date().toISOString();
  if (meta.storeUrl !== undefined) setCacheMeta(db, "storeUrl", meta.storeUrl || "");
  if (meta.complete !== undefined) setCacheMeta(db, "complete", meta.complete ? "true" : "false");
  if (meta.total !== undefined) setCacheMeta(db, "total", Number(meta.total || 0));
  if (meta.processedProducts !== undefined) setCacheMeta(db, "processedProducts", Number(meta.processedProducts || 0));
  if (meta.downloadedBytes !== undefined) setCacheMeta(db, "downloadedBytes", Number(meta.downloadedBytes || 0));
  setCacheMeta(db, "updatedAt", updatedAt);
}

function replaceCachePageInDb(page, rows, meta = {}) {
  const targetPage = Number(page);
  const db = getProductDb();
  const transaction = db.transaction(() => {
    if (ftsAvailable) {
      db.prepare(`
        DELETE FROM product_rows_fts
        WHERE row_key IN (SELECT row_key FROM product_rows WHERE cache_page = ?)
      `).run(targetPage);
    }
    db.prepare("DELETE FROM product_rows WHERE cache_page = ?").run(targetPage);
    db.prepare("INSERT OR REPLACE INTO cached_pages (page) VALUES (?)").run(targetPage);
  });
  transaction();
  upsertProductRowsInDb((rows || []).map((row) => ({ ...row, cachePage: targetPage })));
  updateCacheMetaInDb(meta);
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

const csvColumns = [
  "id",
  "parentId",
  "type",
  "name",
  "sku",
  "regularPrice",
  "salePrice",
  "stockQuantity",
  "stockStatus",
  "set",
  "language",
  "permalink"
];

function csvCell(value) {
  const text = String(value ?? "");
  return /[;"\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function csvLine(values) {
  return values.map(csvCell).join(";");
}

function rowCsvAttribute(row, keys) {
  return productRowTerms(row, keys).replace(/\s+/g, " ").trim();
}

function rowsToCsv(rows = []) {
  const lines = [csvLine(csvColumns)];
  rows.forEach((row) => {
    lines.push(csvLine([
      row.id,
      row.parentId || "",
      row.type || "",
      row.name || "",
      row.sku || "",
      row.regularPrice ?? "",
      row.salePrice ?? "",
      row.stockQuantity ?? "",
      row.stockStatus || "",
      rowCsvAttribute(row, ["set"]),
      rowCsvAttribute(row, ["lingua", "language"]),
      row.permalink || ""
    ]));
  });
  return `\ufeff${lines.join("\r\n")}\r\n`;
}

function detectCsvSeparator(headerLine) {
  const semicolons = (headerLine.match(/;/g) || []).length;
  const commas = (headerLine.match(/,/g) || []).length;
  return commas > semicolons ? "," : ";";
}

function parseCsv(text) {
  const cleanText = String(text || "").replace(/^\ufeff/, "");
  const separator = detectCsvSeparator(cleanText.split(/\r?\n/, 1)[0] || "");
  const rows = [];
  let cell = "";
  let row = [];
  let quoted = false;

  for (let index = 0; index < cleanText.length; index += 1) {
    const char = cleanText[index];
    const next = cleanText[index + 1];

    if (quoted) {
      if (char === '"' && next === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === separator) {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  if (cell || row.length) {
    row.push(cell.replace(/\r$/, ""));
    rows.push(row);
  }

  const header = (rows.shift() || []).map((value) => value.trim());
  const records = rows
    .filter((values) => values.some((value) => String(value || "").trim()))
    .map((values, index) => ({
      line: index + 2,
      data: Object.fromEntries(header.map((key, keyIndex) => [key, values[keyIndex] ?? ""]))
    }));

  return { header, records, separator };
}

function normalizeCsvPrice(value, fieldLabel) {
  const raw = String(value ?? "").trim();
  if (!raw) return { ok: true, value: "" };
  if (!/^\d+([,.]\d+)?$/.test(raw)) {
    return { ok: false, error: `${fieldLabel} non valido` };
  }
  return { ok: true, value: raw.replace(",", ".") };
}

function normalizeCsvQuantity(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return { ok: true, value: "" };
  if (!/^\d+([,.]0+)?$/.test(raw)) {
    return { ok: false, error: "Quantita non valida" };
  }
  return { ok: true, value: String(Number.parseInt(raw, 10)) };
}

function csvImportError(line, data, message) {
  return {
    line,
    id: String(data.id || "").trim(),
    parentId: String(data.parentId || "").trim(),
    sku: String(data.sku || "").trim(),
    message
  };
}

function changedCsvFields(baseRow, nextRow) {
  return ["regularPrice", "salePrice", "stockQuantity"].filter(
    (field) => String(baseRow[field] ?? "").trim() !== String(nextRow[field] ?? "").trim()
  );
}

async function exportRowsToCsv(rows = []) {
  const exportRows = Array.isArray(rows) ? rows : [];
  if (!exportRows.length) {
    return { canceled: false, saved: false, message: "Nessun prodotto da esportare." };
  }

  const stamp = new Date().toISOString().slice(0, 10);
  const result = await dialog.showSaveDialog(mainWindow, {
    title: "Esporta prodotti CSV",
    defaultPath: path.join(app.getPath("documents"), `prodotti-magazzino-${stamp}.csv`),
    filters: [{ name: "CSV", extensions: ["csv"] }]
  });

  if (result.canceled || !result.filePath) {
    addDiagnostic("csv", "Export annullato.");
    return { canceled: true };
  }

  await fs.writeFile(result.filePath, rowsToCsv(exportRows), "utf8");
  addDiagnostic("csv", `Export CSV completato: ${exportRows.length} righe.`);
  return {
    canceled: false,
    saved: true,
    filePath: result.filePath,
    rows: exportRows.length
  };
}

async function importRowsFromCsv() {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "Importa modifiche CSV",
    properties: ["openFile"],
    filters: [{ name: "CSV", extensions: ["csv"] }]
  });

  if (result.canceled || !result.filePaths || !result.filePaths[0]) {
    addDiagnostic("csv", "Import annullato.");
    return { canceled: true };
  }

  const filePath = result.filePaths[0];
  const parsed = parseCsv(await fs.readFile(filePath, "utf8"));
  const requiredHeaders = ["id", "parentId", "sku", "regularPrice", "salePrice", "stockQuantity"];
  const missingHeaders = requiredHeaders.filter((header) => !parsed.header.includes(header));
  if (missingHeaders.length) {
    throw new Error(`CSV non valido: mancano colonne ${missingHeaders.join(", ")}.`);
  }

  const cache = await readProductCache();
  const cachedRows = cache.rows || [];
  const byCompositeId = new Map(cachedRows.map((row) => [rowKey(row), row]));
  const skuGroups = new Map();
  cachedRows.forEach((row) => {
    const sku = String(row.sku || "").trim().toLowerCase();
    if (!sku) return;
    skuGroups.set(sku, [...(skuGroups.get(sku) || []), row]);
  });

  const summary = {
    canceled: false,
    filePath,
    rowsRead: parsed.records.length,
    matched: 0,
    changed: 0,
    unchanged: 0,
    ignored: 0,
    errors: [],
    changes: []
  };

  parsed.records.forEach(({ line, data }) => {
    const id = String(data.id || "").trim();
    const parentId = String(data.parentId || "").trim();
    const compositeKey = `${parentId || 0}:${id}`;
    let baseRow = id ? byCompositeId.get(compositeKey) : null;

    if (!baseRow) {
      const sku = String(data.sku || "").trim().toLowerCase();
      const skuMatches = sku ? skuGroups.get(sku) || [] : [];
      if (skuMatches.length === 1) baseRow = skuMatches[0];
      else if (skuMatches.length > 1) {
        summary.ignored += 1;
        summary.errors.push(csvImportError(line, data, "SKU non univoco, usa id e parentId"));
        return;
      }
    }

    if (!baseRow) {
      summary.ignored += 1;
      summary.errors.push(csvImportError(line, data, "Prodotto non trovato nella cache locale"));
      return;
    }

    const regularPrice = normalizeCsvPrice(data.regularPrice, "Prezzo");
    const salePrice = normalizeCsvPrice(data.salePrice, "Sconto");
    const stockQuantity = normalizeCsvQuantity(data.stockQuantity);
    const invalid = [regularPrice, salePrice, stockQuantity].find((entry) => !entry.ok);
    if (invalid) {
      summary.ignored += 1;
      summary.errors.push(csvImportError(line, data, invalid.error));
      return;
    }

    summary.matched += 1;
    const nextRow = {
      ...baseRow,
      regularPrice: regularPrice.value,
      salePrice: salePrice.value,
      stockQuantity: stockQuantity.value
    };
    const changedFields = changedCsvFields(baseRow, nextRow);
    if (!changedFields.length) {
      summary.unchanged += 1;
      return;
    }

    summary.changed += 1;
    summary.changes.push({ ...nextRow, importedFields: changedFields, importedBefore: historyRow(baseRow) });
  });

  addDiagnostic(
    "csv",
    `Import CSV: ${summary.rowsRead} lette, ${summary.matched} abbinate, ${summary.changed} modificate, ${summary.ignored} ignorate.`
  );
  return summary;
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
  const imageStats = await getImageCacheInfo();

  return {
    exists,
    path: productCacheDbPath(),
    type: "SQLite",
    cachedPages: Array.isArray(cache.cachedPages) ? cache.cachedPages : [],
    rows,
    total: Number(cache.total || 0),
    updatedAt: cache.updatedAt || "",
    size,
    imageCache: imageStats
  };
}

async function getImageCacheInfo() {
  let size = 0;
  let files = 0;
  try {
    const entries = await fs.readdir(imageCacheDir(), { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const stats = await fs.stat(path.join(imageCacheDir(), entry.name));
      size += stats.size;
      files += 1;
    }
  } catch {}

  let rows = 0;
  try {
    rows = getProductDb().prepare("SELECT COUNT(*) AS count FROM product_rows WHERE image_status = 'ok' AND image_local_path != ''").get().count;
  } catch {}

  return {
    path: imageCacheDir(),
    files,
    rows,
    size
  };
}

async function clearImageCache() {
  try {
    await fs.rm(imageCacheDir(), { recursive: true, force: true });
  } catch {}
  const db = getProductDb();
  db.prepare("UPDATE product_rows SET image_local_path = '', image_status = '', image_downloaded_at = ''").run();
  addDiagnostic("images", "Cache immagini svuotata.");
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("images:cleared");
  }
  return getCacheInfo();
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
  const cache = await readProductCacheSummary();
  const db = getProductDb();
  const transaction = db.transaction(() => {
    if (ftsAvailable) {
      db.prepare(`
        DELETE FROM product_rows_fts
        WHERE row_key IN (SELECT row_key FROM product_rows WHERE cache_page = ?)
      `).run(targetPage);
    }
    db.prepare("DELETE FROM product_rows WHERE cache_page = ?").run(targetPage);
    db.prepare("DELETE FROM cached_pages WHERE page = ?").run(targetPage);
    setCacheMeta(db, "updatedAt", new Date().toISOString());
  });
  transaction();
  const cachedPages = (cache.cachedPages || []).filter((cachedPage) => cachedPage !== targetPage);
  const rowCount = rowCountFromDb(db);
  addDiagnostic("cache", `Pagina ${targetPage} invalidata dalla cache.`);
  sendCacheStatus({
    syncing: false,
    complete: false,
    cached: cachedPages.length,
    total: cache.total || 0,
    rows: rowCount,
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

function imageExtensionFrom(contentType = "", imageUrl = "") {
  const type = String(contentType || "").toLowerCase();
  if (type.includes("png")) return ".png";
  if (type.includes("webp")) return ".webp";
  if (type.includes("gif")) return ".gif";
  if (type.includes("avif")) return ".avif";
  if (type.includes("jpeg") || type.includes("jpg")) return ".jpg";
  try {
    const ext = path.extname(new URL(imageUrl).pathname).toLowerCase();
    if ([".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif"].includes(ext)) return ext === ".jpeg" ? ".jpg" : ext;
  } catch {}
  return ".img";
}

function imageCacheFilePath(row, contentType = "") {
  const hash = crypto.createHash("sha1").update(row.imageUrl || rowKey(row)).digest("hex");
  return path.join(imageCacheDir(), `${row.parentId || 0}-${row.id}-${hash}${imageExtensionFrom(contentType, row.imageUrl)}`);
}

function updateImageCacheRow(row, imageLocalPath, imageStatus) {
  const downloadedAt = imageStatus === "ok" ? new Date().toISOString() : "";
  getProductDb().prepare(`
    UPDATE product_rows
    SET image_local_path = @imageLocalPath,
        image_status = @imageStatus,
        image_downloaded_at = @downloadedAt
    WHERE row_key = @rowKey
  `).run({
    rowKey: rowKey(row),
    imageLocalPath: imageLocalPath || "",
    imageStatus,
    downloadedAt
  });
  return downloadedAt;
}

async function cacheProductImage(row) {
  if (!row || !row.imageUrl) return;
  const key = rowKey(row);
  if (imageDownloads.has(key)) return;
  imageDownloads.add(key);

  try {
    if (row.imageLocalPath && row.imageStatus === "ok") {
      try {
        await fs.access(row.imageLocalPath);
        return;
      } catch {}
    }

    await fs.mkdir(imageCacheDir(), { recursive: true });
    const response = await fetch(row.imageUrl, { signal: AbortSignal.timeout(25000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.toLowerCase().startsWith("image/")) throw new Error("contenuto non immagine");
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const maxBytes = 8 * 1024 * 1024;
    if (buffer.length > maxBytes) throw new Error("immagine troppo grande");

    const filePath = imageCacheFilePath(row, contentType);
    await fs.writeFile(filePath, buffer);
    const downloadedAt = updateImageCacheRow(row, filePath, "ok");
    const cachedImageUrl = pathToFileURL(filePath).toString();
    addDiagnostic("images", `Immagine cache ok ID ${row.id}${row.parentId ? ` padre ${row.parentId}` : ""}: ${formatBytes(buffer.length)}.`);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("images:cached", {
        rowKey: key,
        imageLocalPath: filePath,
        cachedImageUrl,
        imageStatus: "ok",
        imageDownloadedAt: downloadedAt
      });
    }
  } catch (error) {
    updateImageCacheRow(row, "", "error");
    addDiagnostic("images", `Immagine cache errore ID ${row.id}${row.parentId ? ` padre ${row.parentId}` : ""}: ${error.message}`);
  } finally {
    imageDownloads.delete(key);
  }
}

function scheduleImageCacheForRows(rows = []) {
  const pendingRows = rows
    .filter((row) => row && row.imageUrl && (!row.imageLocalPath || row.imageStatus !== "ok"))
    .slice(0, 100);
  pendingRows.forEach((row, index) => {
    setTimeout(() => {
      cacheProductImage(row).catch(() => {});
    }, index * 80);
  });
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
    createdAt: item.date_created_gmt || product.date_created_gmt || "",
    regularPrice: item.regular_price || "",
    salePrice: item.sale_price || "",
    stockQuantity,
    stockStatus: item.stock_status || "",
    manageStock: Boolean(item.manage_stock),
    permalink: product.permalink || "",
    modifiedAt: item.date_modified_gmt || product.date_modified_gmt || "",
    attributes: normalizeRowAttributes(product, variation),
    categories: normalizeRowCategories(product)
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

function normalizeCsvList(value) {
  if (Array.isArray(value)) return value.map((item) => String(item || "").trim()).filter(Boolean);
  return String(value || "").split(",").map((item) => item.trim()).filter(Boolean);
}

function decimalFilterValue(value) {
  const text = String(value ?? "").trim().replace(",", ".");
  return text === "" || Number.isNaN(Number(text)) ? null : Number(text);
}

function rowPriceValue(row) {
  const value = String(row.regularPrice ?? "").trim().replace(",", ".");
  return value === "" || Number.isNaN(Number(value)) ? null : Number(value);
}

function rowQuantityValue(row) {
  const value = String(row.stockQuantity ?? "").trim();
  return value === "" || !Number.isInteger(Number(value)) ? null : Number(value);
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

function normalizeRowCategories(product) {
  return (product.categories || []).map((category) => ({
    id: category.id,
    name: String(category.name || ""),
    slug: String(category.slug || "")
  }));
}

function rowMatchesFilters(row, filters = {}) {
  const setTerm = normalizeSlug(filters.setTerm);
  const languageTerm = normalizeSlug(filters.languageTerm);
  const categoryIds = normalizeCsvList(filters.categoryIds);
  const hasAttribute = (key, term) => !term || row.attributes.some((attr) => attr.key === key && attr.term === term);
  const hasCategories = !categoryIds.length || categoryIds.every((categoryId) => productCategoryTerms(row).includes(`|${categoryId}|`));

  const hasLanguage = !languageTerm
    || hasAttribute("lingua", languageTerm)
    || hasAttribute("language", languageTerm);

  return hasAttribute("set", setTerm) && hasLanguage && hasCategories;
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
  const priceMin = decimalFilterValue(params.priceMin);
  const priceMax = decimalFilterValue(params.priceMax);
  const quantityMin = decimalFilterValue(params.quantityMin);
  const quantityMax = decimalFilterValue(params.quantityMax);
  const missingPrice = Boolean(params.missingPrice);
  const missingQuantity = Boolean(params.missingQuantity);
  return rows.filter((row) => {
    const price = rowPriceValue(row);
    const quantity = rowQuantityValue(row);
    return rowMatchesSearch(row, params.search)
      && rowMatchesStock(row, params.stockStatus)
      && rowMatchesFilters(row, params)
      && (!missingPrice || price === null)
      && (!missingQuantity || quantity === null)
      && (missingPrice || priceMin === null || (price !== null && price >= priceMin))
      && (missingPrice || priceMax === null || (price !== null && price <= priceMax))
      && (missingQuantity || quantityMin === null || (quantity !== null && quantity >= quantityMin))
      && (missingQuantity || quantityMax === null || (quantity !== null && quantity <= quantityMax));
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
  const categoryIds = normalizeCsvList(params.categoryIds);
  const priceMin = decimalFilterValue(params.priceMin);
  const priceMax = decimalFilterValue(params.priceMax);
  const quantityMin = decimalFilterValue(params.quantityMin);
  const quantityMax = decimalFilterValue(params.quantityMax);
  const missingPrice = Boolean(params.missingPrice);
  const missingQuantity = Boolean(params.missingQuantity);
  const hasFilters = Boolean(search || stockStatus || setTerm || languageTerm || categoryIds.length || priceMin !== null || priceMax !== null || quantityMin !== null || quantityMax !== null || missingPrice || missingQuantity);
  const hasCachedPage = !hasFilters && (cache.cachedPages || []).includes(page);
  const rows = cache.rows || [];

  if (hasFilters) {
    const filteredRows = filterCachedRows(rows, { search, stockStatus, setTerm, languageTerm, categoryIds, priceMin, priceMax, quantityMin, quantityMax, missingPrice, missingQuantity });
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
  const categoryIds = normalizeCsvList(params.categoryIds);
  const priceMin = decimalFilterValue(params.priceMin);
  const priceMax = decimalFilterValue(params.priceMax);
  const quantityMin = decimalFilterValue(params.quantityMin);
  const quantityMax = decimalFilterValue(params.quantityMax);
  const missingPrice = Boolean(params.missingPrice);
  const missingQuantity = Boolean(params.missingQuantity);
  const hasFilters = Boolean(search || stockStatus || setTerm || languageTerm || categoryIds.length || priceMin !== null || priceMax !== null || quantityMin !== null || quantityMax !== null || missingPrice || missingQuantity);
  const hasCachedPage = !hasFilters && (cache.cachedPages || []).includes(page);
  const where = [];
  const bindings = {};
  const useFts = Boolean(search && ftsAvailable);
  let ftsSql = "";
  let fromSql = "FROM product_rows";
  let orderSql = "ORDER BY COALESCE(created_at, modified_at, '') DESC, id DESC";

  if (hasFilters) {
    if (search) {
      if (useFts) {
        ftsSql = ftsQueryText(search);
        fromSql = "FROM product_rows JOIN product_rows_fts ON product_rows_fts.row_key = product_rows.row_key";
        where.push("product_rows_fts MATCH @ftsQuery");
        bindings.ftsQuery = ftsSql;
        orderSql = "ORDER BY bm25(product_rows_fts), COALESCE(created_at, modified_at, '') DESC, id DESC";
      } else {
        search.split(" ").forEach((token, index) => {
          where.push(`search_index LIKE @search${index} ESCAPE '\\'`);
          bindings[`search${index}`] = buildSqlLike(token);
        });
      }
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
    categoryIds.forEach((categoryId, index) => {
      where.push(`category_terms LIKE @category${index} ESCAPE '\\'`);
      bindings[`category${index}`] = `%|${String(categoryId).replace(/[\\%_]/g, (char) => `\\${char}`)}|%`;
    });
    if (missingPrice) {
      where.push("(regular_price IS NULL OR regular_price = '')");
    } else {
      if (priceMin !== null || priceMax !== null) {
        where.push("(regular_price IS NOT NULL AND regular_price != '')");
      }
      if (priceMin !== null) {
        where.push("CAST(regular_price AS REAL) >= @priceMin");
        bindings.priceMin = priceMin;
      }
      if (priceMax !== null) {
        where.push("CAST(regular_price AS REAL) <= @priceMax");
        bindings.priceMax = priceMax;
      }
    }
    if (missingQuantity) {
      where.push("(stock_quantity IS NULL OR stock_quantity = '')");
    } else {
      if (quantityMin !== null || quantityMax !== null) {
        where.push("(stock_quantity IS NOT NULL AND stock_quantity != '')");
      }
      if (quantityMin !== null) {
        where.push("CAST(stock_quantity AS REAL) >= @quantityMin");
        bindings.quantityMin = quantityMin;
      }
      if (quantityMax !== null) {
        where.push("CAST(stock_quantity AS REAL) <= @quantityMax");
        bindings.quantityMax = quantityMax;
      }
    }
  } else if (hasCachedPage) {
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
  let totalRow = null;
  let rows = [];
  try {
    totalRow = db.prepare(`SELECT COUNT(*) AS total ${fromSql} ${whereSql}`).get(bindings);
    const total = hasCachedPage ? Number(cache.total || (totalRow ? totalRow.total : 0)) : Number(totalRow ? totalRow.total : 0);
    const offset = hasCachedPage ? 0 : (page - 1) * pageSize;
    rows = db.prepare(`
      SELECT
        id,
        parent_id AS parentId,
        type,
        name,
        sku,
        image_url AS imageUrl,
        image_alt AS imageAlt,
        image_local_path AS imageLocalPath,
        image_status AS imageStatus,
        image_downloaded_at AS imageDownloadedAt,
        created_at AS createdAt,
        regular_price AS regularPrice,
        sale_price AS salePrice,
        stock_quantity AS stockQuantity,
        stock_status AS stockStatus,
        manage_stock AS manageStock,
        permalink,
        modified_at AS modifiedAt,
        cache_page AS cachePage,
        search_index AS searchIndex,
        category_terms AS categoryTerms,
        attributes_json AS attributesJson
      ${fromSql}
      ${whereSql}
      ${orderSql}
      LIMIT @limit OFFSET @offset
    `).all({ ...bindings, limit: pageSize, offset }).map(deserializeCacheRow);

    addDiagnostic(useFts ? "fts" : "sqlite", `${useFts ? "FTS query" : (hasFilters ? "Query filtri" : "Query pagina")} ${page}: ${rows.length}/${total} righe in ${Date.now() - startedAt}ms.`);
    return {
      rows,
      total,
      totalPages: Math.max(Math.ceil(total / pageSize), 1),
      page,
      source: hasFilters ? "local-filter" : "cache",
      hasFilters
    };
  } catch (error) {
    if (useFts) {
      addDiagnostic("fts", `FTS fallback LIKE: ${error.message}`);
      const fallbackParams = { ...params, disableFts: true };
      const previous = ftsAvailable;
      ftsAvailable = false;
      try {
        return localProductResultFromDb(cache, fallbackParams);
      } finally {
        ftsAvailable = previous;
      }
    }
    throw error;
  }
}

function rowKey(row) {
  return `${row.parentId || 0}:${row.id}`;
}

function mergeRows(existingRows = [], nextRows = []) {
  const map = new Map(existingRows.map((row) => [rowKey(row), row]));
  for (const row of nextRows) {
    const key = rowKey(row);
    const existing = map.get(key);
    const preservedImage = existing && existing.imageUrl === row.imageUrl
      ? {
          imageLocalPath: existing.imageLocalPath || "",
          cachedImageUrl: existing.cachedImageUrl || "",
          imageStatus: existing.imageStatus || "",
          imageDownloadedAt: existing.imageDownloadedAt || ""
        }
      : {};
    map.set(key, {
      ...row,
      ...preservedImage,
      cachePage: existing && existing.cachePage && !row.cachePage ? existing.cachePage : row.cachePage
    });
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

async function getProductCategoryTerms() {
  const terms = [];
  let totalPages = 1;
  for (let page = 1; page <= totalPages; page += 1) {
    const result = await wooRequest("products/categories", {
      query: { page, per_page: 100, orderby: "name", order: "asc" }
    });
    totalPages = result.totalPages || 1;
    terms.push(...(result.data || []).map((term) => ({
      id: term.id,
      name: term.name,
      slug: term.slug
    })));
  }
  return terms;
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
    } : null,
    categories: {
      terms: await getProductCategoryTerms()
    }
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
  const categoryIds = normalizeCsvList(params.categoryIds);
  const priceMin = decimalFilterValue(params.priceMin);
  const priceMax = decimalFilterValue(params.priceMax);
  const quantityMin = decimalFilterValue(params.quantityMin);
  const quantityMax = decimalFilterValue(params.quantityMax);
  const missingPrice = Boolean(params.missingPrice);
  const missingQuantity = Boolean(params.missingQuantity);
  const query = {};
  let localAttributeFilter = Boolean(setTerm || languageTerm || quantityMin !== null || quantityMax !== null || missingPrice || missingQuantity);

  if (search) {
    query.search = search;
    query.search_fields = "name,sku";
  }

  if (stockStatus) query.stock_status = stockStatus;
  if (categoryIds.length) query.category = categoryIds.join(",");
  if (!missingPrice && priceMin !== null) query.min_price = String(priceMin);
  if (!missingPrice && priceMax !== null) query.max_price = String(priceMax);

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
  const pageSize = 100;
  const targetPage = Math.max(Number(page || 1), 1);
  const wantedRows = targetPage * pageSize + (useLocalAttributeFilter ? 1 : 0);
  let query = {
    page: targetPage,
    per_page: 100,
    status: "publish",
    orderby: "date",
    order: "desc",
    _fields: productFields,
    ...filters.query
  };
  let totalBytes = 0;
  let processedProducts = 0;

  const requestProductsPage = async (targetRemotePage, baseQuery) => {
    let nextQuery = { ...baseQuery, page: targetRemotePage };
    try {
      return await wooRequest("products", { query: nextQuery });
    } catch (error) {
      if (!nextQuery.search_fields && !nextQuery.attribute) throw error;
      nextQuery = { ...nextQuery };
      delete nextQuery.search_fields;
      if (nextQuery.attribute) {
        delete nextQuery.attribute;
        delete nextQuery.attribute_term;
        useLocalAttributeFilter = filters.localAttributeFilter;
      }
      return wooRequest("products", { query: nextQuery });
    }
  };

  const mapProductsToRows = async (products = []) => {
    const pageRows = await mapLimit(products, 3, async (product) => {
      if (product.type === "variable") {
        const variations = await wooRequest(`products/${product.id}/variations`, {
          query: { per_page: 100, orderby: "date", order: "desc", _fields: variationFields }
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
    totalBytes += pageRows.reduce((total, item) => total + (item.bytes || 0), 0);
    return pageRows.flatMap((item) => item.rows);
  };

  if (useLocalAttributeFilter) {
    const collectedRows = [];
    let remoteTotal = 0;
    let totalPages = 1;
    let remotePage = 1;

    while (remotePage <= totalPages && collectedRows.length < wantedRows) {
      const result = await requestProductsPage(remotePage, query);
      remoteTotal = result.total;
      totalPages = result.totalPages || 1;
      totalBytes += result.bytes || 0;
      processedProducts += (result.data || []).length;

      const unfilteredRows = await mapProductsToRows(result.data || []);
      collectedRows.push(...filterCachedRows(unfilteredRows, params));
      remotePage += 1;
    }

    const exhausted = remotePage > totalPages;
    const start = (targetPage - 1) * pageSize;
    const rows = collectedRows.slice(start, start + pageSize);
    const total = exhausted ? collectedRows.length : Math.max(remoteTotal, collectedRows.length);

    return {
      rows: rows.map((row) => ({ ...row, cachePage: params.cachePage || null })),
      bytes: totalBytes,
      processedProducts,
      total,
      totalPages: exhausted ? Math.max(Math.ceil(total / pageSize), 1) : Math.max(Math.ceil(total / pageSize), targetPage + 1),
      remoteTotal
    };
  }

  let result = await requestProductsPage(targetPage, query);
  totalBytes += result.bytes || 0;
  processedProducts += (result.data || []).length;

  const rows = await mapProductsToRows(result.data || []);

  return {
    rows: rows.map((row) => ({ ...row, cachePage: params.cachePage || null })),
    bytes: totalBytes,
    processedProducts,
    total: result.total,
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
          query: { per_page: 100, orderby: "date", order: "desc", _fields: variationFields }
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
        upsertProductRowsInDb(modified.rows);
        updateCacheMetaInDb({ updatedAt: new Date().toISOString() });
        const freshCache = await readProductCacheSummary();
        const rowCount = rowCountFromDb();
        sendCacheStatus({
          syncing: false,
          complete: Boolean(freshCache.complete),
          cached: freshCache.processedProducts || freshCache.total || rowCount,
          total: freshCache.total || rowCount,
          rows: rowCount,
          message: `Cache aggiornata: ${modified.rows.length} righe modificate.`
        });
        addDiagnostic("cache", `Aggiornate ${modified.rows.length} righe modificate.`);
      } else {
        updateCacheMetaInDb({ updatedAt: new Date().toISOString() });
        const freshCache = await readProductCacheSummary();
        const rowCount = rowCountFromDb();
        sendCacheStatus({
          syncing: false,
          complete: Boolean(freshCache.complete),
          cached: freshCache.processedProducts || freshCache.total || rowCount,
          total: freshCache.total || rowCount,
          rows: rowCount,
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
ipcMain.handle("cache:clear-images", async () => clearImageCache());
ipcMain.handle("cache:refresh-page", async (_event, page) => refreshCachePage(page));
ipcMain.handle("diagnostics:get", async () => diagnosticLog.map((entry) => `[${entry.time}] ${entry.event}: ${entry.detail}`).join("\n"));
ipcMain.handle("history:get", async () => (await readChangeHistory()).map(formatHistoryEntry).reverse().join("\n"));
ipcMain.handle("history:clear", async () => clearChangeHistory());
ipcMain.handle("csv:export", async (_event, rows = []) => exportRowsToCsv(rows));
ipcMain.handle("csv:import", async () => importRowsFromCsv());
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
  const categoryIds = normalizeCsvList(params.categoryIds);
  const priceMin = decimalFilterValue(params.priceMin);
  const priceMax = decimalFilterValue(params.priceMax);
  const quantityMin = decimalFilterValue(params.quantityMin);
  const quantityMax = decimalFilterValue(params.quantityMax);
  const missingPrice = Boolean(params.missingPrice);
  const missingQuantity = Boolean(params.missingQuantity);
  const pageSize = 100;
  let cache = await ensureProductCache(false);
  const hasFilters = Boolean(search || stockStatus || setTerm || languageTerm || categoryIds.length || priceMin !== null || priceMax !== null || quantityMin !== null || quantityMax !== null || missingPrice || missingQuantity);
  const listParams = { page, search, stockStatus, setTerm, languageTerm, categoryIds, priceMin, priceMax, quantityMin, quantityMax, missingPrice, missingQuantity };
  const skipLocal = Boolean(params.skipLocal);
  const localResult = skipLocal
    ? {
        rows: [],
        total: cache.total || 0,
        totalPages: Math.max(Math.ceil((cache.total || 0) / pageSize), 1),
        page,
        source: "miss",
        hasFilters
      }
    : localProductResultFromDb(cache, listParams);
  const forceRemote = Boolean(params.forceRemote);
  const localOnly = Boolean(params.localOnly);
  const silent = Boolean(params.silent);
  let remoteTotal = 0;

  if (localOnly) {
    addDiagnostic("cache", hasFilters
      ? `Ricerca locale pagina ${page}: ${localResult.rows.length}/${localResult.total} righe in ${Date.now() - startedAt}ms.`
      : (localResult.source === "cache" ? `Cache hit pagina ${page} in ${Date.now() - startedAt}ms.` : `Cache miss locale pagina ${page} in ${Date.now() - startedAt}ms.`));
    scheduleImageCacheForRows(localResult.rows);
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
        categoryIds,
        priceMin,
        priceMax,
        quantityMin,
        quantityMax,
        missingPrice,
        missingQuantity,
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
        scheduleImageCacheForRows(localResult.rows);
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
    const updatedAt = new Date().toISOString();
    const processedProducts = hasFilters
      ? Number(cache.processedProducts || 0)
      : Math.min(Math.max(Number(cache.processedProducts || 0), page * 100), pageRows.total || page * 100);
    if (hasFilters) {
      upsertProductRowsInDb(pageRows.rows);
      updateCacheMetaInDb({
        storeUrl: config.storeUrl,
        complete: false,
        total: cache.total || pageRows.total,
        processedProducts,
        downloadedBytes: productCacheStats.downloadedBytes,
        updatedAt
      });
    } else {
      replaceCachePageInDb(page, pageRows.rows, {
        storeUrl: config.storeUrl,
        complete: false,
        total: pageRows.total,
        processedProducts,
        downloadedBytes: productCacheStats.downloadedBytes,
        updatedAt
      });
    }
    cache = await readProductCacheSummary();
    const rowCount = rowCountFromDb();
    const progress = cacheProgressText(Math.min(page * 100, pageRows.total || cache.total), pageRows.total || cache.total);
    if (!silent) {
      sendCacheStatus({
        syncing: false,
        complete: false,
        cached: hasFilters ? rowCount : (cache.cachedPages || []).length * 100,
        total: cache.total || pageRows.total,
        rows: rowCount,
        downloadedBytes: progress.downloadedBytes,
        estimatedTotalBytes: progress.estimatedTotalBytes,
        bytesPerSecond: progress.bytesPerSecond,
        etaSeconds: progress.etaSeconds,
        message: hasFilters
          ? `Ricerca salvata in cache: ${pageRows.rows.length} righe trovate. Cache locale: ${rowCount} righe.`
          : `Pagina ${page} salvata in cache. Cache locale: ${(cache.cachedPages || []).length} pagine, ${rowCount} righe.`
      });
    }
    addDiagnostic("cache", hasFilters
      ? `Ricerca remota pagina ${page} completata: ${pageRows.rows.length} righe in ${Date.now() - startedAt}ms.`
      : `Pagina ${page} scaricata: ${pageRows.rows.length} righe in ${Date.now() - startedAt}ms.`);
    scheduleImageCacheForRows(pageRows.rows);
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

  scheduleImageCacheForRows(localResult.rows);
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
    const processedProducts = Math.min(
      Math.max(Number(cache.processedProducts || 0), page * 100),
      pageRows.total || page * 100
    );
    replaceCachePageInDb(page, pageRows.rows, {
      storeUrl: config.storeUrl,
      complete: false,
      total: pageRows.total || cache.total,
      processedProducts,
      updatedAt: new Date().toISOString()
    });
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
  await fs.mkdir(path.dirname(productCacheDbPath()), { recursive: true });
  return upsertProductRowsInDb(rows);
}

ipcMain.handle("products:update", async (_event, row, previousRow = null) => {
  if (productCacheStatus.syncing) {
    throw new Error("Cache prodotti in generazione. Attendi il completamento prima di modificare.");
  }

  let cacheWarning = "";
  try {
    await updateProductRemote(row);
  } catch (error) {
    try {
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
    } catch (historyError) {
      addDiagnostic("history", `Storico non aggiornato dopo errore salvataggio: ${historyError.message}`);
    }
    addDiagnostic("products", `Errore salvataggio ${row.parentId ? `${row.parentId}/` : ""}${row.id}${row.sku ? ` SKU ${row.sku}` : ""}: ${error.message}`);
    throw error;
  }

  try {
    await updateRowsInProductCache(row);
  } catch (error) {
    cacheWarning = error.message || "Cache locale non aggiornata";
    addDiagnostic("cache", `WooCommerce salvato, cache locale non aggiornata per ${row.parentId ? `${row.parentId}/` : ""}${row.id}: ${cacheWarning}`);
  }

  try {
    await appendChangeHistory({
      status: "ok",
      productId: row.id,
      parentId: row.parentId || null,
      name: row.name || "",
      sku: row.sku || "",
      before: historyRow(previousRow || row),
      after: historyRow(row),
      warning: cacheWarning
    });
  } catch (error) {
    addDiagnostic("history", `WooCommerce salvato, storico non aggiornato per ${row.parentId ? `${row.parentId}/` : ""}${row.id}: ${error.message}`);
  }

  return { ok: true, cacheWarning };
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
  let cacheWarning = "";
  try {
    await updateRowsInProductCache(savedRows);
  } catch (error) {
    cacheWarning = error.message || "Cache locale non aggiornata";
    addDiagnostic("cache", `WooCommerce bulk salvato, cache locale non aggiornata: ${cacheWarning}`);
  }
  addDiagnostic("products", `Salvataggio bulk completato: ${savedRows.length} salvati, ${updates.length - savedRows.length} non salvati.`);

  return {
    saved: savedRows.length,
    failed: updates.length - savedRows.length,
    results,
    cacheWarning
  };
});
