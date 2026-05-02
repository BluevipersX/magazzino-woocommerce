const state = {
  rows: [],
  page: 1,
  totalPages: 1,
  loading: false,
  cacheSyncing: false,
  savingBulk: false,
  requestId: 0,
  searchTimer: null,
  dirtyRows: new Map(),
  theme: localStorage.getItem("theme") || "light"
};

const els = {
  minimizeButton: document.querySelector("#minimizeButton"),
  maximizeButton: document.querySelector("#maximizeButton"),
  closeButton: document.querySelector("#closeButton"),
  menuSettingsButton: document.querySelector("#menuSettingsButton"),
  menuRefreshButton: document.querySelector("#menuRefreshButton"),
  menuQuitButton: document.querySelector("#menuQuitButton"),
  menuUpdateButton: document.querySelector("#menuUpdateButton"),
  listViewButton: document.querySelector("#listViewButton"),
  gridViewButton: document.querySelector("#gridViewButton"),
  inlineListViewButton: document.querySelector("#inlineListViewButton"),
  inlineGridViewButton: document.querySelector("#inlineGridViewButton"),
  helpButton: document.querySelector("#helpButton"),
  helpModal: document.querySelector("#helpModal"),
  helpVersion: document.querySelector("#helpVersion"),
  closeHelpButton: document.querySelector("#closeHelpButton"),
  themeToggleButton: document.querySelector("#themeToggleButton"),
  configForm: document.querySelector("#configForm"),
  configModal: document.querySelector("#configModal"),
  diagnosticsModal: document.querySelector("#diagnosticsModal"),
  historyModal: document.querySelector("#historyModal"),
  confirmSaveModal: document.querySelector("#confirmSaveModal"),
  settingsButton: document.querySelector("#settingsButton"),
  closeSettingsButton: document.querySelector("#closeSettingsButton"),
  storeUrl: document.querySelector("#storeUrl"),
  consumerKey: document.querySelector("#consumerKey"),
  consumerSecret: document.querySelector("#consumerSecret"),
  testButton: document.querySelector("#testButton"),
  clearCacheButton: document.querySelector("#clearCacheButton"),
  refreshCachePageButton: document.querySelector("#refreshCachePageButton"),
  diagnosticsButton: document.querySelector("#diagnosticsButton"),
  cacheInfoText: document.querySelector("#cacheInfoText"),
  diagnosticsText: document.querySelector("#diagnosticsText"),
  refreshDiagnosticsButton: document.querySelector("#refreshDiagnosticsButton"),
  copyDiagnosticsButton: document.querySelector("#copyDiagnosticsButton"),
  closeDiagnosticsButton: document.querySelector("#closeDiagnosticsButton"),
  historyButton: document.querySelector("#historyButton"),
  clearHistoryButton: document.querySelector("#clearHistoryButton"),
  copyHistoryButton: document.querySelector("#copyHistoryButton"),
  historyText: document.querySelector("#historyText"),
  refreshHistoryButton: document.querySelector("#refreshHistoryButton"),
  copyHistoryModalButton: document.querySelector("#copyHistoryModalButton"),
  closeHistoryButton: document.querySelector("#closeHistoryButton"),
  confirmSaveTitle: document.querySelector("#confirmSaveTitle"),
  confirmSaveSummary: document.querySelector("#confirmSaveSummary"),
  confirmSaveButton: document.querySelector("#confirmSaveButton"),
  cancelSaveButton: document.querySelector("#cancelSaveButton"),
  searchInput: document.querySelector("#searchInput"),
  setFilter: document.querySelector("#setFilter"),
  languageFilter: document.querySelector("#languageFilter"),
  stockFilter: document.querySelector("#stockFilter"),
  refreshButton: document.querySelector("#refreshButton"),
  updateButton: document.querySelector("#updateButton"),
  updateText: document.querySelector("#updateText"),
  firstButton: document.querySelector("#firstButton"),
  prev5Button: document.querySelector("#prev5Button"),
  prevButton: document.querySelector("#prevButton"),
  nextButton: document.querySelector("#nextButton"),
  next5Button: document.querySelector("#next5Button"),
  lastButton: document.querySelector("#lastButton"),
  pageText: document.querySelector("#pageText"),
  bulkBar: document.querySelector("#bulkBar"),
  bulkCount: document.querySelector("#bulkCount"),
  saveAllButton: document.querySelector("#saveAllButton"),
  discardAllButton: document.querySelector("#discardAllButton"),
  statusText: document.querySelector("#statusText"),
  cacheText: document.querySelector("#cacheText"),
  cacheOverlay: document.querySelector("#cacheOverlay"),
  cacheOverlayText: document.querySelector("#cacheOverlayText"),
  productBody: document.querySelector("#productBody"),
  tableShell: document.querySelector(".tableShell"),
  gridShell: document.querySelector("#gridShell")
};

