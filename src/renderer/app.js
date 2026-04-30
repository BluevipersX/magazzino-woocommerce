const state = {
  rows: [],
  page: 1,
  totalPages: 1,
  loading: false,
  cacheSyncing: false,
  requestId: 0,
  searchTimer: null,
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
  themeToggleButton: document.querySelector("#themeToggleButton"),
  configForm: document.querySelector("#configForm"),
  configModal: document.querySelector("#configModal"),
  settingsButton: document.querySelector("#settingsButton"),
  closeSettingsButton: document.querySelector("#closeSettingsButton"),
  storeUrl: document.querySelector("#storeUrl"),
  consumerKey: document.querySelector("#consumerKey"),
  consumerSecret: document.querySelector("#consumerSecret"),
  testButton: document.querySelector("#testButton"),
  searchInput: document.querySelector("#searchInput"),
  setFilter: document.querySelector("#setFilter"),
  languageFilter: document.querySelector("#languageFilter"),
  stockFilter: document.querySelector("#stockFilter"),
  refreshButton: document.querySelector("#refreshButton"),
  updateButton: document.querySelector("#updateButton"),
  updateText: document.querySelector("#updateText"),
  prevButton: document.querySelector("#prevButton"),
  nextButton: document.querySelector("#nextButton"),
  pageText: document.querySelector("#pageText"),
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
  els.updateText.textContent = message;
}

function setLoading(loading) {
  state.loading = loading;
  els.refreshButton.disabled = loading;
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

function renderRows() {
  els.pageText.textContent = `Pagina ${state.page} di ${Math.max(state.totalPages, 1)}`;
  els.prevButton.disabled = state.loading || state.page <= 1;
  els.nextButton.disabled = state.loading || state.page >= state.totalPages;
  const editingLocked = state.loading || state.cacheSyncing;
  const disabledAttr = editingLocked ? "disabled" : "";

  if (!state.rows.length) {
    els.productBody.innerHTML = `<tr><td colspan="9" class="empty">Nessun prodotto trovato.</td></tr>`;
    els.gridShell.innerHTML = `<div class="empty gridEmpty">Nessun prodotto trovato.</div>`;
    return;
  }

  els.productBody.innerHTML = state.rows
    .map(
      (row, index) => `
      <tr data-index="${index}">
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
          <div class="productName">${escapeHtml(row.name)}</div>
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
    `
    )
    .join("");

  els.gridShell.innerHTML = state.rows
    .map(
      (row, index) => `
      <article class="productCard ${row.stockStatus}">
        <div class="cardImage">
          ${
            row.imageUrl
              ? `<img src="${escapeAttr(row.imageUrl)}" alt="${escapeAttr(row.imageAlt || row.name)}" loading="lazy" />`
              : `<span>N/D</span>`
          }
        </div>
        <div class="cardBody">
          <div class="productName">${escapeHtml(row.name)}</div>
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
    `
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
    setStatus(`${result.total} prodotti trovati, ${result.rows.length} prodotti caricati in questa pagina. I prodotti variabili vengono mostrati come varianti.`);
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

async function saveRow(tr) {
  if (state.cacheSyncing) {
    setStatus("Cache prodotti in generazione. Attendi il completamento prima di modificare.", "error");
    return;
  }
  const index = Number(tr.dataset.index);
  const row = { ...state.rows[index] };
  tr.querySelectorAll("input[data-field]").forEach((input) => {
    row[input.dataset.field] = input.value.trim();
  });

  const qty = row.stockQuantity;
  if (qty !== "" && !Number.isInteger(Number(qty))) {
    setStatus("La quantita deve essere un numero intero.", "error");
    return;
  }

  setLoading(true);
  setStatus(`Salvataggio ${row.name}...`);
  try {
    await window.magazzino.updateProduct(row);
    state.rows[index] = row;
    tr.classList.remove("dirty");
    setStatus("Prodotto aggiornato.", "ok");
    await loadProducts(state.page);
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
  const row = { ...state.rows[index] };
  card.querySelectorAll("input[data-field]").forEach((input) => {
    row[input.dataset.field] = input.value.trim();
  });

  const qty = row.stockQuantity;
  if (qty !== "" && !Number.isInteger(Number(qty))) {
    setStatus("La quantita deve essere un numero intero.", "error");
    return;
  }

  setLoading(true);
  setStatus(`Salvataggio ${row.name}...`);
  try {
    await window.magazzino.updateProduct(row);
    state.rows[index] = row;
    setStatus("Prodotto aggiornato.", "ok");
    await loadProducts(state.page);
  } catch (error) {
    setStatus(error.message || "Errore durante il salvataggio.", "error");
  } finally {
    setLoading(false);
    renderRows();
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

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && els.configModal.classList.contains("open")) {
    closeSettings();
  }
});

els.refreshButton.addEventListener("click", () => loadProducts(1));
els.menuRefreshButton.addEventListener("click", () => loadProducts(1));
els.updateButton.addEventListener("click", async () => {
  try {
    setUpdateStatus("Controllo aggiornamenti...");
    await window.magazzino.checkForUpdates();
  } catch (error) {
    setUpdateStatus(error.message || "Aggiornamenti non disponibili.");
  }
});
els.menuUpdateButton.addEventListener("click", () => els.updateButton.click());
els.themeToggleButton.addEventListener("click", toggleTheme);
els.listViewButton.addEventListener("click", () => setProductView("list"));
els.gridViewButton.addEventListener("click", () => setProductView("grid"));
els.inlineListViewButton.addEventListener("click", () => setProductView("list"));
els.inlineGridViewButton.addEventListener("click", () => setProductView("grid"));
els.helpButton.addEventListener("click", () => window.magazzino.showHelp());
els.menuQuitButton.addEventListener("click", () => window.magazzino.quitApp());
els.minimizeButton.addEventListener("click", () => window.magazzino.minimizeWindow());
els.maximizeButton.addEventListener("click", async () => {
  const maximized = await window.magazzino.toggleMaximizeWindow();
  els.maximizeButton.textContent = maximized ? "[_]" : "[ ]";
});
els.closeButton.addEventListener("click", () => window.magazzino.closeWindow());
els.prevButton.addEventListener("click", () => loadProducts(state.page - 1));
els.nextButton.addEventListener("click", () => loadProducts(state.page + 1));
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
  if (tr) tr.classList.add("dirty");
});

els.productBody.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action='save']");
  if (button && !button.disabled) saveRow(button.closest("tr"));
});

els.gridShell.addEventListener("input", (event) => {
  if (state.cacheSyncing) return;
  const card = event.target.closest(".productCard");
  if (card) card.classList.add("dirty");
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
applyTheme(state.theme);
setProductView(localStorage.getItem("productView") || "list");
loadConfig();
renderRows();
