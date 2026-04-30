const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("magazzino", {
  getConfig: () => ipcRenderer.invoke("config:get"),
  saveConfig: (config) => ipcRenderer.invoke("config:save", config),
  testConnection: () => ipcRenderer.invoke("woo:test"),
  getAttributeFilters: () => ipcRenderer.invoke("attributes:filters"),
  listProducts: (params) => ipcRenderer.invoke("products:list", params),
  updateProduct: (row) => ipcRenderer.invoke("products:update", row),
  getUpdateState: () => ipcRenderer.invoke("updates:state"),
  checkForUpdates: () => ipcRenderer.invoke("updates:check"),
  getCacheStatus: () => ipcRenderer.invoke("cache:status"),
  minimizeWindow: () => ipcRenderer.invoke("window:minimize"),
  toggleMaximizeWindow: () => ipcRenderer.invoke("window:toggle-maximize"),
  closeWindow: () => ipcRenderer.invoke("window:close"),
  isWindowMaximized: () => ipcRenderer.invoke("window:is-maximized"),
  quitApp: () => ipcRenderer.invoke("app:quit"),
  openRepository: () => ipcRenderer.invoke("app:open-repository"),
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