function setStatus(message, tone = "normal") {
  els.statusText.textContent = message;
  els.statusText.dataset.tone = tone;
}

function setCacheStatus(status = {}) {
  state.cacheSyncing = Boolean(status.syncing);
  const message = status.message || "Cache prodotti non inizializzata.";
  els.cacheText.textContent = message;
  els.cacheOverlayText.textContent = message;
  els.cacheOverlay.classList.toggle("open", state.cacheSyncing);
  els.cacheOverlay.setAttribute("aria-hidden", state.cacheSyncing ? "false" : "true");
  els.cacheText.dataset.tone = status.syncing ? "busy" : status.complete ? "ok" : "normal";
  renderRows();
}

function applyTheme(theme) {
  state.theme = theme === "dark" ? "dark" : "light";
  document.documentElement.dataset.theme = state.theme;
  localStorage.setItem("theme", state.theme);
  els.themeToggleButton.textContent = state.theme === "dark" ? "Tema chiaro" : "Tema scuro";
}

function toggleTheme() {
  applyTheme(state.theme === "dark" ? "light" : "dark");
}

function setProductView(view) {
  const nextView = view === "grid" ? "grid" : "list";
  localStorage.setItem("productView", nextView);
  els.tableShell.classList.toggle("hidden", nextView === "grid");
  els.gridShell.classList.toggle("active", nextView === "grid");
  els.inlineListViewButton.classList.toggle("active", nextView === "list");
  els.inlineGridViewButton.classList.toggle("active", nextView === "grid");
  els.listViewButton.textContent = nextView === "list" ? "Vista elenco attiva" : "Vista elenco";
  els.gridViewButton.textContent = nextView === "grid" ? "Vista griglia attiva" : "Vista griglia";
  renderRows();
}

function hasConfig() {
  return Boolean(els.storeUrl.value.trim() && els.consumerKey.value.trim() && els.consumerSecret.value.trim());
}

function openSettings() {
  els.configModal.classList.add("open");
  els.configModal.setAttribute("aria-hidden", "false");
  refreshCacheInfo();
  setTimeout(() => els.storeUrl.focus(), 0);
}

function closeSettings() {
  if (!hasConfig()) {
    setStatus("Configura il negozio WooCommerce per iniziare.", "error");
    return;
  }
  els.configModal.classList.remove("open");
  els.configModal.setAttribute("aria-hidden", "true");
}

function setUpdateStatus(message) {
  els.updateText.textContent = String(message || "")
    .replace("Aggiornamenti non disponibili:", "Update:")
    .replace("Update non disponibile:", "Controllo update non riuscito:")
    .replace("GitHub release 403", "GitHub temporaneamente non disponibile")
    .replace("GitHub latest.yml 403", "GitHub temporaneamente non disponibile");
}

