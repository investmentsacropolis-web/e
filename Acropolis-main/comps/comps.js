/**
 * comps/comps.js — Acropolis Comparable Company Analysis
 *
 * Depends on: Plotly.js, ../components/shell.js, ../components/plotly-utils.js
 * API:        GET /yfinance/comps?symbol=TICKER
 *             GET /yfinance/history?symbol=TICKER
 */

// ── State ─────────────────────────────────────────────────────────────────────
let subject       = null;
let compInfos     = [];
let historyMap    = {};
let perfPeriod    = "1Y";
let activeTab     = "summary";
let analysisRun   = false;
let addingComps   = false;  // mutex — prevents concurrent addComps calls
let fetchingSubj  = false;  // mutex — prevents concurrent fetchSubject calls

const PERF_PERIODS = { "1M": 30, "3M": 91, "6M": 182, "1Y": 365, "2Y": 730, "3Y": 1095 };
const COLORS = [C.blue, C.green, C.red, C.amber, C.purple, C.silver];

// ── Formatting helpers ────────────────────────────────────────────────────────
function fmt(val, { decimals = 1, suffix = "", prefix = "" } = {}) {
  if (val === null || val === undefined) return "—";
  const n = parseFloat(val);
  if (isNaN(n)) return "—";
  return `${prefix}${n.toFixed(decimals)}${suffix}`;
}

function fmtMC(val) {
  if (val === null || val === undefined) return "—";
  return `$${parseFloat(val).toFixed(1)}B`;
}

// ── Loading overlay ───────────────────────────────────────────────────────────
function showLoader(msg = "Loading...") {
  let overlay = document.getElementById("comps-loader");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "comps-loader";
    overlay.style.cssText = [
      "position:fixed", "inset:0", "display:flex", "flex-direction:column",
      "align-items:center", "justify-content:center", "z-index:9999",
      "background:rgba(30,30,30,0.72)", "backdrop-filter:blur(2px)",
      "pointer-events:all",
    ].join(";");
    overlay.innerHTML = `
      <span class="spinner" style="width:28px;height:28px;border-width:3px;margin-bottom:14px;"></span>
      <span id="comps-loader-msg" style="font-family:var(--sans);font-size:0.82rem;
        letter-spacing:0.06em;color:var(--dim);text-transform:uppercase;"></span>`;
    document.body.appendChild(overlay);
  }
  overlay.querySelector("#comps-loader-msg").textContent = msg;
  overlay.style.display = "flex";
}

function hideLoader() {
  const overlay = document.getElementById("comps-loader");
  if (overlay) overlay.style.display = "none";
}

