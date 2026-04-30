const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("magazzino", {
  getConfig: () => ipcRenderer.invoke("config:get"),
  saveConfig: (config) => ipcRenderer.invoke("config:save", config),
  testConnection: () => ipcRenderer.invoke("woo:test"),
  listProducts: (params) => ipcRenderer.invoke("products:list", params),
  updateProduct: (row) => ipcRenderer.invoke("products:update", row),
  getUpdateState: () => ipcRenderer.invoke("updates:state"),
  checkForUpdates: () => ipcRenderer.invoke("updates:check"),
  onUpdateState: (callback) => {
    const listener = (_event, message) => callback(message);
    ipcRenderer.on("updates:state", listener);
    return () => ipcRenderer.removeListener("updates:state", listener);
  }
});