function formatBytes(value) {
  const bytes = Number(value || 0);
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

async function refreshCacheInfo() {
  const info = await window.magazzino.getCacheInfo();
  const pages = info.cachedPages && info.cachedPages.length ? info.cachedPages.join(", ") : "nessuna";
  const updatedAt = info.updatedAt ? new Date(info.updatedAt).toLocaleString("it-IT") : "mai";
  els.cacheInfoText.textContent = `Pagine: ${pages}. Righe: ${info.rows}. Totale sito: ${info.total || "-"}. Ultimo update: ${updatedAt}. File: ${info.exists ? formatBytes(info.size) : "non presente"} - ${info.path}`;
}

async function openDiagnostics() {
  els.diagnosticsModal.classList.add("open");
  els.diagnosticsModal.setAttribute("aria-hidden", "false");
  els.diagnosticsText.value = await window.magazzino.getDiagnostics();
}

function closeDiagnostics() {
  els.diagnosticsModal.classList.remove("open");
  els.diagnosticsModal.setAttribute("aria-hidden", "true");
}

async function openHistory() {
  els.historyModal.classList.add("open");
  els.historyModal.setAttribute("aria-hidden", "false");
  els.historyText.value = await window.magazzino.getHistory();
}

function closeHistory() {
  els.historyModal.classList.remove("open");
  els.historyModal.setAttribute("aria-hidden", "true");
}

async function copyHistory() {
  const history = await window.magazzino.getHistory();
  els.historyText.value = history;
  await navigator.clipboard.writeText(history);
  setStatus("Storico copiato.", "ok");
}

async function openHelp() {
  try {
    const version = await window.magazzino.getAppVersion();
    els.helpVersion.textContent = `Versione ${version}`;
  } catch {
    els.helpVersion.textContent = "Versione non disponibile";
  }
  els.helpModal.classList.add("open");
  els.helpModal.setAttribute("aria-hidden", "false");
}

function closeHelp() {
  els.helpModal.classList.remove("open");
  els.helpModal.setAttribute("aria-hidden", "true");
}

function setLoading(loading) {
  state.loading = loading;
  els.refreshButton.disabled = loading;
  updateBulkControls();
  renderRows();
}

function moneyValue(value) {
  return value === null || value === undefined ? "" : String(value);
}

function stockLabel(stockStatus) {
  if (stockStatus === "outofstock") return "Esaurito";
  if (stockStatus === "onbackorder") return "Arretrato";
  return "Disponibile";
}

function rowKey(row) {
  return `${row.parentId || 0}:${row.id}`;
}

function editableRow(row) {
  const dirty = state.dirtyRows.get(rowKey(row));
  return dirty ? { ...row, ...dirty } : row;
}

function editableSnapshot(row) {
  return {
    regularPrice: moneyValue(row.regularPrice).trim(),
    salePrice: moneyValue(row.salePrice).trim(),
    stockQuantity: moneyValue(row.stockQuantity).trim()
  };
}

function rowHasChanges(row, values) {
  const original = editableSnapshot(row);
  return original.regularPrice !== values.regularPrice
    || original.salePrice !== values.salePrice
    || original.stockQuantity !== values.stockQuantity;
}

function changeList(row) {
  const original = state.rows.find((current) => rowKey(current) === rowKey(row)) || row;
  const fields = [
    ["regularPrice", "Prezzo"],
    ["salePrice", "Sconto"],
    ["stockQuantity", "Quantita"]
  ];
  return fields
    .filter(([field]) => moneyValue(original[field]).trim() !== moneyValue(row[field]).trim())
    .map(([field, label]) => `${label}: ${moneyValue(original[field]).trim() || "-"} -> ${moneyValue(row[field]).trim() || "-"}`);
}

function renderChangeSummary(rows) {
  return rows.map((row) => {
    const changes = changeList(row);
    return `
      <div class="changeItem">
        <strong>${escapeHtml(row.name)}</strong>
        <span>SKU ${escapeHtml(row.sku || "-")} - ID ${escapeHtml(row.id)}</span>
        <small>${escapeHtml(changes.join("; ") || "Nessuna differenza")}</small>
      </div>
    `;
  }).join("");
}

function confirmBulkSave(rows) {
  els.confirmSaveTitle.textContent = rows.length === 1
    ? "Salvare 1 prodotto modificato?"
    : `Salvare ${rows.length} prodotti modificati?`;
  els.confirmSaveSummary.innerHTML = renderChangeSummary(rows);
  els.confirmSaveModal.classList.add("open");
  els.confirmSaveModal.setAttribute("aria-hidden", "false");

  return new Promise((resolve) => {
    const done = (confirmed) => {
      els.confirmSaveModal.classList.remove("open");
      els.confirmSaveModal.setAttribute("aria-hidden", "true");
      els.confirmSaveButton.removeEventListener("click", onConfirm);
      els.cancelSaveButton.removeEventListener("click", onCancel);
      els.confirmSaveModal.removeEventListener("click", onOverlay);
      resolve(confirmed);
    };
    const onConfirm = () => done(true);
    const onCancel = () => done(false);
    const onOverlay = (event) => {
      if (event.target === els.confirmSaveModal) done(false);
    };

    els.confirmSaveButton.addEventListener("click", onConfirm);
    els.cancelSaveButton.addEventListener("click", onCancel);
    els.confirmSaveModal.addEventListener("click", onOverlay);
  });
}

function updateBulkControls() {
  const count = state.dirtyRows.size;
  els.bulkBar.hidden = count === 0;
  els.bulkCount.textContent = count === 1 ? "1 modifica da salvare" : `${count} modifiche da salvare`;
  els.saveAllButton.disabled = state.loading || state.cacheSyncing || state.savingBulk || count === 0;
  els.discardAllButton.disabled = state.loading || state.savingBulk || count === 0;
}

function setDirtyRow(index, values) {
  const row = state.rows[index];
  if (!row) return;
  const key = rowKey(row);
  if (rowHasChanges(row, values)) {
    state.dirtyRows.set(key, { ...row, ...values });
  } else {
    state.dirtyRows.delete(key);
  }
  updateBulkControls();
}

function changedRows() {
  return Array.from(state.dirtyRows.values());
}

function validateRow(row) {
  const qty = row.stockQuantity;
  if (qty !== "" && !Number.isInteger(Number(qty))) {
    return "La quantita deve essere un numero intero.";
  }
  return "";
}

function renderRows() {
  els.pageText.textContent = `Pagina ${state.page} di ${Math.max(state.totalPages, 1)}`;
  els.firstButton.disabled = state.loading || state.savingBulk || state.page <= 1;
  els.prev5Button.disabled = state.loading || state.savingBulk || state.page <= 1;
  els.prevButton.disabled = state.loading || state.savingBulk || state.page <= 1;
  els.nextButton.disabled = state.loading || state.savingBulk || state.page >= state.totalPages;
  els.next5Button.disabled = state.loading || state.savingBulk || state.page >= state.totalPages;
  els.lastButton.disabled = state.loading || state.savingBulk || state.page >= state.totalPages;
  const editingLocked = state.loading || state.cacheSyncing || state.savingBulk;
  const disabledAttr = editingLocked ? "disabled" : "";
  updateBulkControls();

  if (!state.rows.length) {
    els.productBody.innerHTML = `<tr><td colspan="9" class="empty">Nessun prodotto trovato.</td></tr>`;
    els.gridShell.innerHTML = `<div class="empty gridEmpty">Nessun prodotto trovato.</div>`;
    return;
  }

  els.productBody.innerHTML = state.rows
    .map(
      (baseRow, index) => {
        const row = editableRow(baseRow);
        const dirtyClass = state.dirtyRows.has(rowKey(baseRow)) ? "dirty" : "";
        return `
      <tr data-index="${index}" class="${dirtyClass}">
        <td>
          <div class="productThumb">
            ${
              row.imageUrl
                ? `<img src="${escapeAttr(row.imageUrl)}" alt="${escapeAttr(row.imageAlt || row.name)}" loading="lazy" />`
                : `<span>N/D</span>`
            }
          </div>
        </td>
        <td>
          <div class="productName tableProductName">${escapeHtml(row.name)}</div>
          <div class="subtle">ID ${row.id}${row.parentId ? `, padre ${row.parentId}` : ""}</div>
        </td>
        <td>${escapeHtml(row.sku || "-")}</td>
        <td>${escapeHtml(row.type)}</td>
        <td><input class="cellInput" data-field="regularPrice" value="${escapeAttr(moneyValue(row.regularPrice))}" inputmode="decimal" ${disabledAttr} /></td>
        <td><input class="cellInput" data-field="salePrice" value="${escapeAttr(moneyValue(row.salePrice))}" inputmode="decimal" ${disabledAttr} /></td>
        <td><input class="qtyInput" data-field="stockQuantity" value="${escapeAttr(moneyValue(row.stockQuantity))}" inputmode="numeric" ${disabledAttr} /></td>
        <td><span class="badge ${escapeAttr(row.stockStatus)}">${stockLabel(row.stockStatus)}</span></td>
        <td><button type="button" data-action="save" ${disabledAttr}>Salva</button></td>
      </tr>
    `;
      }
    )
    .join("");

  els.gridShell.innerHTML = state.rows
    .map(
      (baseRow, index) => {
        const row = editableRow(baseRow);
        const dirtyClass = state.dirtyRows.has(rowKey(baseRow)) ? " dirty" : "";
        return `
      <article class="productCard ${row.stockStatus}${dirtyClass}">
        <div class="cardImage">
          ${
            row.imageUrl
              ? `<img src="${escapeAttr(row.imageUrl)}" alt="${escapeAttr(row.imageAlt || row.name)}" loading="lazy" />`
              : `<span>N/D</span>`
          }
        </div>
        <div class="cardBody">
          <div class="productName cardProductName">${escapeHtml(row.name)}</div>
          <div class="subtle">SKU ${escapeHtml(row.sku || "-")} · ID ${row.id}</div>
          <div class="cardFields">
            <label>Prezzo<input class="cellInput" data-index="${index}" data-field="regularPrice" value="${escapeAttr(moneyValue(row.regularPrice))}" inputmode="decimal" ${disabledAttr} /></label>
            <label>Sconto<input class="cellInput" data-index="${index}" data-field="salePrice" value="${escapeAttr(moneyValue(row.salePrice))}" inputmode="decimal" ${disabledAttr} /></label>
            <label>Quantita<input class="qtyInput" data-index="${index}" data-field="stockQuantity" value="${escapeAttr(moneyValue(row.stockQuantity))}" inputmode="numeric" ${disabledAttr} /></label>
          </div>
          <div class="cardActions">
            <span class="badge ${escapeAttr(row.stockStatus)}">${stockLabel(row.stockStatus)}</span>
            <button type="button" data-index="${index}" data-action="save-card" ${disabledAttr}>Salva</button>
          </div>
        </div>
      </article>
    `;
      }
    )
    .join("");
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => {
    const entities = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" };
    return entities[char];
  });
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, "&#096;");
}