// ── API calls ─────────────────────────────────────────────────────────────────
async function fetchComp(symbol) {
  const res = await fetch(`/yfinance/comps?symbol=${encodeURIComponent(symbol)}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data;
}

async function fetchHistory(symbol) {
  const res = await fetch(`/yfinance/history?symbol=${encodeURIComponent(symbol)}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data;
}

// ── Subject fetch ─────────────────────────────────────────────────────────────
async function fetchSubject() {
  if (fetchingSubj) return;
  const raw = document.getElementById("subject-input").value.trim().toUpperCase();
  if (!raw) return;
  fetchingSubj = true;
  showLoader(`Fetching ${raw}...`);
  try {
    subject     = await fetchComp(raw);
    compInfos   = [];
    historyMap  = {};
    analysisRun = false;
    updateCompSetList();
    renderSubjectCard();
    document.getElementById("run-btn").disabled = true;
  } catch (e) {
    document.getElementById("comps-content").innerHTML =
      `<div class="error-box">Could not find data for <b>${raw}</b>. Check the ticker and try again.</div>`;
  } finally {
    fetchingSubj = false;
    hideLoader();
  }
}

// ── Add comps ─────────────────────────────────────────────────────────────────
async function addComps() {
  if (!subject || addingComps) return;
  const raw = document.getElementById("add-input").value.trim().toUpperCase();
  if (!raw) return;

  addingComps = true;
  const symbols = raw.split(",").map(s => s.trim()).filter(Boolean);

  showLoader(`Fetching ${symbols.length > 1 ? symbols.length + " tickers" : symbols[0]}...`);

  // Snapshot existing tickers at lock-acquisition time — no concurrent call can race this now
  const existing = new Set(compInfos.map(d => d.ticker));
  let addedAny = false;

  for (const sym of symbols) {
    if (sym === subject.ticker || existing.has(sym)) continue;
    try {
      const info = await fetchComp(sym);
      const normalTicker = (info.ticker || sym).toUpperCase();
      if (normalTicker === subject.ticker || existing.has(normalTicker)) continue;
      compInfos.push(info);
      existing.add(normalTicker);
      addedAny = true;
    } catch (_) {}
  }

  if (addedAny) {
    document.getElementById("run-btn").disabled = false;
    updateCompSetList();
  }
  document.getElementById("add-input").value = "";
  addingComps = false;
  hideLoader();
}

// ── Remove comp ───────────────────────────────────────────────────────────────
function removeComp(ticker) {
  compInfos = compInfos.filter(d => d.ticker !== ticker);
  delete historyMap[ticker];
  updateCompSetList();
  if (compInfos.length === 0) {
    document.getElementById("run-btn").disabled = true;
    analysisRun = false;
    renderSubjectCard();
  } else if (analysisRun) {
    runAnalysis();
  }
}

// ── Run analysis ──────────────────────────────────────────────────────────────
async function runAnalysis() {
  if (!subject || compInfos.length === 0) return;
  analysisRun = true;
  showLoader("Loading price history...");

  const universe = [subject, ...compInfos];
  await Promise.all(
    universe
      .filter(d => !historyMap[d.ticker])
      .map(async d => {
        try { historyMap[d.ticker] = await fetchHistory(d.ticker); }
        catch (_) { historyMap[d.ticker] = { dates: [], values: [] }; }
      })
  );

  hideLoader();
  renderAnalysis();
}

// ── Sidebar comp set list ─────────────────────────────────────────────────────
function updateCompSetList() {
  const el = document.getElementById("comp-set-list");
  if (compInfos.length === 0) { el.innerHTML = ""; return; }

  el.innerHTML = `
    <hr class="sidebar-rule">
    <span class="sidebar-section-label">Comp Set (${compInfos.length})</span>
    ${compInfos.map(d => `
      <div class="sb-comp-card">
        <div class="sb-comp-ticker">${d.ticker}</div>
        <div class="sb-comp-name">${(d.name || "").slice(0, 28)}</div>
        <div class="sb-comp-meta">MCap ${fmtMC(d.market_cap)} &nbsp;&middot;&nbsp; P/E ${fmt(d.pe, { suffix: "x" })}</div>
        <button class="sb-remove-btn" onclick="removeComp('${d.ticker}')">x Remove</button>
      </div>
    `).join("")}
  `;
}

// ── Subject card ──────────────────────────────────────────────────────────────
function renderSubjectCard() {
  const s = subject;
  const mul = v => fmt(v, { suffix: "x" });
  const pct = v => fmt(v, { suffix: "%" });

  const kpis = [
    ["Price",        s.currency ? `${s.currency} ${fmt(s.price, { decimals: 2 })}` : fmt(s.price, { decimals: 2 })],
    ["Market Cap",   fmtMC(s.market_cap)],
    ["P/E",          mul(s.pe)],
    ["EV/EBITDA",    mul(s.ev_ebitda)],
    ["P/S",          mul(s.ps)],
    ["EV/Rev",       mul(s.ev_rev)],
    ["Gross Margin", pct(s.gross_margin)],
    ["Rev Growth",   pct(s.rev_growth)],
    ["Beta",         fmt(s.beta, { decimals: 2 })],
  ];

  const kpiHtml = kpis.map(([label, val]) => `
    <div class="subject-kpi">
      <div class="subject-kpi-label">${label}</div>
      <div class="subject-kpi-value">${val}</div>
    </div>
  `).join("");

  const hint = compInfos.length > 0
    ? "Click <b>Run analysis</b> to update results."
    : "Add comparables in the sidebar, then click <b>Run Analysis</b>.";

  document.getElementById("comps-content").innerHTML = `
    <div class="subject-card">
      <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:3px;">
        <div class="subject-name" style="margin-bottom:0;">${s.name || s.ticker}</div>
        <div style="font-family:var(--sans);font-size:0.7rem;font-weight:600;
          letter-spacing:0.14em;color:var(--dim);text-transform:uppercase;border:1px solid var(--border2);
          padding:4px 10px;background:var(--surface);flex-shrink:0;align-self:center;">${s.ticker}</div>
      </div>
      <div class="subject-meta">${s.sector || "—"} &nbsp;&middot;&nbsp; ${s.industry || "—"}</div>
      <div class="subject-kpis">${kpiHtml}</div>
    </div>
    <div class="info-box" id="analysis-hint">${hint}</div>
    <div id="analysis-output"></div>
  `;

  if (analysisRun && compInfos.length > 0) renderAnalysis();
}

// ── Full analysis render ──────────────────────────────────────────────────────
function renderAnalysis() {
  const hint = document.getElementById("analysis-hint");
  if (hint) hint.style.display = "none";

  const out = document.getElementById("analysis-output");
  if (!out) return;

  out.innerHTML = `
    <div class="comp-tabs" id="comp-tabs">
      <button class="comp-tab" data-tab="summary"     onclick="switchTab('summary')">Summary</button>
      <button class="comp-tab" data-tab="valuation"   onclick="switchTab('valuation')">Valuation</button>
      <button class="comp-tab" data-tab="performance" onclick="switchTab('performance')">Price Performance</button>
      <button class="comp-tab" data-tab="vs-median"   onclick="switchTab('vs-median')">vs. Comp Median</button>
    </div>
    <div id="tab-content" style="padding-top:20px;"></div>
  `;

  // Mark active tab
  document.querySelectorAll(".comp-tab").forEach(b =>
    b.classList.toggle("active", b.dataset.tab === activeTab)
  );

  renderTab(activeTab);
}

function switchTab(tab) {
  activeTab = tab;
  document.querySelectorAll(".comp-tab").forEach(b =>
    b.classList.toggle("active", b.dataset.tab === tab)
  );
  renderTab(tab);
}

function renderTab(tab) {
  const el = document.getElementById("tab-content");
  if (!el) return;
  if      (tab === "summary")     renderSummaryTab(el);
  else if (tab === "valuation")   renderValuationTab(el);
  else if (tab === "performance") renderPerformanceTab(el);
  else if (tab === "vs-median")   renderVsMedianTab(el);
}

// ── TAB 1: Summary ────────────────────────────────────────────────────────────
function renderSummaryTab(el) {
  const universe = [subject, ...compInfos];

  // Two column groups to keep the table from overflowing
  const group1 = [
    { key: "price",      label: "Price",       decimals: 2 },
    { key: "market_cap", label: "Mkt Cap ($B)", decimals: 1 },
    { key: "pe",         label: "P/E",          decimals: 1 },
    { key: "ev_ebitda",  label: "EV/EBITDA",    decimals: 1 },
    { key: "ps",         label: "P/S",           decimals: 1 },
    { key: "pb",         label: "P/B",           decimals: 1 },
    { key: "ev_rev",     label: "EV/Rev",        decimals: 1 },
    { key: "beta",       label: "Beta",          decimals: 2 },
  ];
  const group2 = [
    { key: "gross_margin",  label: "Gross Margin %",  decimals: 1 },
    { key: "ebitda_margin", label: "EBITDA Margin %", decimals: 1 },
    { key: "net_margin",    label: "Net Margin %",    decimals: 1 },
    { key: "rev_growth",    label: "Rev Growth %",    decimals: 1 },
    { key: "roe",           label: "ROE %",           decimals: 1 },
  ];

  function buildTable(cols) {
    const compOnly = compInfos;
    const colStats = {};
    for (const col of cols) {
      const vals = compOnly.map(d => d[col.key]).filter(v => v !== null && v !== undefined).map(Number);
      colStats[col.key] = { max: vals.length ? Math.max(...vals) : null, min: vals.length ? Math.min(...vals) : null };
    }

    const headerHtml = cols.map(c => `<th>${c.label}</th>`).join("");

    const rowsHtml = universe.map(d => {
      const isSub  = d.ticker === subject.ticker;
      const rowCls = isSub ? "subject-row" : "";
      let cells    = `<td class="${isSub ? "row-hl" : ""}">${d.ticker}</td>`;
      for (const col of cols) {
        const v = d[col.key];
        if (v === null || v === undefined) { cells += `<td>—</td>`; continue; }
        const fv  = parseFloat(v);
        let cls   = isSub ? "bright" : "";
        if (!isSub && colStats[col.key].max !== null) {
          if (fv === colStats[col.key].max && fv !== colStats[col.key].min) cls = "pos";
          if (fv === colStats[col.key].min && fv !== colStats[col.key].max) cls = "neg";
        }
        cells += `<td class="${cls}">${fv.toFixed(col.decimals)}</td>`;
      }
      return `<tr class="${rowCls}">${cells}</tr>`;
    }).join("");

    const statRowsHtml = ["Median", "Mean"].map(stat => {
      let cells = `<td class="row-hl">${stat}</td>`;
      for (const col of cols) {
        const vals = compInfos.map(d => d[col.key]).filter(v => v !== null && v !== undefined).map(parseFloat);
        if (!vals.length) { cells += `<td>—</td>`; continue; }
        const v = stat === "Median"
          ? vals.slice().sort((a, b) => a - b)[Math.floor(vals.length / 2)]
          : vals.reduce((a, b) => a + b, 0) / vals.length;
        cells += `<td style="color:var(--dim);font-weight:500;">${v.toFixed(col.decimals)}</td>`;
      }
      return `<tr class="stat-row">${cells}</tr>`;
    }).join("");

    return `
      <div class="fin-table-wrap">
        <table class="fin-table">
          <thead><tr><th>Ticker</th>${headerHtml}</tr></thead>
          <tbody>${rowsHtml}${statRowsHtml}</tbody>
        </table>
      </div>`;
  }

  el.innerHTML = `
    <div class="section-title">Valuation & Market Data</div>
    ${buildTable(group1)}
    <div class="section-title">Margins & Growth</div>
    ${buildTable(group2)}
  `;
}

// ── TAB 2: Valuation charts ───────────────────────────────────────────────────
function renderValuationTab(el) {
  const universe = [subject, ...compInfos];

  const multMetrics = [
    { label: "P/E",             key: "pe",            suffix: "x" },
    { label: "EV/EBITDA",       key: "ev_ebitda",     suffix: "x" },
    { label: "P/S",             key: "ps",            suffix: "x" },
    { label: "P/B",             key: "pb",            suffix: "x" },
    { label: "EV/Revenue",      key: "ev_rev",        suffix: "x" },
    { label: "Gross Margin %",  key: "gross_margin",  suffix: "%" },
    { label: "Rev Growth %",    key: "rev_growth",    suffix: "%" },
    { label: "EBITDA Margin %", key: "ebitda_margin", suffix: "%" },
  ];

  // Build container HTML first
  let gridHtml = '<div class="section-title">Multiples Comparison</div>';
  for (let i = 0; i < multMetrics.length; i += 2) {
    const pair = multMetrics.slice(i, i + 2);
    gridHtml += `<div class="chart-grid">
      ${pair.map((_, ci) => `<div class="chart-card" id="val-chart-${i + ci}" style="min-height:260px;"></div>`).join("")}
    </div>`;
  }
  gridHtml += `
    <div class="section-title">Growth vs. Gross Margin</div>
    <div class="chart-grid single"><div class="chart-card" id="scatter-chart" style="min-height:380px;"></div></div>
  `;

  el.innerHTML = gridHtml;

  // Defer Plotly calls so the DOM is painted
  setTimeout(() => {
    multMetrics.forEach((m, idx) => {
      const containerId = `val-chart-${idx}`;
      const container = document.getElementById(containerId);
      if (!container) return;

      const chartData = universe
        .filter(d => d[m.key] !== null && d[m.key] !== undefined)
        .map(d => ({ ticker: d.ticker, val: parseFloat(d[m.key]) }))
        .sort((a, b) => a.val - b.val);

      if (!chartData.length) {
        container.innerHTML = `<div class="loading-placeholder">No data for ${m.label}</div>`;
        return;
      }

      const tickers   = chartData.map(d => d.ticker);
      const vals      = chartData.map(d => d.val);
      const barColors = chartData.map(d =>
        d.ticker === subject.ticker ? "#E0E0E0" : COLORS[tickers.indexOf(d.ticker) % COLORS.length]
      );
      const sorted = vals.slice().sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)];
      const vMin   = sorted[0];
      const vMax   = sorted[sorted.length - 1];
      const vRange = vMax !== vMin ? vMax - vMin : Math.abs(vMax) * 0.5 || 1;

      const layout = {
        ...baseLayout("", "", {}),
        height: 260,
        margin: { t: 36, r: 12, b: 40, l: 42 },
        title: { text: m.label, font: { family: "monospace", size: 13, color: "#E0E0E0" }, x: 0.01 },
        xaxis: { showgrid: false, tickfont: { size: 9, color: C.tick }, linecolor: C.grid },
        yaxis: {
          gridcolor: C.grid, linecolor: C.grid,
          tickfont: { size: 9, color: C.tick },
          range: [vMin - vRange * 0.15, vMax + vRange * 0.42],
          showgrid: true,
        },
        showlegend: true,
        legend: {
          bgcolor: "rgba(0,0,0,0)", borderwidth: 0,
          font: { size: 9, color: C.tick },
          orientation: "h", yanchor: "bottom", y: 1.02, xanchor: "right", x: 1,
        },
        shapes: [{
          type: "line", xref: "paper", x0: 0, x1: 1,
          yref: "y", y0: median, y1: median,
          line: { color: "rgba(255,255,255,0.50)", width: 1.2, dash: "dot" },
        }],
        paper_bgcolor: C.surface,
        plot_bgcolor:  C.surface,
      };

      Plotly.newPlot(containerId, [
        {
          type: "bar", x: tickers, y: vals,
          marker: { color: barColors, line: { width: 0 } },
          text: vals.map(v => `${v.toFixed(1)}${m.suffix}`),
          textposition: "outside",
          textfont: { size: 9, color: "#AAAAAA", family: "monospace" },
          showlegend: false,
          hovertemplate: `<b>%{x}</b><br>%{y:.2f}${m.suffix}<extra></extra>`,
        },
        {
          type: "scatter", x: [null], y: [null], mode: "lines",
          name: `Median ${median.toFixed(1)}${m.suffix}`,
          line: { color: "rgba(255,255,255,0.50)", width: 1.2, dash: "dot" },
        },
      ], layout, { responsive: true, displayModeBar: false });
    });

    // Scatter
    const scatterRows = universe.filter(d =>
      d.rev_growth  !== null && d.rev_growth  !== undefined &&
      d.gross_margin !== null && d.gross_margin !== undefined
    );

    const scContainer = document.getElementById("scatter-chart");
    if (!scContainer) return;

    if (scatterRows.length >= 2) {
      const scTraces = scatterRows.map(d => ({
        type: "scatter",
        x: [d.rev_growth], y: [d.gross_margin],
        mode: "markers+text",
        marker: {
          size: Math.max(10, Math.min(50, Math.pow(d.market_cap || 5, 0.45) * 3)),
          color: d.ticker === subject.ticker ? "#E0E0E0" : C.green,
          line: { width: 1, color: "#2A2A2A" }, opacity: 0.85,
        },
        text: [d.ticker], textposition: "top center",
        textfont: { size: 10, color: "#CCCCCC", family: "monospace" },
        showlegend: false,
        hovertemplate: `<b>${d.ticker}</b><br>Rev Growth: %{x:.1f}%<br>Gross Margin: %{y:.1f}%<extra></extra>`,
      }));

      const scLayout = {
        ...baseLayout("", "", {}),
        height: 380,
        margin: { t: 20, r: 20, b: 50, l: 55 },
        xaxis: {
          title: { text: "Revenue Growth %", font: { size: 10, color: C.tick } },
          gridcolor: C.grid, linecolor: C.grid,
          zeroline: true, zerolinecolor: "#444",
          tickfont: { size: 9, color: C.tick },
        },
        yaxis: {
          title: { text: "Gross Margin %", font: { size: 10, color: C.tick } },
          gridcolor: C.grid, linecolor: C.grid,
          tickfont: { size: 9, color: C.tick },
        },
        hovermode: "closest",
        paper_bgcolor: C.surface,
        plot_bgcolor:  C.surface,
      };

      Plotly.newPlot("scatter-chart", scTraces, scLayout, { responsive: true, displayModeBar: false });
    } else {
      scContainer.innerHTML = `<div class="loading-placeholder">Need at least 2 companies with growth & margin data</div>`;
    }
  }, 0);
}

