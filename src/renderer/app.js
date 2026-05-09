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
  menuExportCsvButton: document.querySelector("#menuExportCsvButton"),
  menuImportCsvButton: document.querySelector("#menuImportCsvButton"),
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
  clearImageCacheButton: document.querySelector("#clearImageCacheButton"),
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
  importCsvModal: document.querySelector("#importCsvModal"),
  importCsvSummary: document.querySelector("#importCsvSummary"),
  importCsvErrors: document.querySelector("#importCsvErrors"),
  copyImportCsvButton: document.querySelector("#copyImportCsvButton"),
  closeImportCsvButton: document.querySelector("#closeImportCsvButton"),
  importPasswordModal: document.querySelector("#importPasswordModal"),
  importPasswordInput: document.querySelector("#importPasswordInput"),
  importPasswordError: document.querySelector("#importPasswordError"),
  confirmImportPasswordButton: document.querySelector("#confirmImportPasswordButton"),
  cancelImportPasswordButton: document.querySelector("#cancelImportPasswordButton"),
  searchInput: document.querySelector("#searchInput"),
  setFilter: document.querySelector("#setFilter"),
  languageFilter: document.querySelector("#languageFilter"),
  stockFilter: document.querySelector("#stockFilter"),
  categoryFilter: document.querySelector("#categoryFilter"),
  priceMinInput: document.querySelector("#priceMinInput"),
  priceMaxInput: document.querySelector("#priceMaxInput"),
  missingPriceFilter: document.querySelector("#missingPriceFilter"),
  quantityMinInput: document.querySelector("#quantityMinInput"),
  quantityMaxInput: document.querySelector("#quantityMaxInput"),
  missingQuantityFilter: document.querySelector("#missingQuantityFilter"),
  bulkFilteredButton: document.querySelector("#bulkFilteredButton"),
  bulkFilteredModal: document.querySelector("#bulkFilteredModal"),
  bulkFilteredSummary: document.querySelector("#bulkFilteredSummary"),
  bulkFilteredRegularPrice: document.querySelector("#bulkFilteredRegularPrice"),
  bulkFilteredSalePrice: document.querySelector("#bulkFilteredSalePrice"),
  bulkFilteredStockQuantity: document.querySelector("#bulkFilteredStockQuantity"),
  bulkFilteredAllResults: document.querySelector("#bulkFilteredAllResults"),
  bulkFilteredError: document.querySelector("#bulkFilteredError"),
  applyBulkFilteredButton: document.querySelector("#applyBulkFilteredButton"),
  cancelBulkFilteredButton: document.querySelector("#cancelBulkFilteredButton"),
  refreshButton: document.querySelector("#refreshButton"),
  updateButton: document.querySelector("#updateButton"),
  updateText: document.querySelector("#updateText"),
  firstButton: document.querySelector("#firstButton"),
  prev5Button: document.querySelector("#prev5Button"),
  prevButton: document.querySelector("#prevButton"),
  nextButton: document.querySelector("#nextButton"),
  next5Button: document.querySelector("#next5Button"),
  lastButton: document.querySelector("#lastButton"),
  pageInput: document.querySelector("#pageInput"),
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
  const imageCache = info.imageCache || {};
  els.cacheInfoText.textContent = `Tipo: ${info.type || "Cache"}. Pagine: ${pages}. Righe: ${info.rows}. Totale sito: ${info.total || "-"}. Ultimo update: ${updatedAt}. DB: ${info.exists ? formatBytes(info.size) : "non presente"}. Immagini: ${imageCache.files || 0} file, ${formatBytes(imageCache.size || 0)} - ${info.path}`;
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