async function loadConfig() {
  const config = await window.magazzino.getConfig();
  els.storeUrl.value = config.storeUrl || "";
  els.consumerKey.value = config.consumerKey || "";
  els.consumerSecret.value = config.consumerSecret || "";
  if (!config.storeUrl || !config.consumerKey || !config.consumerSecret) {
    openSettings();
  } else {
    setStatus("Configurazione caricata. Caricamento prodotti...", "ok");
    await loadAttributeFilters();
    await loadProducts(1);
  }
}

function renderTerms(select, placeholder, terms = []) {
  select.innerHTML = [
    `<option value="">${escapeHtml(placeholder)}</option>`,
    ...terms.map((term) => `<option value="${escapeAttr(term.slug || term.name)}">${escapeHtml(term.name)}</option>`)
  ].join("");
}

async function loadAttributeFilters() {
  try {
    const filters = await window.magazzino.getAttributeFilters();
    renderTerms(els.setFilter, "Tutti i set", filters.set ? filters.set.terms : []);
    renderTerms(els.languageFilter, "Tutte le lingue", filters.language ? filters.language.terms : []);
  } catch (error) {
    renderTerms(els.setFilter, "Set non disponibili", []);
    renderTerms(els.languageFilter, "Lingue non disponibili", []);
    setStatus(error.message || "Impossibile leggere gli attributi.", "error");
  }
}