// ── TAB 3: Price Performance ──────────────────────────────────────────────────
function renderPerformanceTab(el) {
  const universe = [subject, ...compInfos];
  const days     = PERF_PERIODS[perfPeriod];

  el.innerHTML = `
    <div class="section-title">Price Performance — ${perfPeriod}</div>
    <div class="perf-period-row">
      ${Object.keys(PERF_PERIODS).map(p =>
        `<button class="perf-period-btn ${p === perfPeriod ? "active" : ""}" onclick="setPerfPeriod('${p}')">${p}</button>`
      ).join("")}
    </div>
    <div class="chart-grid single">
      <div class="chart-card" id="perf-chart" style="min-height:380px;"></div>
    </div>
    <div class="section-title" style="margin-top:20px;">Total Returns by Period</div>
    <div id="returns-table-wrap"></div>
  `;

  setTimeout(() => {
    const cutoffMs = Date.now() - days * 86400 * 1000;
    const traces   = [];

    for (let i = 0; i < universe.length; i++) {
      const d    = universe[i];
      const hist = historyMap[d.ticker];
      if (!hist || !hist.dates || !hist.dates.length) continue;

      const fDates  = [];
      const fValues = [];
      for (let j = 0; j < hist.dates.length; j++) {
        if (new Date(hist.dates[j]).getTime() >= cutoffMs) {
          fDates.push(hist.dates[j]);
          fValues.push(hist.values[j]);
        }
      }
      if (fValues.length < 2) continue;

      const base = fValues[0];
      const norm = fValues.map(v => Math.round((v / base * 100 - 100) * 100) / 100);
      const isSub = d.ticker === subject.ticker;

      traces.push({
        type: "scatter", x: fDates, y: norm, mode: "lines", name: d.ticker,
        line: { color: isSub ? "#E8E8E8" : COLORS[i % COLORS.length], width: isSub ? 2.2 : 1.4 },
        hovertemplate: `<b>${d.ticker}</b> %{y:+.2f}%<extra></extra>`,
      });
    }

    const perfContainer = document.getElementById("perf-chart");
    if (!perfContainer) return;

    if (traces.length) {
      const layout = {
        ...baseLayout("", "", {}),
        height: 400,
        margin: { t: 20, r: 20, b: 60, l: 55 },
        xaxis: { showgrid: false, tickfont: { size: 9, color: C.tick }, linecolor: C.grid },
        yaxis: {
          gridcolor: C.grid, linecolor: C.grid,
          tickfont: { size: 9, color: C.tick },
          title: { text: "Return %", font: { size: 10, color: C.tick } },
          ticksuffix: "%", zeroline: true, zerolinecolor: "#3A3A3A", zerolinewidth: 1,
        },
        legend: {
          bgcolor: C.surface, bordercolor: C.grid, borderwidth: 1,
          font: { size: 10, color: C.tick },
          orientation: "h", yanchor: "top", y: -0.15, xanchor: "left", x: 0,
        },
        hovermode: "x",
        shapes: [{ type: "line", xref: "paper", x0: 0, x1: 1, yref: "y", y0: 0, y1: 0,
          line: { color: "#444", width: 1, dash: "dot" } }],
        paper_bgcolor: C.surface,
        plot_bgcolor:  C.surface,
      };
      Plotly.newPlot("perf-chart", traces, layout, { responsive: true, displayModeBar: false });
    } else {
      perfContainer.innerHTML = `<div class="loading-placeholder">No price history available</div>`;
    }

    // Returns table
    const retPeriods = [["1M", 30], ["3M", 91], ["6M", 182], ["1Y", 365], ["2Y", 730], ["3Y", 1095]];
    const retData    = {};

    for (const d of universe) {
      const hist = historyMap[d.ticker];
      if (!hist || !hist.dates || !hist.dates.length) continue;
      const row = {};
      for (const [lbl, dys] of retPeriods) {
        const cutMs = Date.now() - dys * 86400 * 1000;
        const fVals = [];
        for (let j = 0; j < hist.dates.length; j++) {
          if (new Date(hist.dates[j]).getTime() >= cutMs) fVals.push(hist.values[j]);
        }
        row[lbl] = fVals.length >= 2 ? (fVals[fVals.length - 1] / fVals[0] - 1) * 100 : null;
      }
      retData[d.ticker] = row;
    }

    const sorted = Object.keys(retData).sort((a, b) =>
      (retData[b]["1Y"] ?? -9999) - (retData[a]["1Y"] ?? -9999)
    );

    const retWrap = document.getElementById("returns-table-wrap");
    if (!retWrap) return;

    const headerHtml  = retPeriods.map(([l]) => `<th>${l}</th>`).join("");
    const retRowsHtml = sorted.map(t => {
      const isSub  = t === subject.ticker;
      let cells    = `<td class="${isSub ? "row-hl" : ""}">${t}</td>`;
      for (const [lbl] of retPeriods) {
        const r = retData[t][lbl];
        if (r === null || r === undefined) { cells += `<td>—</td>`; continue; }
        cells += `<td class="${r >= 0 ? "pos" : "neg"}">${r >= 0 ? "+" : ""}${r.toFixed(1)}%</td>`;
      }
      return `<tr class="${isSub ? "subject-row" : ""}">${cells}</tr>`;
    }).join("");

    retWrap.innerHTML = `
      <div style="display:flex;justify-content:center;">
        <div class="fin-table-wrap" style="max-width:560px;width:100%;">
          <table class="fin-table">
            <thead><tr><th>Ticker</th>${headerHtml}</tr></thead>
            <tbody>${retRowsHtml}</tbody>
          </table>
        </div>
      </div>`;
  }, 0);
}

