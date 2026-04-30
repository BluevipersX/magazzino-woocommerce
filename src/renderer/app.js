const state = {
  rows: [],
  page: 1,
  totalPages: 1,
  loading: false,
  requestId: 0,
  searchTimer: null
};

const els = {
  configForm: document.querySelector("#configForm"),
  configModal: document.querySelector("#configModal"),
  settingsButton: document.querySelector("#settingsButton"),
  closeSettingsButton: document.querySelector("#closeSettingsButton"),
  storeUrl: document.querySelector("#storeUrl"),
  consumerKey: document.querySelector("#consumerKey"),
  consumerSecret: document.querySelector("#consumerSecret"),
  testButton: document.querySelector("#testButton"),
  searchInput: document.querySelector("#searchInput"),
  stockFilter: document.querySelector("#stockFilter"),
  refreshButton: document.querySelector("#refreshButton"),
  updateButton: document.querySelector("#updateButton"),
  updateText: document.querySelector("#updateText"),
  prevButton: document.querySelector("#prevButton"),
  nextButton: document.querySelector("#nextButton"),
  pageText: document.querySelector("#pageText"),
  statusText: document.querySelector("#statusText"),
  productBody: document.querySelector("#productBody")
};

function setStatus(message, tone = "normal") {
  els.statusText.textContent = message;
  els.statusText.style.color = tone === "error" ? "#a23b3b" : tone === "ok" ? "#0d5b47" : "";
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

  if (!state.rows.length) {
    els.productBody.innerHTML = `<tr><td colspan="8" class="empty">Nessun prodotto trovato.</td></tr>`;
    return;
  }

  els.productBody.innerHTML = state.rows
    .map(
      (row, index) => `
      <tr data-index="${index}">
        <td>
          <div class="productName">${escapeHtml(row.name)}</div>
          <div class="subtle">ID ${row.id}${row.parentId ? `, padre ${row.parentId}` : ""}</div>
        </td>
        <td>${escapeHtml(row.sku || "-")}</td>
        <td>${escapeHtml(row.type)}</td>
        <td><input class="cellInput" data-field="regularPrice" value="${escapeAttr(moneyValue(row.regularPrice))}" inputmode="decimal" /></td>
        <td><input class="cellInput" data-field="salePrice" value="${escapeAttr(moneyValue(row.salePrice))}" inputmode="decimal" /></td>
        <td><input class="qtyInput" data-field="stockQuantity" value="${escapeAttr(moneyValue(row.stockQuantity))}" inputmode="numeric" /></td>
        <td><span class="badge ${escapeAttr(row.stockStatus)}">${stockLabel(row.stockStatus)}</span></td>
        <td><button type="button" data-action="save">Salva</button></td>
      </tr>
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
    setStatus("Configurazione caricata. Premi Aggiorna per leggere i prodotti.", "ok");
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
  setStatus("Caricamento prodotti...");
  try {
    const result = await window.magazzino.listProducts({
      page,
      search: els.searchInput.value,
      stockStatus: els.stockFilter.value
    });
    if (requestId !== state.requestId) return;
    state.rows = result.rows;
    state.page = result.page;
    state.totalPages = result.totalPages;
    setStatus(`${result.rows.length} righe caricate. I prodotti variabili vengono mostrati come varianti.`);
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
  }, 450);
}

async function saveRow(tr) {
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

els.configForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await saveConfig();
  } catch (error) {
    setStatus(error.message || "Errore configurazione.", "error");
  }
});

els.settingsButton.addEventListener("click", openSettings);
els.closeSettingsButton.addEventListener("click", closeSettings);

els.testButton.addEventListener("click", async () => {
  try {
    await saveConfig();
    setLoading(true);
    setStatus("Test collegamento...");
    await window.magazzino.testConnection();
    setStatus("Collegamento riuscito.", "ok");
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
els.updateButton.addEventListener("click", async () => {
  try {
    setUpdateStatus("Controllo aggiornamenti...");
    await window.magazzino.checkForUpdates();
  } catch (error) {
    setUpdateStatus(error.message || "Aggiornamenti non disponibili.");
  }
});
els.prevButton.addEventListener("click", () => loadProducts(state.page - 1));
els.nextButton.addEventListener("click", () => loadProducts(state.page + 1));
els.stockFilter.addEventListener("change", () => loadProducts(1));
els.searchInput.addEventListener("input", scheduleLiveSearch);
els.searchInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") loadProducts(1);
});

els.productBody.addEventListener("input", (event) => {
  const tr = event.target.closest("tr");
  if (tr) tr.classList.add("dirty");
});

els.productBody.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action='save']");
  if (button) saveRow(button.closest("tr"));
});

window.magazzino.onUpdateState(setUpdateStatus);
window.magazzino.getUpdateState().then(setUpdateStatus);
loadConfig();
renderRows();