function currentConfig() {
  return {
    storeUrl: els.storeUrl.value,
    consumerKey: els.consumerKey.value,
    consumerSecret: els.consumerSecret.value
  };
}

async function saveConfig() {
  await window.magazzino.saveConfig(currentConfig());
  setStatus("Configurazione salvata.", "ok");
  closeSettings();
}

async function loadProducts(page = state.page) {
  const requestId = ++state.requestId;
  setLoading(true);
  const hasFilters = Boolean(els.searchInput.value || els.setFilter.value || els.languageFilter.value || els.stockFilter.value);
  setStatus(hasFilters ? "Filtro prodotti in corso..." : "Caricamento prodotti...");
  try {
    const result = await window.magazzino.listProducts({
      page,
      search: els.searchInput.value,
      setTerm: els.setFilter.value,
      languageTerm: els.languageFilter.value,
      stockStatus: els.stockFilter.value
    });
    if (requestId !== state.requestId) return;
    state.rows = result.rows;
    state.page = result.page;
    state.totalPages = result.totalPages;
    setStatus(`${result.rows.length} prodotti caricati. Totale: ${result.total}.`);
  } catch (error) {
    if (requestId !== state.requestId) return;
    state.rows = [];
    setStatus(error.message || "Errore durante il caricamento.", "error");
  } finally {
    if (requestId === state.requestId) {
      setLoading(false);
      renderRows();
    }
  }
}

