(function () {
// ── Acropolis ETF Explorer — etf_explorer.js ─────────────────────────────────
// Data via /yfinance/etf?symbol=X&period=P and /yfinance/etf-screener?symbols=A,B
// (server.py). Charts via Plotly.js.

const API = "";
const DEFAULT_TICKERS = ["VOO", "QQQ", "SPY", "SCHD", "VTI", "IVV", "DIA", "XLK", "ARKK", "GLD", "AGG"];
const WATCHLIST_KEY = "acropolis_etf_watchlist";
const DEFAULT_WATCHLIST = ["VOO", "QQQ", "SCHD", "VTI", "SPY"];

// ── Palette (matches dcf.js / backtester.js conventions) ───────────────────────
const PLOT_BG  = "#2A2A2A";
const SURF_BG  = "#363636";
const GRID_CLR = "#3A3A3A";
const TEXT_CLR = "#AAAAAA";
const BRIGHT   = "#EEEEEE";
const BLUE     = "#6B9EC4";
const GREEN    = "#6BAF8A";
const RED      = "#C47060";
const AMBER    = "#C4A84A";
const PURPLE   = "#9B80C4";
const SILVER   = "#C8C8C8";
const SECTOR_PALETTE = [BLUE, GREEN, RED, AMBER, PURPLE, SILVER, "#7AA8D4", "#7FC79A", "#D4877A", "#D4BD6A"];

// ── State ─────────────────────────────────────────────────────────────────────
let currentTicker   = null;
let currentData      = null;  // last successful /yfinance/etf payload
let activeTab        = "overview";
let chartPeriod      = "1Y";
let watchlist        = loadWatchlist();
let compareTicker    = "QQQ";
let compareData       = null;
let screenerTickers  = ["VOO", "QQQ", "SCHD"];
let screenerData     = {};

const RANGE_OPTIONS = ["1M", "6M", "1Y", "3Y", "5Y", "MAX"];

// ── Plotly base layout (matches dcf.js's basePlot exactly) ──────────────────────
function basePlot(title = "", height = 320) {
  return {
    title: title ? { text: title, font: { family: "Inter, sans-serif", size: 13, color: BRIGHT },
      x: 0.01, xanchor: "left", y: 0.97, yanchor: "top" } : undefined,
    paper_bgcolor: SURF_BG, plot_bgcolor: SURF_BG,
    font: { family: "Inter, sans-serif", color: TEXT_CLR, size: 11 },
    xaxis: { gridcolor: GRID_CLR, zeroline: false, tickfont: { color: TEXT_CLR }, linecolor: GRID_CLR },
    yaxis: { gridcolor: GRID_CLR, zeroline: false, tickfont: { color: TEXT_CLR }, linecolor: GRID_CLR },
    height, margin: { t: title ? 48 : 20, b: 36, l: 56, r: 20 },
    legend: { bgcolor: "rgba(0,0,0,0)", font: { size: 10, color: TEXT_CLR } },
    hoverlabel: { bgcolor: "#2A2A2A", bordercolor: GRID_CLR, font: { family: "Inter, sans-serif", size: 11, color: "#F2F2F2" } },
  };
}
function cfg() { return { displayModeBar: false, responsive: true }; }

// Clears any placeholder/spinner content before drawing so loading states
// never linger underneath a rendered chart.
function plot(el, traces, layout) {
  if (!el) return;
  el.innerHTML = "";
  Plotly.newPlot(el, traces, layout, cfg());
}

function emptyChart(el, msg) {
  if (!el) return;
  el.innerHTML = `<div class="loading-placeholder">${msg || "No data available"}</div>`;
}

// ── Formatters ────────────────────────────────────────────────────────────────
function fmtPrice(v) {
  if (v === null || v === undefined) return "—";
  const n = parseFloat(v);
  return isNaN(n) ? "—" : `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtPct(v, signed = false) {
  if (v === null || v === undefined) return "—";
  const n = parseFloat(v);
  if (isNaN(n)) return "—";
  const sign = signed && n > 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}%`;
}
function fmtMoney(v) {
  if (v === null || v === undefined) return "—";
  const n = parseFloat(v);
  if (isNaN(n)) return "—";
  const abs = Math.abs(n);
  if (abs >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (abs >= 1e9)  return `$${(n / 1e9).toFixed(2)}B`;
  if (abs >= 1e6)  return `$${(n / 1e6).toFixed(2)}M`;
  return `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}
function fmtShares(v) {
  if (v === null || v === undefined) return "—";
  const n = parseFloat(v);
  if (isNaN(n)) return "—";
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${Math.round(n / 1e3)}K`;
  return String(Math.round(n));
}
function fmtVol(v) {
  if (v === null || v === undefined || v === 0) return "—";
  return fmtShares(v);
}
function clsForVal(v) {
  if (v === null || v === undefined) return "";
  return v >= 0 ? "pos" : "neg";
}
function sectorColor(sector, idx) {
  const seed = (sector || "").split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  return SECTOR_PALETTE[(idx !== undefined ? idx : seed) % SECTOR_PALETTE.length];
}
function escapeHtml(s) {
  if (s === null || s === undefined) return "";
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ── Watchlist persistence ────────────────────────────────────────────────────
function loadWatchlist() {
  try {
    const raw = localStorage.getItem(WATCHLIST_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length) return parsed;
    }
  } catch (e) { /* fall through to default */ }
  return DEFAULT_WATCHLIST.slice();
}
function saveWatchlist() {
  try { localStorage.setItem(WATCHLIST_KEY, JSON.stringify(watchlist)); } catch (e) { /* storage unavailable */ }
}

// ── Loading overlay (matches comps.js's showLoader/hideLoader) ─────────────────
function showLoader(msg = "Loading...") {
  let overlay = document.getElementById("etf-loader");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "etf-loader";
    overlay.style.cssText = [
      "position:fixed", "inset:0", "display:flex", "flex-direction:column",
      "align-items:center", "justify-content:center", "z-index:9999",
      "background:rgba(30,30,30,0.72)", "backdrop-filter:blur(2px)",
      "pointer-events:all",
    ].join(";");
    overlay.innerHTML = `
      <span class="spinner" style="width:28px;height:28px;border-width:3px;margin-bottom:14px;"></span>
      <span id="etf-loader-msg" style="font-family:var(--sans);font-size:0.82rem;
        letter-spacing:0.06em;color:var(--dim);text-transform:uppercase;"></span>`;
    document.body.appendChild(overlay);
  }
  overlay.querySelector("#etf-loader-msg").textContent = msg;
  overlay.style.display = "flex";
}
function hideLoader() {
  const overlay = document.getElementById("etf-loader");
  if (overlay) overlay.style.display = "none";
}

// ── API calls ─────────────────────────────────────────────────────────────────
async function fetchEtfData(symbol, period) {
  const res = await fetch(`${API}/yfinance/etf?symbol=${encodeURIComponent(symbol)}&period=${encodeURIComponent(period)}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data;
}
async function fetchScreenerHoldings(symbols) {
  const res = await fetch(`${API}/yfinance/etf-screener?symbols=${encodeURIComponent(symbols.join(","))}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data.holdings || {};
}

// ── Main load flow ───────────────────────────────────────────────────────────
window.fetchEtf = async function (symbolOverride) {
  const sym = (symbolOverride || document.getElementById("etf-ticker").value || "").trim().toUpperCase();
  if (!sym) return;

  document.getElementById("etf-ticker").value = sym;
  showLoader(`Fetching ${sym}...`);
  const content = document.getElementById("etf-content");

  try {
    const data = await fetchEtfData(sym, chartPeriod);
    currentTicker = sym;
    currentData = data;
    activeTab = "overview";
    renderMain();
  } catch (e) {
    content.innerHTML = `<div class="error-box">Could not load ${escapeHtml(sym)}: ${escapeHtml(e.message)}</div>`;
  } finally {
    hideLoader();
  }
};

// ── Sidebar: watchlist ───────────────────────────────────────────────────────
function renderWatchlistSidebar() {
  const listEl = document.getElementById("etf-watch-list");
  const addEl  = document.getElementById("etf-watch-add");
  if (!listEl) return;

  if (watchlist.length === 0) {
    listEl.innerHTML = `<div style="font-family:var(--sans);font-size:0.74rem;color:#555;padding:4px 0;">No tickers yet</div>`;
  } else {
    listEl.innerHTML = watchlist.map(t => `
      <div class="etf-watch-row">
        <div class="etf-watch-chip${t === currentTicker ? " active" : ""}" onclick="window.fetchEtf('${t}')">
          <span class="etf-watch-ticker">${escapeHtml(t)}</span>
          <span class="etf-watch-chg" id="etf-watch-chg-${t}">···</span>
        </div>
        <button class="etf-watch-remove" title="Remove" onclick="event.stopPropagation();window.removeFromWatchlist('${t}')">&times;</button>
      </div>
    `).join("");
  }

  if (addEl) {
    const available = DEFAULT_TICKERS.filter(t => !watchlist.includes(t));
    addEl.innerHTML = `<option value="">+ Add to watchlist</option>` +
      available.map(t => `<option value="${t}">${t}</option>`).join("");
  }
}

window.addToWatchlistFromSelect = function (selectEl) {
  const t = selectEl.value;
  if (!t) return;
  if (!watchlist.includes(t)) {
    watchlist.push(t);
    saveWatchlist();
    renderWatchlistSidebar();
  }
  selectEl.value = "";
};

window.removeFromWatchlist = function (ticker) {
  watchlist = watchlist.filter(t => t !== ticker);
  saveWatchlist();
  renderWatchlistSidebar();
};

// ── Sidebar: chart range buttons ─────────────────────────────────────────────
function renderRangeButtons() {
  const el = document.getElementById("etf-range-btns");
  if (!el) return;
  el.innerHTML = RANGE_OPTIONS.map(p =>
    `<button class="range-btn${p === chartPeriod ? " active" : ""}" onclick="window.setEtfPeriod('${p}')">${p}</button>`
  ).join("");
}

window.setEtfPeriod = async function (period) {
  if (period === chartPeriod) return;
  chartPeriod = period;
  renderRangeButtons();
  if (!currentTicker) return;
  showLoader(`Loading ${period}...`);
  try {
    const data = await fetchEtfData(currentTicker, chartPeriod);
    currentData = data;
    if (activeTab === "overview") renderOverviewTab();
  } catch (e) {
    // keep current chart on failure rather than blanking the page
  } finally {
    hideLoader();
  }
};

// ── Main renderer ─────────────────────────────────────────────────────────────
function renderMain() {
  const d = currentData;
  const meta = d.meta || {};
  const price = d.price || {};
  const content = document.getElementById("etf-content");

  const changeColor = (price.change_pct || 0) >= 0 ? "var(--green)" : "var(--red)";
  const changeSign  = (price.change_pct || 0) > 0 ? "+" : "";

  content.innerHTML = `
    <div style="margin-bottom:16px;">
      <div style="display:flex;align-items:baseline;gap:12px;flex-wrap:wrap;margin-bottom:4px;">
        <div style="font-family:'Times New Roman MT','Times New Roman',Times,serif;font-size:1.8rem;font-weight:400;color:var(--white);line-height:1.15;">${escapeHtml(meta.name || currentTicker)}</div>
        <div style="font-family:var(--sans);font-size:0.7rem;font-weight:600;letter-spacing:0.14em;color:var(--dim);text-transform:uppercase;border:1px solid var(--border2);padding:4px 10px;background:var(--surface);flex-shrink:0;">${escapeHtml(currentTicker)}</div>
      </div>
      <div style="font-family:var(--sans);font-size:0.75rem;color:var(--muted);letter-spacing:0.02em;">
        ${[meta.exchange, meta.category].filter(Boolean).join(" · ")}
        ${d.used_sample ? ' <span style="color:var(--amber);">· sample data shown (live holdings unavailable)</span>' : ""}
      </div>
    </div>

    <div style="display:flex;align-items:baseline;gap:14px;margin-bottom:18px;flex-wrap:wrap;">
      <div style="font-size:2rem;font-weight:500;color:${price.price ? "#F0F0F0" : "var(--muted)"};line-height:1;">${fmtPrice(price.price)}</div>
      <div style="font-family:var(--sans);font-size:0.92rem;color:${changeColor};">
        ${changeSign}${fmtPrice(price.change_amt)} (${fmtPct(price.change_pct, true)})
      </div>
    </div>

    <div class="kpi-strip">
      <div class="kpi-card"><div class="kpi-label">AUM</div><div class="kpi-value">${escapeHtml(meta.aum_fmt || "—")}</div></div>
      <div class="kpi-card"><div class="kpi-label">Expense Ratio</div><div class="kpi-value">${fmtPct(meta.expense_ratio)}</div></div>
      <div class="kpi-card"><div class="kpi-label">Dividend Yield</div><div class="kpi-value">${fmtPct(meta.dividend_yield)}</div></div>
      <div class="kpi-card"><div class="kpi-label">Volume</div><div class="kpi-value">${fmtVol(price.volume)}</div></div>
      <div class="kpi-card"><div class="kpi-label">Holdings</div><div class="kpi-value">${(d.holdings || []).length || meta.total_holdings || "—"}</div></div>
    </div>

    <div class="etf-tabs" style="margin-top:20px;">
      <button class="etf-tab${activeTab === "overview" ? " active" : ""}" data-tab="overview" onclick="window.switchEtfTab('overview')">Overview</button>
      <button class="etf-tab${activeTab === "holdings" ? " active" : ""}" data-tab="holdings" onclick="window.switchEtfTab('holdings')">Holdings</button>
      <button class="etf-tab${activeTab === "compare" ? " active" : ""}" data-tab="compare" onclick="window.switchEtfTab('compare')">Compare</button>
      <button class="etf-tab${activeTab === "screener" ? " active" : ""}" data-tab="screener" onclick="window.switchEtfTab('screener')">Screener</button>
    </div>

    <div id="etf-tab-body" style="padding-top:20px;"></div>
  `;

  renderRangeButtons();
  renderWatchlistSidebar();
  renderTab(activeTab);
};

window.switchEtfTab = function (tab) {
  activeTab = tab;
  document.querySelectorAll(".etf-tab").forEach(el => el.classList.toggle("active", el.dataset.tab === tab));
  renderTab(tab);
};

function renderTab(tab) {
  const body = document.getElementById("etf-tab-body");
  if (!body) return;
  switch (tab) {
    case "overview": renderOverviewTab(); break;
    case "holdings": renderHoldingsTab(); break;
    case "compare":  renderCompareTab();  break;
    case "screener": renderScreenerTab(); break;
  }
}

// ── Overview tab ──────────────────────────────────────────────────────────────
function renderOverviewTab() {
  const body = document.getElementById("etf-tab-body");
  if (!body) return;
  const d = currentData;
  const holdings = d.holdings || [];
  const sectors  = d.sectors || {};

  body.innerHTML = `
    <div class="chart-card" id="etf-price-chart" style="min-height:300px;margin-bottom:16px;">
      <div class="loading-placeholder"><span class="spinner"></span></div>
    </div>

    <div class="chart-grid">
      <div>
        <div class="section-title" style="margin-top:0;">Sector Allocation</div>
        <div class="chart-card" id="etf-sector-donut" style="min-height:280px;">
          <div class="loading-placeholder"><span class="spinner"></span></div>
        </div>
      </div>
      <div>
        <div class="section-title" style="margin-top:0;">Top 10 Holdings</div>
        <div class="chart-card" id="etf-top-holdings" style="min-height:280px;">
          <div class="loading-placeholder"><span class="spinner"></span></div>
        </div>
      </div>
    </div>
  `;

  drawPriceChart("etf-price-chart", d.history, currentTicker);
  drawSectorDonut("etf-sector-donut", sectors);
  drawTopHoldingsBar("etf-top-holdings", holdings);
}

function drawPriceChart(elId, history, label) {
  const el = document.getElementById(elId);
  if (!history || !history.dates || history.dates.length === 0) {
    emptyChart(el, "No price history available");
    return;
  }
  const layout = basePlot("", 300);
  layout.yaxis.tickprefix = "$";
  layout.hovermode = "x unified";
  plot(el, [{
    x: history.dates, y: history.values, type: "scatter", mode: "lines",
    name: label, line: { color: BLUE, width: 1.6 },
    fill: "tozeroy", fillcolor: "rgba(107,158,196,0.08)",
    hovertemplate: `<b>${label}</b>: $%{y:,.2f}<extra></extra>`,
  }], layout);
}

function drawSectorDonut(elId, sectors) {
  const el = document.getElementById(elId);
  const entries = Object.entries(sectors || {}).filter(([, v]) => v >= 0.1).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) {
    emptyChart(el, "No sector data available");
    return;
  }
  const labels = entries.map(([k]) => k);
  const values = entries.map(([, v]) => v);
  const colors = labels.map((s, i) => sectorColor(s, i));
  const layout = basePlot("", 280);
  layout.showlegend = true;
  layout.legend = { orientation: "v", x: 1.02, y: 0.5, xanchor: "left", font: { size: 10, color: TEXT_CLR }, bgcolor: "rgba(0,0,0,0)" };
  layout.margin = { l: 8, r: 130, t: 8, b: 8 };
  plot(el, [{
    type: "pie", labels, values, hole: 0.58,
    marker: { colors, line: { color: SURF_BG, width: 2 } },
    textinfo: "none", sort: false,
    hovertemplate: "<b>%{label}</b><br>%{value:.2f}%<extra></extra>",
  }], layout);
}

function drawTopHoldingsBar(elId, holdings) {
  const el = document.getElementById(elId);
  if (!holdings || holdings.length === 0) {
    emptyChart(el, "No holdings data available");
    return;
  }
  const top = holdings.slice(0, 10).slice().reverse();
  const colors = top.map((h, i) => sectorColor(h.sector, i));
  const layout = basePlot("", 280);
  layout.margin = { l: 52, r: 56, t: 8, b: 28 };
  layout.xaxis.ticksuffix = "%";
  layout.yaxis.tickfont = { color: BLUE, size: 11, family: "Inter, sans-serif" };
  layout.yaxis.automargin = true;
  plot(el, [{
    type: "bar", orientation: "h",
    x: top.map(h => h.weight), y: top.map(h => h.symbol),
    marker: { color: colors },
    text: top.map(h => `${(h.weight || 0).toFixed(2)}%`),
    textposition: "outside",
    textfont: { size: 10, color: TEXT_CLR },
    customdata: top.map(h => h.company || h.symbol),
    hovertemplate: "<b>%{y}</b> — %{customdata}<br>%{x:.2f}%<extra></extra>",
  }], layout);
}

// ── Holdings tab ──────────────────────────────────────────────────────────────
function renderHoldingsTab() {
  const body = document.getElementById("etf-tab-body");
  if (!body) return;
  const holdings = (currentData && currentData.holdings) || [];

  if (holdings.length === 0) {
    body.innerHTML = `<div class="info-box">No holdings data available for ${escapeHtml(currentTicker)}.</div>`;
    return;
  }

  body.innerHTML = `
    <div class="section-title" style="margin-top:0;">Holdings Treemap</div>
    <div class="chart-card" id="etf-treemap" style="min-height:380px;margin-bottom:20px;">
      <div class="loading-placeholder"><span class="spinner"></span></div>
    </div>

    <div class="section-title">Full Holdings <span style="color:var(--muted);font-weight:400;">(${holdings.length} positions)</span></div>
    <div class="fin-table-wrap" style="max-height:520px;overflow-y:auto;">
      <table class="fin-table">
        <thead><tr>
          <th>Symbol</th><th>Company</th><th>Sector</th><th>Weight</th>
        </tr></thead>
        <tbody>
          ${holdings.map(h => `
            <tr>
              <td style="text-align:left;color:${BLUE};font-weight:600;">${escapeHtml(h.symbol)}</td>
              <td style="text-align:left;max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(h.company)}</td>
              <td style="text-align:left;">${escapeHtml(h.sector || "Other")}</td>
              <td>${fmtPct(h.weight)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;

  drawTreemap("etf-treemap", holdings);
}

function drawTreemap(elId, holdings) {
  const el = document.getElementById(elId);
  const rows = holdings.filter(h => h.weight > 0).slice(0, 50);
  if (rows.length === 0) {
    emptyChart(el, "No holdings data available");
    return;
  }

  const sectorsSeen = [...new Set(rows.map(h => h.sector || "Other"))];
  const sectorColorMap = {};
  sectorsSeen.forEach((s, i) => { sectorColorMap[s] = sectorColor(s, i); });

  const labels = [""], parents = [""], values = [0], colors = ["rgba(0,0,0,0)"];
  sectorsSeen.forEach(sec => {
    labels.push(sec);
    parents.push("");
    values.push(rows.filter(h => (h.sector || "Other") === sec).reduce((a, h) => a + (h.weight || 0), 0));
    colors.push(sectorColorMap[sec]);
  });
  rows.forEach(h => {
    labels.push(h.symbol);
    parents.push(h.sector || "Other");
    values.push(h.weight);
    colors.push(sectorColorMap[h.sector || "Other"]);
  });

  const layout = basePlot("", 380);
  layout.margin = { l: 4, r: 4, t: 8, b: 4 };
  plot(el, [{
    type: "treemap", labels, parents, values, branchvalues: "total",
    marker: { colors, line: { width: 1, color: PLOT_BG } },
    texttemplate: "<b>%{label}</b><br>%{value:.2f}%",
    textfont: { size: 11, color: "#1A1A1A" },
    hovertemplate: "<b>%{label}</b><br>%{value:.2f}%<extra></extra>",
    maxdepth: 2,
  }], layout);
}

// ── Compare tab ───────────────────────────────────────────────────────────────
function renderCompareTab() {
  const body = document.getElementById("etf-tab-body");
  if (!body) return;

  const options = DEFAULT_TICKERS.map(t =>
    `<option value="${t}" ${t === compareTicker ? "selected" : ""}>${t}</option>`
  ).join("");

  body.innerHTML = `
    <div style="display:flex;align-items:flex-end;gap:14px;margin-bottom:20px;flex-wrap:wrap;">
      <div class="etf-input-group" style="margin-bottom:0;width:180px;">
        <label class="etf-input-label">Compare ${escapeHtml(currentTicker)} against</label>
        <select id="etf-compare-select" class="etf-select">${options}</select>
      </div>
      <button id="etf-compare-btn" class="range-btn" style="border-right:1px solid var(--border2);padding:8px 16px;" onclick="window.runCompare()">Compare</button>
    </div>
    <div id="etf-compare-body"></div>
  `;

  if (compareTicker === currentTicker) {
    const alt = DEFAULT_TICKERS.find(t => t !== currentTicker) || "QQQ";
    compareTicker = alt;
    document.getElementById("etf-compare-select").value = alt;
  }

  window.runCompare();
}

window.runCompare = async function () {
  const sel = document.getElementById("etf-compare-select");
  compareTicker = sel.value;
  const compareBody = document.getElementById("etf-compare-body");
  if (!compareBody) return;

  if (compareTicker === currentTicker) {
    compareBody.innerHTML = `<div class="info-box">Choose a different ETF to compare against ${escapeHtml(currentTicker)}.</div>`;
    return;
  }

  compareBody.innerHTML = `<div class="loading-placeholder" style="min-height:200px;"><span class="spinner"></span>Loading ${escapeHtml(compareTicker)}...</div>`;

  try {
    compareData = await fetchEtfData(compareTicker, chartPeriod);
  } catch (e) {
    compareBody.innerHTML = `<div class="error-box">Could not load ${escapeHtml(compareTicker)}: ${escapeHtml(e.message)}</div>`;
    return;
  }

  const a = currentData, b = compareData;
  const aH = a.holdings || [], bH = b.holdings || [];
  const aSyms = new Set(aH.map(h => h.symbol));
  const bSyms = new Set(bH.map(h => h.symbol));
  const common = [...aSyms].filter(s => bSyms.has(s));
  const aWeights = Object.fromEntries(aH.map(h => [h.symbol, h.weight || 0]));
  const bWeights = Object.fromEntries(bH.map(h => [h.symbol, h.weight || 0]));
  const weightedOverlap = common.reduce((sum, s) => sum + Math.min(aWeights[s] || 0, bWeights[s] || 0), 0);

  compareBody.innerHTML = `
    <div class="fin-table-wrap" style="margin-bottom:20px;">
      <table class="fin-table">
        <thead><tr><th></th><th>${escapeHtml(currentTicker)}</th><th>${escapeHtml(compareTicker)}</th></tr></thead>
        <tbody>
          <tr><td style="text-align:left;">Name</td><td>${escapeHtml(a.meta.name)}</td><td>${escapeHtml(b.meta.name)}</td></tr>
          <tr><td style="text-align:left;">Price</td><td>${fmtPrice(a.price.price)}</td><td>${fmtPrice(b.price.price)}</td></tr>
          <tr><td style="text-align:left;">Day Change</td><td class="${clsForVal(a.price.change_pct)}">${fmtPct(a.price.change_pct, true)}</td><td class="${clsForVal(b.price.change_pct)}">${fmtPct(b.price.change_pct, true)}</td></tr>
          <tr><td style="text-align:left;">AUM</td><td>${escapeHtml(a.meta.aum_fmt || "—")}</td><td>${escapeHtml(b.meta.aum_fmt || "—")}</td></tr>
          <tr><td style="text-align:left;">Expense Ratio</td><td>${fmtPct(a.meta.expense_ratio)}</td><td>${fmtPct(b.meta.expense_ratio)}</td></tr>
          <tr><td style="text-align:left;">Dividend Yield</td><td>${fmtPct(a.meta.dividend_yield)}</td><td>${fmtPct(b.meta.dividend_yield)}</td></tr>
          <tr><td style="text-align:left;">Holdings</td><td>${aH.length || "—"}</td><td>${bH.length || "—"}</td></tr>
        </tbody>
      </table>
    </div>

    <div class="section-title" style="margin-top:0;">Normalized Price Performance (Base 100)</div>
    <div class="chart-card" id="etf-compare-price" style="min-height:300px;margin-bottom:20px;">
      <div class="loading-placeholder"><span class="spinner"></span></div>
    </div>

    <div class="section-title">Sector Allocation Comparison</div>
    <div class="chart-card" id="etf-compare-sectors" style="min-height:300px;margin-bottom:20px;">
      <div class="loading-placeholder"><span class="spinner"></span></div>
    </div>

    <div class="kpi-strip">
      <div class="kpi-card"><div class="kpi-label">${escapeHtml(currentTicker)} Holdings</div><div class="kpi-value">${aH.length}</div></div>
      <div class="kpi-card"><div class="kpi-label">${escapeHtml(compareTicker)} Holdings</div><div class="kpi-value">${bH.length}</div></div>
      <div class="kpi-card"><div class="kpi-label">Shared Holdings</div><div class="kpi-value">${common.length}</div></div>
      <div class="kpi-card"><div class="kpi-label">Weighted Overlap</div><div class="kpi-value amber">${weightedOverlap.toFixed(1)}%</div></div>
    </div>
  `;

  drawComparePriceChart("etf-compare-price", a, b);
  drawCompareSectorBar("etf-compare-sectors", a.sectors || {}, b.sectors || {}, currentTicker, compareTicker);
};

function drawComparePriceChart(elId, a, b) {
  const el = document.getElementById(elId);
  const ha = a.history, hb = b.history;
  if (!ha || !ha.dates || ha.dates.length === 0 || !hb || !hb.dates || hb.dates.length === 0) {
    emptyChart(el, "No price history available");
    return;
  }
  const baseA = ha.values[0], baseB = hb.values[0];
  const layout = basePlot("", 300);
  layout.hovermode = "x unified";
  plot(el, [
    {
      x: ha.dates, y: ha.values.map(v => (v / baseA) * 100), type: "scatter", mode: "lines",
      name: a.meta.ticker, line: { color: BLUE, width: 1.8 },
    },
    {
      x: hb.dates, y: hb.values.map(v => (v / baseB) * 100), type: "scatter", mode: "lines",
      name: b.meta.ticker, line: { color: GREEN, width: 1.8 },
    },
  ], layout);
}

function drawCompareSectorBar(elId, sectorsA, sectorsB, labelA, labelB) {
  const el = document.getElementById(elId);
  const allSectors = [...new Set([...Object.keys(sectorsA), ...Object.keys(sectorsB)])].sort();
  if (allSectors.length === 0) {
    emptyChart(el, "No sector data available");
    return;
  }
  const layout = basePlot("", 300);
  layout.margin = { l: 44, r: 12, t: 8, b: 60 };
  layout.xaxis.tickangle = -30;
  layout.yaxis.ticksuffix = "%";
  layout.barmode = "group";
  layout.showlegend = true;
  layout.legend = { orientation: "h", x: 1, xanchor: "right", y: 1.12, font: { size: 10, color: TEXT_CLR }, bgcolor: "rgba(0,0,0,0)" };
  plot(el, [
    { type: "bar", name: labelA, x: allSectors, y: allSectors.map(s => sectorsA[s] || 0), marker: { color: BLUE } },
    { type: "bar", name: labelB, x: allSectors, y: allSectors.map(s => sectorsB[s] || 0), marker: { color: GREEN } },
  ], layout);
}

// ── Screener tab ──────────────────────────────────────────────────────────────
let screenerFilterSymbol = "";
let screenerFilterSector = "All";
let screenerFilterMinWeight = 0;

function renderScreenerTab() {
  const body = document.getElementById("etf-tab-body");
  if (!body) return;

  const checks = DEFAULT_TICKERS.map(t => `
    <label class="etf-screener-check">
      <input type="checkbox" value="${t}" ${screenerTickers.includes(t) ? "checked" : ""}
        onchange="window.toggleScreenerTicker('${t}', this.checked)" />
      ${t}
    </label>
  `).join("");

  body.innerHTML = `
    <div class="section-title" style="margin-top:0;">Select ETFs to Screen</div>
    <div class="etf-screener-checks">${checks}</div>

    <div class="chart-grid thirds" style="margin-bottom:16px;">
      <div class="etf-input-group" style="margin-bottom:0;">
        <label class="etf-input-label">Search Symbol / Company</label>
        <input id="etf-screener-search" class="etf-input" type="text" placeholder="e.g. AAPL or Apple"
          oninput="window.updateScreenerFilter()" />
      </div>
      <div class="etf-input-group" style="margin-bottom:0;">
        <label class="etf-input-label">Sector</label>
        <select id="etf-screener-sector" class="etf-select" onchange="window.updateScreenerFilter()">
          <option value="All">All Sectors</option>
        </select>
      </div>
      <div class="etf-input-group" style="margin-bottom:0;">
        <label class="etf-input-label">Min Weight (%)</label>
        <input id="etf-screener-minwt" class="etf-input" type="number" value="0" min="0" step="0.1"
          oninput="window.updateScreenerFilter()" />
      </div>
    </div>

    <div class="section-title">Results <span id="etf-screener-count" style="color:var(--muted);font-weight:400;"></span></div>
    <div class="fin-table-wrap" style="max-height:560px;overflow-y:auto;">
      <table class="fin-table" id="etf-screener-table"></table>
    </div>
  `;

  loadScreenerData();
}

window.toggleScreenerTicker = function (ticker, checked) {
  if (checked && !screenerTickers.includes(ticker)) screenerTickers.push(ticker);
  if (!checked) screenerTickers = screenerTickers.filter(t => t !== ticker);
  loadScreenerData();
};

async function loadScreenerData() {
  const tableEl = document.getElementById("etf-screener-table");
  if (!tableEl) return;

  if (screenerTickers.length === 0) {
    tableEl.innerHTML = `<tr><td class="loading-placeholder">Select at least one ETF above.</td></tr>`;
    document.getElementById("etf-screener-count").textContent = "";
    return;
  }

  tableEl.innerHTML = `<tr><td class="loading-placeholder"><span class="spinner"></span>Loading holdings...</td></tr>`;
  try {
    screenerData = await fetchScreenerHoldings(screenerTickers);
  } catch (e) {
    tableEl.innerHTML = `<tr><td class="loading-placeholder">Failed to load screener data: ${escapeHtml(e.message)}</td></tr>`;
    return;
  }
  populateScreenerSectorFilter();
  renderScreenerTable();
}

function populateScreenerSectorFilter() {
  const sectors = new Set();
  Object.values(screenerData).forEach(rows => (rows || []).forEach(h => sectors.add(h.sector || "Other")));
  const sel = document.getElementById("etf-screener-sector");
  if (!sel) return;
  const current = sel.value;
  sel.innerHTML = `<option value="All">All Sectors</option>` +
    [...sectors].sort().map(s => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join("");
  if ([...sectors].includes(current)) sel.value = current;
}

window.updateScreenerFilter = function () {
  screenerFilterSymbol   = (document.getElementById("etf-screener-search").value || "").trim().toLowerCase();
  screenerFilterSector   = document.getElementById("etf-screener-sector").value;
  screenerFilterMinWeight = parseFloat(document.getElementById("etf-screener-minwt").value) || 0;
  renderScreenerTable();
};

function renderScreenerTable() {
  const tableEl = document.getElementById("etf-screener-table");
  const countEl = document.getElementById("etf-screener-count");
  if (!tableEl) return;

  const bySymbol = {};
  for (const ticker of screenerTickers) {
    (screenerData[ticker] || []).forEach(h => {
      if (!bySymbol[h.symbol]) bySymbol[h.symbol] = { symbol: h.symbol, company: h.company, sector: h.sector || "Other", weights: {} };
      bySymbol[h.symbol].weights[ticker] = h.weight;
    });
  }

  let rows = Object.values(bySymbol);
  if (screenerFilterSymbol) {
    rows = rows.filter(r => r.symbol.toLowerCase().includes(screenerFilterSymbol) || (r.company || "").toLowerCase().includes(screenerFilterSymbol));
  }
  if (screenerFilterSector !== "All") rows = rows.filter(r => r.sector === screenerFilterSector);
  if (screenerFilterMinWeight > 0) rows = rows.filter(r => Object.values(r.weights).some(w => w >= screenerFilterMinWeight));

  rows.sort((a, b) => Math.max(0, ...Object.values(b.weights)) - Math.max(0, ...Object.values(a.weights)));

  countEl.textContent = `(${rows.length} stocks)`;

  if (rows.length === 0) {
    tableEl.innerHTML = `<tr><td class="loading-placeholder">No holdings match the current filters.</td></tr>`;
    return;
  }

  const header = `<th style="text-align:left;">Symbol</th><th style="text-align:left;">Company</th><th style="text-align:left;">Sector</th>` +
    screenerTickers.map(t => `<th>${escapeHtml(t)}</th>`).join("");

  const body = rows.slice(0, 300).map(r => {
    const cells = screenerTickers.map(t => `<td>${r.weights[t] !== undefined ? fmtPct(r.weights[t]) : "—"}</td>`).join("");
    return `<tr>
      <td style="text-align:left;color:${BLUE};font-weight:600;">${escapeHtml(r.symbol)}</td>
      <td style="text-align:left;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(r.company)}</td>
      <td style="text-align:left;">${escapeHtml(r.sector)}</td>
      ${cells}
    </tr>`;
  }).join("");

  tableEl.innerHTML = `<thead><tr>${header}</tr></thead><tbody>${body}</tbody>`;
}

// ── Init ───────────────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", function () {
  renderWatchlistSidebar();
  renderRangeButtons();
  window.fetchEtf("VOO");
});

})();
