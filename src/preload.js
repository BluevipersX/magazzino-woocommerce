const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("magazzino", {
  getConfig: () => ipcRenderer.invoke("config:get"),
  saveConfig: (config) => ipcRenderer.invoke("config:save", config),
  testConnection: () => ipcRenderer.invoke("woo:test"),
  getAttributeFilters: () => ipcRenderer.invoke("attributes:filters"),
  listProducts: (params) => ipcRenderer.invoke("products:list", params),
  preloadProductPage: (params) => ipcRenderer.invoke("products:preload-page", params),
  updateProduct: (row, previousRow) => ipcRenderer.invoke("products:update", row, previousRow),
  updateProducts: (rows) => ipcRenderer.invoke("products:bulk-update", rows),
  getUpdateState: () => ipcRenderer.invoke("updates:state"),
  checkForUpdates: () => ipcRenderer.invoke("updates:check"),
  getCacheStatus: () => ipcRenderer.invoke("cache:status"),
  getCacheInfo: () => ipcRenderer.invoke("cache:info"),
  clearCache: () => ipcRenderer.invoke("cache:clear"),
  refreshCachePage: (page) => ipcRenderer.invoke("cache:refresh-page", page),
  getDiagnostics: () => ipcRenderer.invoke("diagnostics:get"),
  getHistory: () => ipcRenderer.invoke("history:get"),
  clearHistory: () => ipcRenderer.invoke("history:clear"),
  minimizeWindow: () => ipcRenderer.invoke("window:minimize"),
  toggleMaximizeWindow: () => ipcRenderer.invoke("window:toggle-maximize"),
  closeWindow: () => ipcRenderer.invoke("window:close"),
  isWindowMaximized: () => ipcRenderer.invoke("window:is-maximized"),
  quitApp: () => ipcRenderer.invoke("app:quit"),
  openRepository: () => ipcRenderer.invoke("app:open-repository"),
  getAppVersion: () => ipcRenderer.invoke("app:version"),
  showHelp: () => ipcRenderer.invoke("app:show-help"),
  onUpdateState: (callback) => {
    const listener = (_event, message) => callback(message);
    ipcRenderer.on("updates:state", listener);
    return () => ipcRenderer.removeListener("updates:state", listener);
  },
  onCacheStatus: (callback) => {
    const listener = (_event, status) => callback(status);
    ipcRenderer.on("cache:status", listener);
    return () => ipcRenderer.removeListener("cache:status", listener);
  },
  onWindowMaximized: (callback) => {
    const listener = (_event, isMaximized) => callback(isMaximized);
    ipcRenderer.on("window:maximized", listener);
    return () => ipcRenderer.removeListener("window:maximized", listener);
  }
});