function scheduleLiveSearch() {
  clearTimeout(state.searchTimer);
  state.searchTimer = setTimeout(() => {
    if (hasConfig()) loadProducts(1);
  }, 250);
}

function goToPage(page) {
  const nextPage = Math.min(Math.max(Number(page) || 1, 1), Math.max(state.totalPages, 1));
  if (!state.loading && nextPage !== state.page) loadProducts(nextPage);
}

async function saveRow(tr) {
  if (state.cacheSyncing) {
    setStatus("Cache prodotti in generazione. Attendi il completamento prima di modificare.", "error");
    return;
  }
  const index = Number(tr.dataset.index);
  let row = { ...state.rows[index] };
  tr.querySelectorAll("input[data-field]").forEach((input) => {
    row[input.dataset.field] = input.value.trim();
  });

  const validationError = validateRow(row);
  if (validationError) {
    setStatus(validationError, "error");
    return;
  }

  setLoading(true);
  setStatus(`Salvataggio ${row.name}...`);
  try {
    await window.magazzino.updateProduct(row, state.rows[index]);
    state.rows[index] = row;
    state.dirtyRows.delete(rowKey(row));
    setStatus("Prodotto aggiornato.", "ok");
  } catch (error) {
    setStatus(error.message || "Errore durante il salvataggio.", "error");
  } finally {
    setLoading(false);
    renderRows();
  }
}

async function saveGridCard(button) {
  if (state.cacheSyncing) {
    setStatus("Cache prodotti in generazione. Attendi il completamento prima di modificare.", "error");
    return;
  }
  const index = Number(button.dataset.index);
  const card = button.closest(".productCard");
  let row = { ...state.rows[index] };
  card.querySelectorAll("input[data-field]").forEach((input) => {
    row[input.dataset.field] = input.value.trim();
  });

  const validationError = validateRow(row);
  if (validationError) {
    setStatus(validationError, "error");
    return;
  }

  setLoading(true);
  setStatus(`Salvataggio ${row.name}...`);
  try {
    await window.magazzino.updateProduct(row, state.rows[index]);
    state.rows[index] = row;
    state.dirtyRows.delete(rowKey(row));
    setStatus("Prodotto aggiornato.", "ok");
  } catch (error) {
    setStatus(error.message || "Errore durante il salvataggio.", "error");
  } finally {
    setLoading(false);
    renderRows();
  }
}

async function saveAllChanges() {
  if (state.cacheSyncing) {
    setStatus("Cache prodotti in generazione. Attendi il completamento prima di modificare.", "error");
    return;
  }

  const rows = changedRows();
  const invalid = rows.find((row) => validateRow(row));
  if (invalid) {
    setStatus(`${invalid.name}: ${validateRow(invalid)}`, "error");
    return;
  }

  if (!rows.length) {
    setStatus("Nessuna modifica da salvare.");
    return;
  }

  const confirmed = await confirmBulkSave(rows);
  if (!confirmed) {
    setStatus("Salvataggio annullato.");
    return;
  }

  state.savingBulk = true;
  setLoading(true);
  setStatus(`Salvo 0/${rows.length} prodotti...`);
  try {
    let saved = 0;
    const failures = [];
    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      setStatus(`Salvo ${index + 1}/${rows.length}: ${row.name}`);
      try {
        const previousRow = state.rows.find((current) => rowKey(current) === rowKey(row)) || row;
        await window.magazzino.updateProduct(row, previousRow);
        saved += 1;
      } catch (error) {
        failures.push({ row, error: error.message || "Errore salvataggio" });
        continue;
      }
      const rowIndex = state.rows.findIndex((current) => rowKey(current) === rowKey(row));
      if (rowIndex >= 0) state.rows[rowIndex] = row;
      state.dirtyRows.delete(rowKey(row));
      renderRows();
    }

    if (failures.length) {
      setStatus(`${saved} salvati, ${failures.length} non salvati. ${failures[0].error}`, "error");
    } else {
      setStatus(`${saved} prodotti salvati.`, "ok");
    }
  } catch (error) {
    setStatus(error.message || "Errore durante il salvataggio bulk.", "error");
  } finally {
    state.savingBulk = false;
    setLoading(false);
    renderRows();
  }
}

