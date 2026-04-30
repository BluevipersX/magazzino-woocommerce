const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const { autoUpdater } = require("electron-updater");
const path = require("path");
const fs = require("fs/promises");

let mainWindow;
let updateState = "Aggiornamenti non controllati.";
const windowIcon = path.join(__dirname, "..", "build", "icon.png");

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 1180,
    minHeight: 720,
    title: "Magazzino WooCommerce",
    icon: windowIcon,
    backgroundColor: "#f4f7f5",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));
};

function sendUpdateState(message) {
  updateState = message;
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
  });

  autoUpdater.on("download-progress", (progress) => {
    sendUpdateState(`Download aggiornamento ${Math.round(progress.percent)}%.`);
  });

  autoUpdater.on("update-downloaded", async (info) => {
    sendUpdateState(`Aggiornamento ${info.version} pronto.`);
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
  });
}

async function checkForUpdates() {
  if (!app.isPackaged) {
    sendUpdateState("Aggiornamenti attivi nella versione installata.");
    return false;
  }

  await autoUpdater.checkForUpdates();
  return true;
}

app.whenReady().then(async () => {
  createWindow();
  setupAutoUpdates();
  setTimeout(() => {
    checkForUpdates().catch((error) => sendUpdateState(`Aggiornamenti non disponibili: ${error.message}`));
  }, 1500);
});

app.on("window-all-closed", () => {
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
  const name = variation
    ? `${product.name} - ${variation.attributes.map((attr) => attr.option).filter(Boolean).join(" / ")}`
    : product.name;

  return {
    id: item.id,
    parentId: variation ? product.id : null,
    type: variation ? "variation" : product.type,
    name,
    sku,
    regularPrice: item.regular_price || "",
    salePrice: item.sale_price || "",
    stockQuantity,
    stockStatus: item.stock_status || "",
    manageStock: Boolean(item.manage_stock),
    permalink: product.permalink || ""
  };
}

ipcMain.handle("config:get", readConfig);
ipcMain.handle("config:save", async (_event, config) => writeConfig(config));
ipcMain.handle("updates:state", async () => updateState);
ipcMain.handle("updates:check", async () => checkForUpdates());

ipcMain.handle("woo:test", async () => {
  await wooRequest("products", { query: { per_page: 1 } });
  return true;
});

ipcMain.handle("products:list", async (_event, params = {}) => {
  const page = Math.max(Number(params.page || 1), 1);
  const search = String(params.search || "").trim();
  const stockStatus = String(params.stockStatus || "");

  const result = await wooRequest("products", {
    query: {
      page,
      per_page: 50,
      search,
      status: "publish",
      stock_status: stockStatus
    }
  });

  const rows = [];
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

  return {
    rows,
    page,
    total: result.total,
    totalPages: result.totalPages
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