function setPerfPeriod(p) {
  perfPeriod = p;
  renderPerformanceTab(document.getElementById("tab-content"));
}

// ── TAB 4: vs. Comp Median ────────────────────────────────────────────────────
function renderVsMedianTab(el) {
  const metrics = [
    { label: "P/E",        key: "pe",       suffix: "x" },
    { label: "EV/EBITDA",  key: "ev_ebitda", suffix: "x" },
    { label: "P/S",        key: "ps",       suffix: "x" },
    { label: "P/B",        key: "pb",       suffix: "x" },
    { label: "EV/Revenue", key: "ev_rev",   suffix: "x" },
  ];

  const premRows = [];
  for (const m of metrics) {
    const subVal   = subject[m.key];
    const compVals = compInfos.map(d => d[m.key]).filter(v => v !== null && v !== undefined).map(parseFloat);
    if (subVal === null || subVal === undefined || !compVals.length) continue;
    const sorted    = compVals.slice().sort((a, b) => a - b);
    const medianVal = sorted[Math.floor(sorted.length / 2)];
    const prem      = medianVal ? (parseFloat(subVal) / medianVal - 1) * 100 : null;
    premRows.push({ ...m, subVal: parseFloat(subVal), median: medianVal, premium: prem });
  }

  el.innerHTML = `
    <div class="section-title">${subject.ticker} vs. Comp Median</div>
    <div class="chart-grid single">
      <div class="chart-card" id="median-bar-chart" style="min-height:320px;"></div>
    </div>
    <div id="premium-table-wrap" style="margin-top:20px;"></div>
  `;

  setTimeout(() => {
    const barContainer = document.getElementById("median-bar-chart");
    if (!barContainer) return;

    if (!premRows.length) {
      barContainer.innerHTML = `<div class="loading-placeholder">Insufficient data for comparison</div>`;
      return;
    }

    const labels  = premRows.map(r => r.label);
    const subVals = premRows.map(r => r.subVal);
    const medVals = premRows.map(r => r.median);
    const allVals = [...subVals, ...medVals];
    const vMin    = Math.min(...allVals);
    const vMax    = Math.max(...allVals);
    const vRange  = vMax !== vMin ? vMax - vMin : Math.abs(vMax) * 0.5 || 1;

    const layout = {
      ...baseLayout("", "", {}),
      barmode: "group",
      height: 320,
      margin: { t: 24, r: 20, b: 45, l: 50 },
      xaxis: { showgrid: false, tickfont: { size: 10, color: C.tick }, linecolor: C.grid },
      yaxis: {
        gridcolor: C.grid, linecolor: C.grid,
        tickfont: { size: 10, color: C.tick },
        range: [vMin - vRange * 0.1, vMax + vRange * 0.4],
      },
      legend: {
        bgcolor: C.surface, bordercolor: C.grid, borderwidth: 1,
        font: { size: 11, color: C.tick },
      },
      paper_bgcolor: C.surface,
      plot_bgcolor:  C.surface,
    };

    Plotly.newPlot("median-bar-chart", [
      {
        type: "bar", name: subject.ticker,
        x: labels, y: subVals,
        marker: { color: "#CCCCCC", line: { width: 0 } },
        text: subVals.map(v => `${v.toFixed(1)}x`),
        textposition: "outside",
        textfont: { color: "#CCCCCC", size: 10, family: "monospace" },
      },
      {
        type: "bar", name: "Comp Median",
        x: labels, y: medVals,
        marker: { color: "#484848", line: { width: 0 } },
        text: medVals.map(v => `${v.toFixed(1)}x`),
        textposition: "outside",
        textfont: { color: "#888888", size: 10, family: "monospace" },
      },
    ], layout, { responsive: true, displayModeBar: false });

    const tableRows = premRows.filter(r => r.premium !== null).map(r => {
      const prem = r.premium;
      const dir  = prem > 0 ? "premium" : "discount";
      const cls  = prem > 0 ? "neg" : "pos";
      return `<tr>
        <td>${r.label}</td>
        <td class="bright">${r.subVal.toFixed(1)}${r.suffix}</td>
        <td>${r.median.toFixed(1)}${r.suffix}</td>
        <td class="${cls}">${Math.abs(prem).toFixed(1)}% ${dir}</td>
      </tr>`;
    }).join("");

    const tblWrap = document.getElementById("premium-table-wrap");
    if (tblWrap) {
      tblWrap.innerHTML = `
        <div style="display:flex;justify-content:center;">
          <div class="fin-table-wrap" style="max-width:520px;width:100%;">
            <table class="fin-table">
              <thead><tr>
                <th>Metric</th>
                <th>${subject.ticker}</th>
                <th>Comp Median</th>
                <th>Premium / Discount</th>
              </tr></thead>
              <tbody>${tableRows}</tbody>
            </table>
          </div>
        </div>`;
    }
  }, 0);
}

// ── Init ──────────────────────────────────────────────────────────────────────