function discardAllChanges() {
  state.dirtyRows.clear();
  setStatus("Modifiche annullate.");
  renderRows();
}

els.configForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await saveConfig();
    await loadAttributeFilters();
    await loadProducts(1);
  } catch (error) {
    setStatus(error.message || "Errore configurazione.", "error");
  }
});

els.settingsButton.addEventListener("click", openSettings);
els.menuSettingsButton.addEventListener("click", openSettings);
els.closeSettingsButton.addEventListener("click", closeSettings);

els.testButton.addEventListener("click", async () => {
  try {
    await saveConfig();
    setLoading(true);
    setStatus("Test collegamento...");
    await window.magazzino.testConnection();
    setStatus("Collegamento riuscito.", "ok");
    await loadAttributeFilters();
    await loadProducts(1);
  } catch (error) {
    setStatus(error.message || "Collegamento non riuscito.", "error");
  } finally {
    setLoading(false);
    renderRows();
  }
});

els.configModal.addEventListener("click", (event) => {
  if (event.target === els.configModal) closeSettings();
});

els.clearCacheButton.addEventListener("click", async () => {
  try {
    setStatus("Svuoto cache prodotti...");
    await window.magazzino.clearCache();
    await refreshCacheInfo();
    setStatus("Cache svuotata. Ricarico la prima pagina.", "ok");
    await loadProducts(1);
  } catch (error) {
    setStatus(error.message || "Impossibile svuotare la cache.", "error");
  }
});

els.refreshCachePageButton.addEventListener("click", async () => {
  try {
    setStatus(`Ricarico cache pagina ${state.page}...`);
    await window.magazzino.refreshCachePage(state.page);
    await refreshCacheInfo();
    await loadProducts(state.page);
    setStatus(`Pagina ${state.page} ricaricata da WooCommerce.`, "ok");
  } catch (error) {
    setStatus(error.message || "Impossibile ricaricare la pagina.", "error");
  }
});

els.diagnosticsButton.addEventListener("click", openDiagnostics);
els.refreshDiagnosticsButton.addEventListener("click", async () => {
  els.diagnosticsText.value = await window.magazzino.getDiagnostics();
});
els.copyDiagnosticsButton.addEventListener("click", async () => {
  els.diagnosticsText.select();
  await navigator.clipboard.writeText(els.diagnosticsText.value);
});
els.closeDiagnosticsButton.addEventListener("click", closeDiagnostics);
els.diagnosticsModal.addEventListener("click", (event) => {
  if (event.target === els.diagnosticsModal) closeDiagnostics();
});
els.historyButton.addEventListener("click", openHistory);
els.refreshHistoryButton.addEventListener("click", async () => {
  els.historyText.value = await window.magazzino.getHistory();
});
els.copyHistoryButton.addEventListener("click", copyHistory);
els.copyHistoryModalButton.addEventListener("click", copyHistory);
els.clearHistoryButton.addEventListener("click", async () => {
  await window.magazzino.clearHistory();
  els.historyText.value = "";
  setStatus("Storico svuotato.", "ok");
});
els.closeHistoryButton.addEventListener("click", closeHistory);
els.historyModal.addEventListener("click", (event) => {
  if (event.target === els.historyModal) closeHistory();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && els.diagnosticsModal.classList.contains("open")) {
    closeDiagnostics();
    return;
  }
  if (event.key === "Escape" && els.historyModal.classList.contains("open")) {
    closeHistory();
    return;
  }
  if (event.key === "Escape" && els.confirmSaveModal.classList.contains("open")) {
    els.cancelSaveButton.click();
    return;
  }
  if (event.key === "Escape" && els.configModal.classList.contains("open")) {
    closeSettings();
    return;
  }
  if (event.key === "Escape" && els.helpModal.classList.contains("open")) {
    closeHelp();
  }
});