function imageSrc(row) {
  return row.cachedImageUrl || row.imageUrl || "";
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

function selectedCategoryIds() {
  return Array.from(els.categoryFilter.selectedOptions || [])
    .map((option) => option.value)
    .filter(Boolean);
}

function hasActiveFilters() {
  return Boolean(
    els.searchInput.value.trim()
      || els.setFilter.value
      || els.languageFilter.value
      || els.stockFilter.value
      || selectedCategoryIds().length
      || els.priceMinInput.value.trim()
      || els.priceMaxInput.value.trim()
      || els.missingPriceFilter.checked
      || els.quantityMinInput.value.trim()
      || els.quantityMaxInput.value.trim()
      || els.missingQuantityFilter.checked
  );
}

function syncExclusiveFilterInputs() {
  els.priceMinInput.disabled = els.missingPriceFilter.checked;
  els.priceMaxInput.disabled = els.missingPriceFilter.checked;
  els.quantityMinInput.disabled = els.missingQuantityFilter.checked;
  els.quantityMaxInput.disabled = els.missingQuantityFilter.checked;
}

function hasHeavyRemoteFilter() {
  return Boolean(
    selectedCategoryIds().length
      || els.setFilter.value
      || els.languageFilter.value
      || els.stockFilter.value
      || els.priceMinInput.value.trim()
      || els.priceMaxInput.value.trim()
      || els.missingPriceFilter.checked
      || els.quantityMinInput.value.trim()
      || els.quantityMaxInput.value.trim()
      || els.missingQuantityFilter.checked
  );
}

function currentProductParams(page = state.page) {
  return {
    page,
    search: els.searchInput.value,
    setTerm: els.setFilter.value,
    languageTerm: els.languageFilter.value,
    stockStatus: els.stockFilter.value,
    categoryIds: selectedCategoryIds(),
    priceMin: els.priceMinInput.value,
    priceMax: els.priceMaxInput.value,
    missingPrice: els.missingPriceFilter.checked,
    quantityMin: els.quantityMinInput.value,
    quantityMax: els.quantityMaxInput.value,
    missingQuantity: els.missingQuantityFilter.checked
  };
}

function changeList(row) {
  const original = state.rows.find((current) => rowKey(current) === rowKey(row)) || row.importedBefore || row;
  const fields = [
    ["regularPrice", "Prezzo"],
    ["salePrice", "Sconto"],
    ["stockQuantity", "Quantita"]
  ];
  return fields
    .filter(([field]) => moneyValue(original[field]).trim() !== moneyValue(row[field]).trim())
    .map(([field, label]) => `${label}: ${moneyValue(original[field]).trim() || "-"} -> ${moneyValue(row[field]).trim() || "-"}`);
}

function renderImportSummary(result) {
  const errors = result.errors || [];
  const errorText = errors.map((error) => {
    const product = [
      error.id ? `ID ${error.id}` : "",
      error.parentId ? `padre ${error.parentId}` : "",
      error.sku ? `SKU ${error.sku}` : ""
    ].filter(Boolean).join(", ") || "riga senza ID/SKU";
    return `Riga ${error.line}: ${product} - ${error.message}`;
  }).join("\n");

  els.importCsvSummary.innerHTML = `
    <div class="changeItem">
      <strong>${escapeHtml(result.changed || 0)} modifiche pronte</strong>
      <span>${escapeHtml(result.rowsRead || 0)} righe lette, ${escapeHtml(result.matched || 0)} abbinate</span>
      <small>${escapeHtml(result.unchanged || 0)} invariate, ${escapeHtml(result.ignored || 0)} ignorate</small>
    </div>
    ${
      result.filePath
        ? `<div class="changeItem"><strong>File</strong><small>${escapeHtml(result.filePath)}</small></div>`
        : ""
    }
    ${
      errors.length
        ? `<div class="changeItem"><strong>Errori import</strong><small>${escapeHtml(errors.slice(0, 8).map((error) => `Riga ${error.line}: ${error.message}`).join("; "))}${errors.length > 8 ? " ..." : ""}</small></div>`
        : ""
    }
  `;
  els.importCsvErrors.hidden = !errorText;
  els.importCsvErrors.value = errorText;
  els.importCsvModal.classList.add("open");
  els.importCsvModal.setAttribute("aria-hidden", "false");
}

function closeImportCsv() {
  els.importCsvModal.classList.remove("open");
  els.importCsvModal.setAttribute("aria-hidden", "true");
}

function requestImportPassword() {
  els.importPasswordInput.value = "";
  els.importPasswordError.hidden = true;
  els.importPasswordModal.classList.add("open");
  els.importPasswordModal.setAttribute("aria-hidden", "false");
  setTimeout(() => els.importPasswordInput.focus(), 0);

  return new Promise((resolve) => {
    const done = (allowed) => {
      els.importPasswordModal.classList.remove("open");
      els.importPasswordModal.setAttribute("aria-hidden", "true");
      els.confirmImportPasswordButton.removeEventListener("click", onConfirm);
      els.cancelImportPasswordButton.removeEventListener("click", onCancel);
      els.importPasswordModal.removeEventListener("click", onOverlay);
      els.importPasswordInput.removeEventListener("keydown", onKeydown);
      resolve(allowed);
    };
    const onConfirm = () => {
      if (els.importPasswordInput.value === "KOT-9qR4!vT7#Lm2") {
        done(true);
        return;
      }
      els.importPasswordError.hidden = false;
      els.importPasswordInput.select();
    };
    const onCancel = () => done(false);
    const onOverlay = (event) => {
      if (event.target === els.importPasswordModal) done(false);
    };
    const onKeydown = (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        onConfirm();
      }
      if (event.key === "Escape") {
        event.preventDefault();
        done(false);
      }
    };

    els.confirmImportPasswordButton.addEventListener("click", onConfirm);
    els.cancelImportPasswordButton.addEventListener("click", onCancel);
    els.importPasswordModal.addEventListener("click", onOverlay);
    els.importPasswordInput.addEventListener("keydown", onKeydown);
  });
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
  els.menuExportCsvButton.disabled = state.loading || state.savingBulk || !state.rows.length;
  els.menuImportCsvButton.disabled = state.loading || state.cacheSyncing || state.savingBulk;
  els.bulkFilteredButton.disabled = state.loading || state.cacheSyncing || state.savingBulk || !state.rows.length || !hasActiveFilters();
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
  els.pageInput.max = Math.max(state.totalPages, 1);
  if (document.activeElement !== els.pageInput) els.pageInput.value = state.page;
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
              imageSrc(row)
                ? `<img src="${escapeAttr(imageSrc(row))}" alt="${escapeAttr(row.imageAlt || row.name)}" loading="lazy" />`
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
            imageSrc(row)
              ? `<img src="${escapeAttr(imageSrc(row))}" alt="${escapeAttr(row.imageAlt || row.name)}" loading="lazy" />`
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

function renderCategoryTerms(terms = []) {
  els.categoryFilter.innerHTML = terms
    .map((term) => `<option value="${escapeAttr(term.id)}">${escapeHtml(term.name)}</option>`)
    .join("");
}

async function loadAttributeFilters() {
  try {
    const filters = await window.magazzino.getAttributeFilters();
    renderTerms(els.setFilter, "Tutti i set", filters.set ? filters.set.terms : []);
    renderTerms(els.languageFilter, "Tutte le lingue", filters.language ? filters.language.terms : []);
    renderCategoryTerms(filters.categories ? filters.categories.terms : []);
  } catch (error) {
    renderTerms(els.setFilter, "Set non disponibili", []);
    renderTerms(els.languageFilter, "Lingue non disponibili", []);
    renderCategoryTerms([]);
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
  const hasFilters = hasActiveFilters();
  const params = currentProductParams(page);

  setLoading(true);
  setStatus(hasFilters ? "Cerco prodotti..." : "Caricamento prodotti...");
  try {
    if (hasFilters && hasHeavyRemoteFilter()) {
      setStatus("Cerco prodotti su WooCommerce...");
      const result = await window.magazzino.listProducts({ ...params, skipLocal: true });
      if (requestId !== state.requestId) return;
      applyProductResult(result);
      setStatus(`${result.rows.length} prodotti caricati. Totale: ${result.total}.`);
      return;
    }

    setStatus(hasFilters ? "Cerco nella cache locale..." : "Caricamento prodotti...");
    const localResult = await window.magazzino.listProducts({ ...params, localOnly: true });
    if (requestId !== state.requestId) return;

    if (localResult.source === "cache" || (hasFilters && localResult.rows.length)) {
      state.rows = localResult.rows;
      state.page = localResult.page;
      state.totalPages = localResult.totalPages;
      setStatus(hasFilters
        ? `${localResult.rows.length} risultati locali. Aggiorno da WooCommerce...`
        : `${localResult.rows.length} prodotti caricati dalla cache. Totale: ${localResult.total}.`);
      setLoading(false);
      renderRows();

      if (hasFilters) {
        refreshRemoteResults(requestId, params);
      } else if (localResult.page === 1) {
        refreshRemoteResults(requestId, params);
        preloadNeighborPages(localResult.page, localResult.totalPages);
      } else {
        preloadNeighborPages(localResult.page, localResult.totalPages);
      }
      return;
    }

    setStatus(hasFilters ? "Cerco prodotti su WooCommerce..." : "Caricamento pagina da WooCommerce...");
    const result = await window.magazzino.listProducts(params);
    if (requestId !== state.requestId) return;
    applyProductResult(result);
    setStatus(`${result.rows.length} prodotti caricati. Totale: ${result.total}.`);
    if (!hasFilters) preloadNeighborPages(result.page, result.totalPages);
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
    const result = await window.magazzino.updateProduct(row, state.rows[index]);
    state.rows[index] = row;
    state.dirtyRows.delete(rowKey(row));
    setStatus(result && result.cacheWarning
      ? `Prodotto salvato su WooCommerce. Cache locale non aggiornata: ${result.cacheWarning}`
      : "Prodotto aggiornato.", result && result.cacheWarning ? "error" : "ok");
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
    const result = await window.magazzino.updateProduct(row, state.rows[index]);
    state.rows[index] = row;
    state.dirtyRows.delete(rowKey(row));
    setStatus(result && result.cacheWarning
      ? `Prodotto salvato su WooCommerce. Cache locale non aggiornata: ${result.cacheWarning}`
      : "Prodotto aggiornato.", result && result.cacheWarning ? "error" : "ok");
  } catch (error) {
    setStatus(error.message || "Errore durante il salvataggio.", "error");
  } finally {
    setLoading(false);
    renderRows();
  }
}

function applyProductResult(result) {
  state.rows = result.rows || [];
  state.page = result.page || 1;
  state.totalPages = result.totalPages || 1;
}

async function refreshRemoteResults(requestId, params) {
  try {
    const result = await window.magazzino.listProducts({ ...params, forceRemote: true, silent: true });
    if (requestId !== state.requestId) return;
    applyProductResult(result);
    setStatus(`${result.rows.length} prodotti aggiornati da WooCommerce. Totale: ${result.total}.`, "ok");
  } catch (error) {
    if (requestId !== state.requestId) return;
    setStatus(`Risultati da cache. WooCommerce non risponde: ${error.message || "errore remoto"}`, "error");
  } finally {
    if (requestId === state.requestId) renderRows();
  }
}

function preloadNeighborPages(page, totalPages) {
  const pages = [page - 1, page + 1].filter((value) => value >= 1 && value <= totalPages);
  pages.forEach((targetPage) => {
    window.magazzino.preloadProductPage({ page: targetPage }).catch(() => {});
  });
}

async function reloadCurrentViewAfterSave(savedCount, failuresCount = 0) {
  if (!savedCount || !hasActiveFilters()) return false;
  setStatus(failuresCount
    ? `${savedCount} salvati, ${failuresCount} non salvati. Aggiorno la ricerca...`
    : `${savedCount} prodotti salvati. Aggiorno la ricerca...`, failuresCount ? "error" : "ok");
  await loadProducts(state.page);
  return true;
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
    let cacheWarnings = 0;
    const failures = [];
    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      setStatus(`Salvo ${index + 1}/${rows.length}: ${row.name}`);
      try {
        const previousRow = state.rows.find((current) => rowKey(current) === rowKey(row)) || row.importedBefore || row;
        const result = await window.magazzino.updateProduct(row, previousRow);
        if (result && result.cacheWarning) cacheWarnings += 1;
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

    const reloaded = await reloadCurrentViewAfterSave(saved, failures.length);
    if (reloaded) return;

    if (failures.length) {
      setStatus(`${saved} salvati, ${failures.length} non salvati. ${failures[0].error}`, "error");
    } else if (cacheWarnings) {
      setStatus(`${saved} prodotti salvati su WooCommerce. Cache locale non aggiornata per ${cacheWarnings} prodotti: libera spazio o svuota cache.`, "error");
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

function openBulkFilteredModal() {
  if (!state.rows.length) {
    setStatus("Nessun prodotto filtrato da modificare.", "error");
    return;
  }
  if (!hasActiveFilters()) {
    setStatus("Applica almeno un filtro prima della modifica bulk.", "error");
    return;
  }
  els.bulkFilteredRegularPrice.value = "";
  els.bulkFilteredSalePrice.value = "";
  els.bulkFilteredStockQuantity.value = "";
  els.bulkFilteredAllResults.checked = true;
  els.bulkFilteredError.hidden = true;
  els.bulkFilteredError.textContent = "";
  els.bulkFilteredSummary.textContent = `${state.rows.length} prodotti sono visibili in questa pagina. Puoi applicare i valori alla pagina oppure a tutti i risultati filtrati.`;
  els.bulkFilteredModal.classList.add("open");
  els.bulkFilteredModal.setAttribute("aria-hidden", "false");
  els.bulkFilteredRegularPrice.focus();
}

function closeBulkFilteredModal() {
  els.bulkFilteredModal.classList.remove("open");
  els.bulkFilteredModal.setAttribute("aria-hidden", "true");
}

async function applyBulkFilteredChanges() {
  const updates = {};
  const regularPrice = els.bulkFilteredRegularPrice.value.trim();
  const salePrice = els.bulkFilteredSalePrice.value.trim();
  const stockQuantity = els.bulkFilteredStockQuantity.value.trim();

  if (regularPrice !== "") updates.regularPrice = regularPrice;
  if (salePrice !== "") updates.salePrice = salePrice;
  if (stockQuantity !== "") updates.stockQuantity = stockQuantity;

  if (!Object.keys(updates).length) {
    els.bulkFilteredError.textContent = "Inserisci almeno un valore da applicare.";
    els.bulkFilteredError.hidden = false;
    return;
  }
  if (updates.stockQuantity !== undefined && !Number.isInteger(Number(updates.stockQuantity))) {
    els.bulkFilteredError.textContent = "La quantita deve essere un numero intero.";
    els.bulkFilteredError.hidden = false;
    return;
  }

  if (els.bulkFilteredAllResults.checked) {
    closeBulkFilteredModal();
    state.savingBulk = true;
    setLoading(true);
    setStatus("Preparo modifica di tutti i risultati filtrati...");
    try {
      const result = await window.magazzino.updateFilteredProducts({
        filters: currentProductParams(1),
        updates
      });
      setStatus(`${result.saved} salvati, ${result.failed} non salvati su ${result.matched} prodotti filtrati. Aggiorno la ricerca...`, result.failed ? "error" : "ok");
      await loadProducts(1);
    } catch (error) {
      setStatus(error.message || "Modifica bulk filtrati non riuscita.", "error");
    } finally {
      state.savingBulk = false;
      setLoading(false);
      renderRows();
    }
    return;
  }

  let changed = 0;
  state.rows.forEach((baseRow) => {
    const nextRow = { ...editableRow(baseRow), ...updates };
    const values = editableSnapshot(nextRow);
    const key = rowKey(baseRow);
    if (rowHasChanges(baseRow, values)) {
      state.dirtyRows.set(key, nextRow);
      changed += 1;
    } else {
      state.dirtyRows.delete(key);
    }
  });

  closeBulkFilteredModal();
  renderRows();
  setStatus(`${changed} prodotti filtrati aggiornati in attesa di Salva tutto.`, changed ? "ok" : "normal");
}

async function exportCsv() {
  if (!state.rows.length) {
    setStatus("Nessun prodotto da esportare.", "error");
    return;
  }

  try {
    setStatus("Preparo export CSV...");
    const rows = state.rows.map((row) => editableRow(row));
    const result = await window.magazzino.exportCsv(rows);
    if (result.canceled) {
      setStatus("Export CSV annullato.");
      return;
    }
    if (!result.saved) {
      setStatus(result.message || "Nessun prodotto esportato.", "error");
      return;
    }
    setStatus(`${result.rows} prodotti esportati in CSV.`, "ok");
  } catch (error) {
    setStatus(error.message || "Export CSV non riuscito.", "error");
  } finally {
    updateBulkControls();
  }
}

async function importCsv() {
  try {
    const allowed = await requestImportPassword();
    if (!allowed) {
      setStatus("Import CSV annullato.");
      return;
    }
    setStatus("Leggo CSV...");
    const result = await window.magazzino.importCsv();
    if (result.canceled) {
      setStatus("Import CSV annullato.");
      return;
    }

    (result.changes || []).forEach((row) => {
      state.dirtyRows.set(rowKey(row), row);
    });
    renderImportSummary(result);
    renderRows();
    setStatus(
      result.changed
        ? `${result.changed} modifiche importate. Usa Salva tutto per inviarle a WooCommerce.`
        : "CSV importato: nessuna modifica rilevata.",
      result.changed ? "ok" : "normal"
    );
  } catch (error) {
    setStatus(error.message || "Import CSV non riuscito.", "error");
  } finally {
    updateBulkControls();
  }
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

els.clearImageCacheButton.addEventListener("click", async () => {
  try {
    setStatus("Svuoto cache immagini...");
    await window.magazzino.clearImageCache();
    state.rows = state.rows.map((row) => ({
      ...row,
      cachedImageUrl: "",
      imageLocalPath: "",
      imageStatus: "",
      imageDownloadedAt: ""
    }));
    await refreshCacheInfo();
    renderRows();
    setStatus("Cache immagini svuotata.", "ok");
  } catch (error) {
    setStatus(error.message || "Impossibile svuotare la cache immagini.", "error");
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
  if (event.key === "Escape" && els.importCsvModal.classList.contains("open")) {
    closeImportCsv();
    return;
  }
  if (event.key === "Escape" && els.importPasswordModal.classList.contains("open")) {
    els.cancelImportPasswordButton.click();
    return;
  }
  if (event.key === "Escape" && els.bulkFilteredModal.classList.contains("open")) {
    closeBulkFilteredModal();
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
els.menuExportCsvButton.addEventListener("click", exportCsv);
els.menuImportCsvButton.addEventListener("click", importCsv);
els.closeImportCsvButton.addEventListener("click", closeImportCsv);
els.copyImportCsvButton.addEventListener("click", async () => {
  const text = [
    els.importCsvSummary.textContent.trim(),
    els.importCsvErrors.value.trim()
  ].filter(Boolean).join("\n\n");
  await navigator.clipboard.writeText(text);
  setStatus("Riepilogo import copiato.", "ok");
});
els.importCsvModal.addEventListener("click", (event) => {
  if (event.target === els.importCsvModal) closeImportCsv();
});
els.bulkFilteredButton.addEventListener("click", openBulkFilteredModal);
els.applyBulkFilteredButton.addEventListener("click", applyBulkFilteredChanges);
els.cancelBulkFilteredButton.addEventListener("click", closeBulkFilteredModal);
els.bulkFilteredModal.addEventListener("click", (event) => {
  if (event.target === els.bulkFilteredModal) closeBulkFilteredModal();
});
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
els.pageInput.addEventListener("change", () => goToPage(els.pageInput.value));
els.pageInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    goToPage(els.pageInput.value);
    els.pageInput.blur();
  }
});
els.stockFilter.addEventListener("change", () => loadProducts(1));
els.setFilter.addEventListener("change", () => loadProducts(1));
els.languageFilter.addEventListener("change", () => loadProducts(1));
els.categoryFilter.addEventListener("change", () => loadProducts(1));
[
  els.priceMinInput,
  els.priceMaxInput,
  els.quantityMinInput,
  els.quantityMaxInput
].forEach((input) => {
  input.addEventListener("change", () => loadProducts(1));
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      loadProducts(1);
      input.blur();
    }
  });
});
els.missingPriceFilter.addEventListener("change", () => {
  syncExclusiveFilterInputs();
  loadProducts(1);
});
els.missingQuantityFilter.addEventListener("change", () => {
  syncExclusiveFilterInputs();
  loadProducts(1);
});
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
window.magazzino.onImageCached((payload) => {
  const index = state.rows.findIndex((row) => rowKey(row) === payload.rowKey);
  if (index < 0) return;
  state.rows[index] = {
    ...state.rows[index],
    cachedImageUrl: payload.cachedImageUrl || "",
    imageLocalPath: payload.imageLocalPath || "",
    imageStatus: payload.imageStatus || "",
    imageDownloadedAt: payload.imageDownloadedAt || ""
  };
  renderRows();
});
window.magazzino.onImagesCleared(() => {
  state.rows = state.rows.map((row) => ({
    ...row,
    cachedImageUrl: "",
    imageLocalPath: "",
    imageStatus: "",
    imageDownloadedAt: ""
  }));
  renderRows();
});
window.magazzino.onBulkFilteredProgress((payload) => {
  if (!state.savingBulk) return;
  setStatus(`Bulk filtrati: pagina ${payload.page}/${payload.totalPages}, ${payload.matched} trovati, ${payload.saved} salvati, ${payload.failed} errori.`);
});
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
syncExclusiveFilterInputs();
loadConfig();
renderRows();