els.refreshButton.addEventListener("click", () => loadProducts(1));
els.menuRefreshButton.addEventListener("click", () => loadProducts(1));
els.saveAllButton.addEventListener("click", saveAllChanges);
els.discardAllButton.addEventListener("click", discardAllChanges);
els.updateButton.addEventListener("click", async () => {
  try {
    setUpdateStatus("Controllo aggiornamenti...");
    await window.magazzino.checkForUpdates();
  } catch (error) {
    setUpdateStatus(error.message || "Controllo update non riuscito.");
  }
});
els.menuUpdateButton.addEventListener("click", () => els.updateButton.click());
els.themeToggleButton.addEventListener("click", toggleTheme);
els.listViewButton.addEventListener("click", () => setProductView("list"));
els.gridViewButton.addEventListener("click", () => setProductView("grid"));
els.inlineListViewButton.addEventListener("click", () => setProductView("list"));
els.inlineGridViewButton.addEventListener("click", () => setProductView("grid"));
els.helpButton.addEventListener("click", openHelp);
els.closeHelpButton.addEventListener("click", closeHelp);
els.helpModal.addEventListener("click", (event) => {
  if (event.target === els.helpModal) closeHelp();
});
els.menuQuitButton.addEventListener("click", () => window.magazzino.quitApp());
els.minimizeButton.addEventListener("click", () => window.magazzino.minimizeWindow());
els.maximizeButton.addEventListener("click", async () => {
  const maximized = await window.magazzino.toggleMaximizeWindow();
  els.maximizeButton.textContent = maximized ? "[_]" : "[ ]";
});
els.closeButton.addEventListener("click", () => window.magazzino.closeWindow());
els.firstButton.addEventListener("click", () => goToPage(1));
els.prev5Button.addEventListener("click", () => goToPage(state.page - 5));
els.prevButton.addEventListener("click", () => loadProducts(state.page - 1));
els.nextButton.addEventListener("click", () => loadProducts(state.page + 1));
els.next5Button.addEventListener("click", () => goToPage(state.page + 5));
els.lastButton.addEventListener("click", () => goToPage(state.totalPages));
els.stockFilter.addEventListener("change", () => loadProducts(1));
els.setFilter.addEventListener("change", () => loadProducts(1));
els.languageFilter.addEventListener("change", () => loadProducts(1));
els.searchInput.addEventListener("input", scheduleLiveSearch);
els.searchInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") loadProducts(1);
});

els.productBody.addEventListener("input", (event) => {
  if (state.cacheSyncing) return;
  const tr = event.target.closest("tr");
  if (!tr) return;
  const index = Number(tr.dataset.index);
  const values = editableSnapshot(editableRow(state.rows[index]));
  tr.querySelectorAll("input[data-field]").forEach((input) => {
    values[input.dataset.field] = input.value.trim();
  });
  setDirtyRow(index, values);
  tr.classList.toggle("dirty", state.dirtyRows.has(rowKey(state.rows[index])));
});

els.productBody.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action='save']");
  if (button && !button.disabled) saveRow(button.closest("tr"));
});

els.gridShell.addEventListener("input", (event) => {
  if (state.cacheSyncing) return;
  const card = event.target.closest(".productCard");
  if (!card) return;
  const index = Number(event.target.dataset.index);
  const values = editableSnapshot(editableRow(state.rows[index]));
  card.querySelectorAll("input[data-field]").forEach((input) => {
    values[input.dataset.field] = input.value.trim();
  });
  setDirtyRow(index, values);
  card.classList.toggle("dirty", state.dirtyRows.has(rowKey(state.rows[index])));
});

els.gridShell.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action='save-card']");
  if (button && !button.disabled) saveGridCard(button);
});

window.magazzino.onUpdateState(setUpdateStatus);
window.magazzino.onCacheStatus(setCacheStatus);
window.magazzino.onWindowMaximized((isMaximized) => {
  els.maximizeButton.textContent = isMaximized ? "[_]" : "[ ]";
});
window.magazzino.isWindowMaximized().then((isMaximized) => {
  els.maximizeButton.textContent = isMaximized ? "[_]" : "[ ]";
});
window.magazzino.getUpdateState().then(setUpdateStatus);
window.magazzino.getCacheStatus().then(setCacheStatus);
refreshCacheInfo().catch(() => {});
applyTheme(state.theme);
setProductView(localStorage.getItem("productView") || "list");
loadConfig();
renderRows();
