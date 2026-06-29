(function () {
// ── Acropolis Equity Research — equity.js ─────────────────────────────────────
// Data via /yfinance/stock?symbol=X (served by server.py)
// Charts via Plotly.js (loaded before this script in index.html)

const API = "";  // same origin — server.py serves everything

// ── Colour palette (mirrors plotly-utils.js C object) ────────────────────────
const BLUE   = "#6B9EC4";
const GREEN  = "#6BAF8A";
const RED    = "#C47060";
const SILVER = "#C8C8C8";
const AMBER  = "#C4A84A";
const PURPLE = "#9B80C4";
const BG     = "#2A2A2A";
const SURF   = "#363636";
const GRID   = "#3E3E3E";
const TICK   = "#C0C0C0";
const TITLE  = "#E8E8E8";
const HOVER  = "#F2F2F2";

// ── Plotly layout factory ─────────────────────────────────────────────────────
function lay(title = "", height = 320) {
  return {
    title: { text: title.toUpperCase(), font: { family: "Inter, sans-serif", size: 13, color: TITLE },
      x: 0.01, xanchor: "left", y: 0.94, yanchor: "top", pad: { t: 0, b: 0 } },
    paper_bgcolor: SURF, plot_bgcolor: SURF,
    font: { family: "Inter, sans-serif", size: 11, color: TICK },
    xaxis: { gridcolor: GRID, showgrid: false, tickfont: { size: 11, color: TICK }, linecolor: GRID },
    yaxis: { gridcolor: GRID, showgrid: true,  tickfont: { size: 11, color: TICK }, zeroline: false, linecolor: GRID },
    height, margin: { l: 60, r: 16, t: 80, b: 44 },
    legend: { bgcolor: "rgba(0,0,0,0)", font: { size: 11, color: TICK },
      orientation: "h", yanchor: "bottom", y: 1.08, xanchor: "left", x: 0 },
    hoverlabel: { bgcolor: SURF, bordercolor: GRID, font: { family: "Inter, sans-serif", size: 11, color: HOVER } },
  };
}

function cfg() { return { displayModeBar: false, responsive: true }; }

function plot(el, traces, layout) {
  if (!el) return;
  el.innerHTML = "";
  Plotly.newPlot(el, traces, layout, cfg());
}

// ── Number formatters ─────────────────────────────────────────────────────────
function fmtBig(v) {
  if (v == null || isNaN(v)) return "—";
  const a = Math.abs(v);
  if (a >= 1e12) return `$${(v/1e12).toFixed(2)}T`;
  if (a >= 1e9)  return `$${(v/1e9).toFixed(2)}B`;
  if (a >= 1e6)  return `$${(v/1e6).toFixed(2)}M`;
  return `$${v.toLocaleString()}`;
}
function fmtPct(v) {
  if (v == null || isNaN(v)) return "—";
  return `${(v * 100).toFixed(2)}%`;
}
function fmtN(v, dp = 2) {
  if (v == null || isNaN(v)) return "—";
  return parseFloat(v).toFixed(dp);
}
function fmtPrice(v) {
  if (v == null || isNaN(v)) return "—";
  return `$${parseFloat(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ── Chart helpers ─────────────────────────────────────────────────────────────
function barTrace(x, y, name, color, htpl, extra = {}) {
  return { x, y, name, type: "bar", marker: { color, opacity: 0.88, line: { width: 0 } },
    hovertemplate: htpl + "<extra></extra>", ...extra };
}

function signedBarTrace(x, y, name, htpl) {
  return { x, y, name, type: "bar",
    marker: { color: y.map(v => (v != null && !isNaN(v) && v >= 0) ? GREEN : RED), opacity: 0.88, line: { width: 0 } },
    hovertemplate: htpl + "<extra></extra>" };
}

function cleanSeries(yr, ...series) {
  // Treat null/undefined series as all-null arrays
  const safe = series.map(s => (s && s.length) ? s : Array(yr.length).fill(null));
  const n = Math.min(yr.length, ...safe.map(s => s.length));
  const keep = [];
  for (let i = 0; i < n; i++) {
    if (safe.some(s => s[i] != null && !isNaN(s[i]))) keep.push(i);
  }
  return [keep.map(i => yr[i]), ...safe.map(s => keep.map(i => {
    const v = parseFloat(s[i]);
    return isNaN(v) ? null : v;
  }))];
}

// ── State ─────────────────────────────────────────────────────────────────────
let currentTab   = "charts";
let currentPeriod = "3Y";
let stockData    = null;
let currentSym   = "";

// ── Entry point ───────────────────────────────────────────────────────────────
window.loadStock = function () {
  const sym = document.getElementById("ticker-input").value.trim().toUpperCase();
  if (!sym) return;
  currentSym = sym;
  document.getElementById("search-state").style.display = "none";
  const state = document.getElementById("stock-state");
  state.style.display = "block";
  state.innerHTML = `<div class="loading-placeholder" style="min-height:300px;">
    <span class="spinner"></span> Fetching ${sym}...</div>`;

  fetch(`${API}/yfinance/stock?symbol=${encodeURIComponent(sym)}`)
    .then(r => r.json())
    .then(data => {
      if (data.error) throw new Error(data.error);
      stockData = data;
      renderStock();
    })
    .catch(e => {
      state.innerHTML = `<div class="error-box">Could not load ${sym}: ${e.message}</div>
        <div style="margin-top:12px;">
          <button onclick="showSearch()" style="font-family:var(--sans);font-size:0.8rem;
          background:var(--surface2);border:1px solid var(--border2);color:var(--dim);
          padding:7px 16px;cursor:pointer;">← Back to search</button>
        </div>`;
    });
};

window.showSearch = function () {
  document.getElementById("stock-state").style.display = "none";
  document.getElementById("search-state").style.display = "block";
  document.getElementById("ticker-input").value = "";
};

window.closeModal = function () {
  document.getElementById("event-modal-overlay").classList.remove("open");
};

// ── Main render ───────────────────────────────────────────────────────────────
function renderStock() {
  const d    = stockData;
  const info = d.info || {};
  const sym  = currentSym;

  const name     = info.longName     || sym;
  const sector   = info.sector       || "";
  const industry = info.industry     || "";
  const exchange = info.exchange     || "";
  const price    = info.currentPrice || info.regularMarketPrice;
  const summary  = info.longBusinessSummary || "";

  const state = document.getElementById("stock-state");
  state.innerHTML = `
    <div style="margin-bottom:16px;">
      <div style="margin-bottom:8px;">
        <button onclick="showSearch()" style="font-family:var(--sans);font-size:0.82rem;
          background:none;border:1px solid var(--border);color:var(--muted);
          padding:6px 16px;cursor:pointer;transition:color 0.12s;letter-spacing:0.04em;"
          onmouseover="this.style.color='var(--bright)'" onmouseout="this.style.color='var(--muted)'">
          ← Back
        </button>
      </div>
      <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
        <div style="font-family:'Times New Roman MT','Times New Roman',Times,serif;
          font-size:1.8rem;font-weight:400;color:var(--white);line-height:1.15;">${name}</div>
        <div style="font-family:var(--sans);font-size:0.7rem;font-weight:600;
          letter-spacing:0.14em;color:var(--dim);text-transform:uppercase;border:1px solid var(--border2);
          padding:4px 10px;background:var(--surface);flex-shrink:0;align-self:center;">${sym}</div>
      </div>
      <div style="font-family:var(--sans);font-size:0.75rem;color:var(--muted);margin-top:4px;letter-spacing:0.02em;">
        ${[exchange, sector, industry].filter(Boolean).join(" · ")}
      </div>
    </div>

    ${summary ? renderSummary(summary) : ""}

    <div id="kpi-strip-wrap"></div>

    <div style="border-bottom:1px solid var(--grid);margin:16px 0 0;">
      <div style="display:flex;gap:0;">
        ${["charts","news","estimates","income","balance","cashflow"]
          .map(t => `<button class="eq-tab${t===currentTab?" eq-tab-active":""}" data-tab="${t}"
            onclick="switchTab('${t}')">${tabLabel(t)}</button>`).join("")}
      </div>
    </div>

    <div id="tab-content" style="padding-top:16px;"></div>

    <div id="footer" class="footer">
      Acropolis Equity Research &nbsp;·&nbsp; Data via Yahoo Finance &nbsp;·&nbsp; For informational purposes only
    </div>`;

  // Inject tab styles
  if (!document.getElementById("eq-tab-styles")) {
    const s = document.createElement("style");
    s.id = "eq-tab-styles";
    s.textContent = `
      .eq-tab { font-family:var(--sans);font-size:0.78rem;font-weight:500;letter-spacing:0.04em;
        text-transform:none;color:var(--muted);background:none;border:none;border-bottom:2px solid transparent;
        padding:10px 16px;cursor:pointer;transition:color 0.12s;margin-bottom:-1px; }
      .eq-tab:hover { color:var(--dim); }
      .eq-tab-active { color:var(--bright);border-bottom-color:var(--dim); }
    `;
    document.head.appendChild(s);
  }

  renderKPIs(info);
  switchTab(currentTab);
}

function tabLabel(t) {
  return { charts:"Charts", news:"News", estimates:"Estimates",
    income:"Income", balance:"Balance Sheet", cashflow:"Cash Flow" }[t] || t;
}

window.switchTab = function(tab) {
  currentTab = tab;
  document.querySelectorAll(".eq-tab").forEach(el => {
    el.classList.toggle("eq-tab-active", el.dataset.tab === tab);
  });
  const content = document.getElementById("tab-content");
  if (!content) return;
  switch (tab) {
    case "charts":    renderCharts(content); break;
    case "news":      renderNews(content); break;
    case "estimates": renderEstimates(content); break;
    case "income":    renderStatement(content, "income"); break;
    case "balance":   renderStatement(content, "balance"); break;
    case "cashflow":  renderStatement(content, "cashflow"); break;
  }
};

// ── Summary toggle ────────────────────────────────────────────────────────────
function renderSummary(text) {
  const long = text.length > 500;
  return `
    <div id="summary-wrap" style="font-family:var(--sans);font-size:0.86rem;color:var(--dim);
      line-height:1.7;padding:14px 18px;background:var(--surface);border:1px solid var(--border);
      margin-bottom:14px;position:relative;">
      <div id="summary-text" style="${long ? "max-height:4.6em;overflow:hidden;" : ""}">${text}</div>
      ${long ? `<div id="summary-fade" style="height:2em;background:linear-gradient(transparent,var(--surface));
        margin-top:-2em;pointer-events:none;"></div>
        <span id="summary-btn" onclick="toggleSummary()" style="font-family:var(--sans);font-size:0.72rem;
          font-weight:500;color:var(--muted);cursor:pointer;letter-spacing:0.04em;">See more ↓</span>` : ""}
    </div>`;
}

let summaryExpanded = false;
window.toggleSummary = function() {
  summaryExpanded = !summaryExpanded;
  const t = document.getElementById("summary-text");
  const f = document.getElementById("summary-fade");
  const b = document.getElementById("summary-btn");
  if (t) t.style.maxHeight = summaryExpanded ? "" : "4.6em";
  if (t) t.style.overflow  = summaryExpanded ? "" : "hidden";
  if (f) f.style.display   = summaryExpanded ? "none" : "block";
  if (b) b.textContent     = summaryExpanded ? "See less ↑" : "See more ↓";
};

// ── KPI strip ─────────────────────────────────────────────────────────────────
function renderKPIs(info) {
  const price = info.currentPrice || info.regularMarketPrice;
  const kpis = [
    ["Price",     fmtPrice(price), true],
    ["Mkt Cap",   fmtBig(info.marketCap), false],
    ["P/E TTM",   fmtN(info.trailingPE, 1), false],
    ["Fwd P/E",   fmtN(info.forwardPE, 1), false],
    ["P/S",       fmtN(info.priceToSalesTrailing12Months), false],
    ["P/B",       fmtN(info.priceToBook), false],
    ["Div Yield", info.dividendYield != null ? `${(info.dividendYield).toFixed(2)}%` : "—", false],
    ["Beta",      fmtN(info.beta), false],
    ["ROE",       fmtPct(info.returnOnEquity), false],
    ["ROA",       fmtPct(info.returnOnAssets), false],
    ["D/E",       fmtN(info.debtToEquity), false],
    ["Free CF",   fmtBig(info.freeCashflow), false],
    ["52W High",  fmtN(info.fiftyTwoWeekHigh, 2), false],
    ["52W Low",   fmtN(info.fiftyTwoWeekLow, 2), false],
  ];
  const wrap = document.getElementById("kpi-strip-wrap");
  if (!wrap) return;
  wrap.innerHTML = `<div class="kpi-strip" style="grid-template-columns:repeat(7,1fr);">
    ${kpis.map(([lbl, val, bright]) => `
      <div class="kpi-card">
        <div class="kpi-label">${lbl}</div>
        <div class="kpi-value${bright ? " pos" : ""}">${val}</div>
      </div>`).join("")}
  </div>`;
}

// ── Charts tab ────────────────────────────────────────────────────────────────
function renderCharts(el) {
  const d = stockData;
  const inc  = d.income    || {};
  const bal  = d.balance   || {};
  const cf   = d.cashflow  || {};

  const yr     = inc.years   || [];
  const yr_bal = bal.years   || [];
  const yr_cf  = cf.years    || [];

  el.innerHTML = `
    <div id="price-chart-wrap">
      <div class="chart-card" id="chart-price" style="min-height:300px;margin-bottom:12px;">
        <div class="loading-placeholder"><span class="spinner"></span></div>
      </div>
      <div class="range-btns" style="margin-bottom:16px;justify-content:center;">
        ${["1M","3M","6M","YTD","1Y","3Y","5Y","10Y","Max"].map(p =>
          `<button class="range-btn${p===currentPeriod?" active":""}" onclick="setPeriod('${p}')">${p}</button>`
        ).join("")}
      </div>
    </div>

    <div class="section-title">Growth & Scale</div>
    <div class="chart-grid thirds">
      <div class="chart-card" id="ch-rev-ni"></div>
      <div class="chart-card" id="ch-gp"></div>
      <div class="chart-card" id="ch-oi"></div>
    </div>
    <div class="chart-grid thirds">
      <div class="chart-card" id="ch-rev-cagr"></div>
      <div class="chart-card" id="ch-ni-cagr"></div>
      <div class="chart-card" id="ch-yoy"></div>
    </div>

    <div class="section-title">Profitability & Margins</div>
    <div class="chart-grid thirds">
      <div class="chart-card" id="ch-margins"></div>
      <div class="chart-card" id="ch-ebitda"></div>
      <div class="chart-card" id="ch-ebitda-m"></div>
    </div>
    <div class="chart-grid thirds">
      <div class="chart-card" id="ch-fcf-m"></div>
      <div class="chart-card" id="ch-fcf-ps"></div>
      <div class="chart-card" id="ch-rd-pct"></div>
    </div>

    <div class="section-title">Valuation</div>
    <div class="chart-grid thirds">
      <div class="chart-card" id="ch-pe"></div>
      <div class="chart-card" id="ch-ev-ebitda"></div>
      <div class="chart-card" id="ch-ps"></div>
    </div>
    <div class="chart-grid thirds">
      <div class="chart-card" id="ch-pb"></div>
      <div class="chart-card" id="ch-fcf-yield"></div>
      <div class="chart-card" id="ch-eps"></div>
    </div>

    <div class="section-title">Returns & Efficiency</div>
    <div class="chart-grid thirds">
      <div class="chart-card" id="ch-roe-roa"></div>
      <div class="chart-card" id="ch-roic"></div>
      <div class="chart-card" id="ch-asset-turn"></div>
    </div>

    <div class="section-title">Cash Flow</div>
    <div class="chart-grid thirds">
      <div class="chart-card" id="ch-fcf"></div>
      <div class="chart-card" id="ch-cf-waterfall"></div>
      <div class="chart-card" id="ch-capex-pct"></div>
    </div>

    <div class="section-title">Balance Sheet & Leverage</div>
    <div class="chart-grid thirds">
      <div class="chart-card" id="ch-assets-liab"></div>
      <div class="chart-card" id="ch-cash-debt"></div>
      <div class="chart-card" id="ch-net-debt"></div>
    </div>
    <div class="chart-grid thirds">
      <div class="chart-card" id="ch-de"></div>
      <div class="chart-card" id="ch-int-cov"></div>
      <div class="chart-card" id="ch-curr-ratio"></div>
    </div>
    <div class="chart-grid thirds">
      <div class="chart-card" id="ch-work-cap"></div>
      <div class="chart-card" id="ch-ret-earn"></div>
      <div class="chart-card" id="ch-bvps"></div>
    </div>

    <div class="section-title">Shareholder Returns</div>
    <div class="chart-grid thirds">
      <div class="chart-card" id="ch-divs"></div>
      <div class="chart-card" id="ch-payout"></div>
      <div class="chart-card" id="ch-shares"></div>
    </div>

    <div class="section-title">Operating Costs</div>
    <div class="chart-grid thirds">
      <div class="chart-card" id="ch-opex"></div>
      <div class="chart-card" id="ch-rd-sga"></div>
      <div class="chart-card" id="ch-rev-ps"></div>
    </div>`;

  // Render price chart
  renderPriceChart();

  // All fundamental charts
  renderFundamentals();

  // After all charts drawn, show summary of unavailable ones
  requestAnimationFrame(renderUnavailableSummary);
}

// ── Price chart ───────────────────────────────────────────────────────────────
window.setPeriod = function(p) {
  currentPeriod = p;
  document.querySelectorAll(".range-btn").forEach(el => {
    el.classList.toggle("active", el.textContent === p);
  });
  renderPriceChart();
};

function renderPriceChart() {
  const el = document.getElementById("chart-price");
  if (!el || !stockData) return;

  const rawDates  = stockData.price_history?.dates  || [];
  const rawPrices = stockData.price_history?.values || [];
  if (!rawDates.length) { el.innerHTML = `<div class="loading-placeholder" style="color:var(--muted);">No price data</div>`; return; }

  const now = new Date(rawDates[rawDates.length - 1]);
  const p   = currentPeriod;
  let cutoff;
  if      (p === "Max") cutoff = null;
  else if (p === "YTD") cutoff = new Date(now.getFullYear(), 0, 1);
  else {
    const days = { "1M":30,"3M":91,"6M":182,"1Y":365,"3Y":1095,"5Y":1825,"10Y":3650 }[p] || 365;
    cutoff = new Date(now - days * 86400000);
  }

  const dates = [], prices = [];
  rawDates.forEach((d, i) => {
    if (!cutoff || new Date(d) >= cutoff) { dates.push(d); prices.push(rawPrices[i]); }
  });

  const ret = dates.length >= 2
    ? ((prices[prices.length-1] / prices[0] - 1) * 100).toFixed(2)
    : null;
  const info  = stockData.info || {};
  const cp    = info.currentPrice || info.regularMarketPrice;
  const retColor = ret !== null && parseFloat(ret) >= 0 ? GREEN : RED;
  const retSign  = ret !== null && parseFloat(ret) >= 0 ? "+" : "";

  const retLabel = ret !== null ? `  ${retSign}${ret}%` : "";
  const priceLabel = cp != null ? fmtPrice(cp) : "";
  const titleText = `${currentSym}${priceLabel ? "   " + priceLabel : ""}${retLabel ? "   <span style='color:${retColor}'>" + retLabel + "</span>" : ""}`;

  const l = {
    ...lay("", 300),
    xaxis: { ...lay().xaxis, showgrid: false },
    margin: { l: 60, r: 16, t: 48, b: 40 },
    annotations: [
      {
        text: `<b>${currentSym}</b>` +
              (priceLabel ? `  <span style="color:${TICK}">${priceLabel}</span>` : "") +
              (ret !== null ? `  <span style="color:${retColor}">${retSign}${ret}%  ${p}</span>` : ""),
        xref: "paper", yref: "paper", x: 0.0, y: 1.08,
        xanchor: "left", yanchor: "bottom", showarrow: false,
        font: { family: "Inter, sans-serif", size: 12, color: TITLE },
      },
    ],
  };

  plot(el, [{
    x: dates, y: prices, type:"scatter", mode:"lines", name:"Price",
    line: { color:BLUE, width:1.8 },
    fill: "tozeroy", fillcolor:"rgba(107,158,196,0.08)",
    hovertemplate: "$%{y:,.2f}<extra></extra>",
  }], l);
}

// ── Fundamental charts ────────────────────────────────────────────────────────
function renderFundamentals() {
  const d   = stockData;
  const inc = d.income   || {};
  const bal = d.balance  || {};
  const cf  = d.cashflow || {};
  const info = d.info    || {};

  const yr     = inc.years || [];
  const yr_bal = bal.years || [];
  const yr_cf  = cf.years  || [];

  // Helper: get row from a statement object
  const row = (stmt, ...keys) => {
    for (const k of keys) if (stmt[k]) return stmt[k];
    return Array(yr.length).fill(null);
  };

  const rev    = row(inc, "Total Revenue");
  const ni     = row(inc, "Net Income");
  const gp     = row(inc, "Gross Profit");
  const ebit   = row(inc, "EBIT", "Operating Income");
  const rd     = row(inc, "Research And Development");
  const sga    = row(inc, "Selling General And Administration");
  const cogs   = row(inc, "Cost Of Revenue", "Cost Of Goods Sold");
  const interest = row(inc, "Interest Expense", "Interest Expense Non Operating");
  const tax    = row(inc, "Tax Provision", "Income Tax Expense");
  const bsh    = row(inc, "Basic Average Shares", "Ordinary Shares Number");
  const dsh    = row(inc, "Diluted Average Shares");
  const beps   = row(inc, "Basic EPS", "Diluted EPS");
  const deps   = row(inc, "Diluted EPS");

  const op_cf  = row(cf, "Operating Cash Flow", "Cash Flow From Continuing Operating Activities");
  const capex  = row(cf, "Capital Expenditure");
  const inv_cf = row(cf, "Investing Cash Flow", "Cash Flow From Continuing Investing Activities");
  const fin_cf = row(cf, "Financing Cash Flow", "Cash Flow From Continuing Financing Activities");
  const da     = row(cf, "Depreciation And Amortization", "Depreciation Amortization Depletion");
  const buyback = row(cf, "Repurchase Of Capital Stock", "Common Stock Repurchase");

  const assets  = row(bal, "Total Assets");
  const liabs   = row(bal, "Total Liabilities Net Minority Interest", "Total Liabilities");
  const equity  = row(bal, "Stockholders Equity", "Common Stock Equity", "Total Equity Gross Minority Interest");
  const cash    = row(bal, "Cash And Cash Equivalents", "Cash Cash Equivalents And Short Term Investments");
  const debt    = row(bal, "Total Debt", "Long Term Debt");
  const curr_a  = row(bal, "Current Assets");
  const curr_l  = row(bal, "Current Liabilities");
  const retained = row(bal, "Retained Earnings");

  // FCF = op_cf + capex (capex is negative in yfinance)
  const fcf = op_cf.map((v, i) => (v != null && capex[i] != null) ? v + capex[i] : null);

  // EBITDA = EBIT + D&A
  const ebitda = ebit.map((v, i) => {
    if (v == null || da[i] == null) return null;
    return v + Math.abs(da[i]);
  });

  // Year-end prices from price history
  const yep = buildYearEndPrices(yr);

  const div = d.dividends || { years: [], values: [] };

  // ── Growth & Scale ─────────────────────────────────────────────────────────
  doChart("ch-rev-ni",  () => {
    const [x, r, n] = cleanSeries(yr, rev, ni);
    return [[barTrace(x, r.map(v=>v/1e9), "Revenue", BLUE, "Revenue: $%{y:.2f}B"),
             barTrace(x, n.map(v=>v/1e9), "Net Income", GREEN, "Net Income: $%{y:.2f}B")],
            {...lay("Revenue & Net Income"), barmode:"group", yaxis:{...lay().yaxis, title:{text:"USD Billions",font:{size:10,color:TICK}}}}];
  });

  doChart("ch-gp", () => {
    const [x, r, g] = cleanSeries(yr, rev, gp);
    return [[barTrace(x, r.map(v=>v/1e9), "Revenue", BLUE, "Revenue: $%{y:.2f}B"),
             barTrace(x, g.map(v=>v/1e9), "Gross Profit", GREEN, "Gross Profit: $%{y:.2f}B")],
            {...lay("Revenue & Gross Profit"), barmode:"group"}];
  });

  doChart("ch-oi", () => {
    const [x, r, o] = cleanSeries(yr, rev, ebit);
    return [[barTrace(x, r.map(v=>v/1e9), "Revenue", BLUE, "Revenue: $%{y:.2f}B"),
             barTrace(x, o.map(v=>v/1e9), "Operating Income", AMBER, "Op. Income: $%{y:.2f}B")],
            {...lay("Revenue & Operating Income"), barmode:"group"}];
  });

  doChart("ch-rev-cagr", () => {
    const [x, r] = cleanSeries(yr, rev);
    if (x.length < 2) return null;
    const cagr = cagrValues(x, r);
    const cx = x.slice(1), cv = cagr.slice(1);
    if (!cv.some(v => v != null)) return null;
    return [[barTrace(cx, cv, "Revenue CAGR", BLUE, "CAGR: %{y:.1f}%")],
            lay("Revenue CAGR (from Year 1)")];
  });

  doChart("ch-ni-cagr", () => {
    const [x, n] = cleanSeries(yr, ni);
    if (x.length < 2) return null;
    const cagr = cagrValues(x, n);
    const cx = x.slice(1), cv = cagr.slice(1);
    if (!cv.some(v => v != null)) return null;
    return [[signedBarTrace(cx, cv, "NI CAGR", "CAGR: %{y:.1f}%")],
            lay("Net Income CAGR (from Year 1)")];
  });

  doChart("ch-yoy", () => {
    if (yr.length < 2) return null;
    const [x, r, n] = cleanSeries(yr, rev, ni);
    const rg = x.slice(1).map((_, i) => r[i+1] != null && r[i] != null && r[i] !== 0 ? (r[i+1]-r[i])/Math.abs(r[i])*100 : null);
    const ng = x.slice(1).map((_, i) => n[i+1] != null && n[i] != null && n[i] !== 0 ? (n[i+1]-n[i])/Math.abs(n[i])*100 : null);
    return [[signedBarTrace(x.slice(1), rg, "Revenue Growth", "Rev Growth: %{y:.1f}%"),
             barTrace(x.slice(1), ng, "Net Income Growth", SILVER, "NI Growth: %{y:.1f}%")],
            {...lay("Year-over-Year Growth"), barmode:"group"}];
  });

  // ── Profitability ──────────────────────────────────────────────────────────
  doChart("ch-margins", () => {
    const [x, r, g, o, n] = cleanSeries(yr, rev, gp, ebit, ni);
    const gm = x.map((_,i) => r[i] ? g[i]/r[i]*100 : null);
    const om = x.map((_,i) => r[i] ? o[i]/r[i]*100 : null);
    const nm = x.map((_,i) => r[i] ? n[i]/r[i]*100 : null);
    return [[barTrace(x, gm, "Gross Margin", SILVER, "Gross: %{y:.1f}%"),
             barTrace(x, om, "Op Margin", BLUE, "Operating: %{y:.1f}%"),
             barTrace(x, nm, "Net Margin", GREEN, "Net: %{y:.1f}%")],
            {...lay("Profit Margins"), barmode:"group"}];
  });

  doChart("ch-ebitda", () => {
    const [x, e] = cleanSeries(yr, ebitda);
    return [[barTrace(x, e.map(v=>v/1e9), "EBITDA", AMBER, "EBITDA: $%{y:.2f}B")], lay("EBITDA")];
  });

  doChart("ch-ebitda-m", () => {
    const [x, e, r] = cleanSeries(yr, ebitda, rev);
    const m = x.map((_,i) => r[i] ? e[i]/r[i]*100 : null);
    return [[barTrace(x, m, "EBITDA Margin", AMBER, "EBITDA Margin: %{y:.1f}%")], lay("EBITDA Margin")];
  });

  doChart("ch-fcf-m", () => {
    const [x, f, r] = cleanSeries(yr_cf, fcf, rev);
    const m = x.map((_,i) => r[i] ? f[i]/r[i]*100 : null);
    return [[signedBarTrace(x, m, "FCF Margin", "FCF Margin: %{y:.1f}%")], lay("Free Cash Flow Margin")];
  });

  doChart("ch-fcf-ps", () => {
    const [x, f, s] = cleanSeries(yr_cf, fcf, bsh);
    const fps = x.map((_,i) => s[i] ? f[i]/s[i] : null);
    return [[signedBarTrace(x, fps, "FCF/Share", "FCF/Share: $%{y:.2f}")], lay("Free Cash Flow Per Share")];
  });

  doChart("ch-rd-pct", () => {
    const [x, r, rv] = cleanSeries(yr, rd, rev);
    if (!r.some(v => v != null)) return null;
    const pct = x.map((_,i) => rv[i] ? r[i]/rv[i]*100 : null);
    return [[barTrace(x, pct, "R&D % Rev", BLUE, "R&D: %{y:.1f}%")], lay("R&D as % of Revenue")];
  });

  // ── Valuation ──────────────────────────────────────────────────────────────
  doChart("ch-pe", () => {
    const [x, e, p] = cleanSeries(yr, deps, yep);
    const pe = x.map((_,i) => e[i] && e[i] > 0 ? p[i]/e[i] : null);
    return [[barTrace(x, pe, "P/E Ratio", BLUE, "P/E: %{y:.1f}x")], lay("Price / Earnings")];
  });

  doChart("ch-ev-ebitda", () => {
    const [x, eb, d2, c, ds] = cleanSeries(yr, ebitda, debt, cash, dsh);
    const ratio = x.map((_,i) => {
      const p = yep[yr.indexOf(x[i])];
      const mc = p != null && ds[i] != null ? p * ds[i] : null;
      if (mc == null || eb[i] == null || eb[i] === 0) return null;
      return (mc + d2[i] - c[i]) / eb[i];
    });
    return [[barTrace(x, ratio, "EV/EBITDA", PURPLE, "EV/EBITDA: %{y:.1f}x")], lay("EV / EBITDA")];
  });

  doChart("ch-ps", () => {
    const [x, r, s, p] = cleanSeries(yr, rev, bsh, yep);
    const ps = x.map((_,i) => s[i] && r[i] ? p[i]/(r[i]/s[i]) : null);
    return [[barTrace(x, ps, "P/S Ratio", SILVER, "P/S: %{y:.2f}x")], lay("Price / Sales")];
  });

  doChart("ch-pb", () => {
    const [x, e, s, p] = cleanSeries(yr, equity, bsh, yep);
    const pb = x.map((_,i) => s[i] && e[i] ? p[i]/(e[i]/s[i]) : null);
    return [[barTrace(x, pb, "P/B Ratio", GREEN, "P/B: %{y:.2f}x")], lay("Price / Book")];
  });

  doChart("ch-fcf-yield", () => {
    const [x, f, s, p] = cleanSeries(yr_cf, fcf, dsh, yep);
    const fy = x.map((_,i) => s[i] && p[i] ? f[i]/(p[i]*s[i])*100 : null);
    return [[signedBarTrace(x, fy, "FCF Yield", "FCF Yield: %{y:.1f}%")], lay("FCF Yield")];
  });

  doChart("ch-eps", () => {
    const [x, b, dd] = cleanSeries(yr, beps, deps);
    return [[barTrace(x, b, "Basic EPS", BLUE, "Basic EPS: $%{y:.2f}"),
             barTrace(x, dd, "Diluted EPS", SILVER, "Diluted EPS: $%{y:.2f}")],
            {...lay("Earnings Per Share"), barmode:"group"}];
  });

  // ── Returns & Efficiency ───────────────────────────────────────────────────
  doChart("ch-roe-roa", () => {
    const [x, n, e, a] = cleanSeries(yr, ni, equity, assets);
    const roe = x.map((_,i) => e[i] ? n[i]/e[i]*100 : null);
    const roa = x.map((_,i) => a[i] ? n[i]/a[i]*100 : null);
    return [[barTrace(x, roe, "ROE", BLUE, "ROE: %{y:.1f}%"),
             barTrace(x, roa, "ROA", GREEN, "ROA: %{y:.1f}%")],
            {...lay("Return on Equity & Assets"), barmode:"group"}];
  });

  doChart("ch-roic", () => {
    const [x, eb, e2, d2, c2, t] = cleanSeries(yr, ebit, equity, debt, cash, tax);
    const roic = x.map((_,i) => {
      const ic = e2[i] + d2[i] - c2[i];
      const tr = eb[i] && t[i] ? t[i]/eb[i] : 0.3;
      return ic ? eb[i] * (1 - tr) / ic * 100 : null;
    });
    return [[signedBarTrace(x, roic, "ROIC", "ROIC: %{y:.1f}%")], lay("Return on Invested Capital")];
  });

  doChart("ch-asset-turn", () => {
    const [x, r, a] = cleanSeries(yr, rev, assets);
    const at = x.map((_,i) => a[i] ? r[i]/a[i] : null);
    return [[barTrace(x, at, "Asset Turnover", BLUE, "Turnover: %{y:.2f}x")], lay("Asset Turnover")];
  });

  // ── Cash Flow ──────────────────────────────────────────────────────────────
  doChart("ch-fcf", () => {
    const [x, o, cx, f] = cleanSeries(yr_cf, op_cf, capex, fcf);
    return [[barTrace(x, o.map(v=>v/1e9), "Operating CF", BLUE, "Op CF: $%{y:.2f}B"),
             barTrace(x, cx.map(v=>v/1e9), "CapEx", RED, "CapEx: $%{y:.2f}B"),
             barTrace(x, f.map(v=>v/1e9), "Free Cash Flow", GREEN, "FCF: $%{y:.2f}B")],
            {...lay("Free Cash Flow"), barmode:"group"}];
  });

  doChart("ch-cf-waterfall", () => {
    const [x, o, inv, fin] = cleanSeries(yr_cf, op_cf, inv_cf, fin_cf);
    return [[barTrace(x, o.map(v=>v/1e9),   "Operating", GREEN, "Operating: $%{y:.2f}B"),
             barTrace(x, inv.map(v=>v/1e9), "Investing", RED,   "Investing: $%{y:.2f}B"),
             barTrace(x, fin.map(v=>v/1e9), "Financing", BLUE,  "Financing: $%{y:.2f}B")],
            {...lay("Cash Flow Components"), barmode:"relative"}];
  });

  doChart("ch-capex-pct", () => {
    const [x, cx, r] = cleanSeries(yr_cf, capex, rev);
    const pct = x.map((_,i) => r[i] ? Math.abs(cx[i])/r[i]*100 : null);
    return [[barTrace(x, pct, "CapEx / Rev %", BLUE, "CapEx: %{y:.1f}%")], lay("CapEx as % of Revenue")];
  });

  // ── Balance Sheet ──────────────────────────────────────────────────────────
  doChart("ch-assets-liab", () => {
    const [x, a, l, e2] = cleanSeries(yr_bal, assets, liabs, equity);
    return [[barTrace(x, a.map(v=>v/1e9),  "Assets",      BLUE,  "Assets: $%{y:.2f}B"),
             barTrace(x, l.map(v=>v/1e9),  "Liabilities", RED,   "Liabilities: $%{y:.2f}B"),
             barTrace(x, e2.map(v=>v/1e9), "Equity",      GREEN, "Equity: $%{y:.2f}B")],
            {...lay("Assets, Liabilities & Equity"), barmode:"group"}];
  });

  doChart("ch-cash-debt", () => {
    const [x, c, d2] = cleanSeries(yr_bal, cash, debt);
    return [[barTrace(x, c.map(v=>v/1e9),  "Cash", GREEN, "Cash: $%{y:.2f}B"),
             barTrace(x, d2.map(v=>v/1e9), "Debt", RED,   "Debt: $%{y:.2f}B")],
            {...lay("Cash vs. Debt"), barmode:"group"}];
  });

  doChart("ch-net-debt", () => {
    const [x, c, d2] = cleanSeries(yr_bal, cash, debt);
    const nd = x.map((_,i) => d2[i] - c[i]);
    return [[signedBarTrace(x, nd.map(v=>v/1e9), "Net Debt", "Net Debt: $%{y:.2f}B")], lay("Net Debt")];
  });

  doChart("ch-de", () => {
    const [x, d2, e2] = cleanSeries(yr_bal, debt, equity);
    const de = x.map((_,i) => e2[i] ? d2[i]/Math.abs(e2[i]) : null);
    return [[signedBarTrace(x, de, "D/E Ratio", "D/E: %{y:.2f}x")], lay("Debt-to-Equity")];
  });

  doChart("ch-int-cov", () => {
    const [x, eb, int] = cleanSeries(yr, ebit, interest);
    if (!int.some(v => v != null)) return null;
    const cov = x.map((_,i) => int[i] ? eb[i]/Math.abs(int[i]) : null);
    return [[signedBarTrace(x, cov, "Interest Coverage", "Coverage: %{y:.1f}x")], lay("Interest Coverage")];
  });

  doChart("ch-curr-ratio", () => {
    const [x, ca, cl] = cleanSeries(yr_bal, curr_a, curr_l);
    const cr = x.map((_,i) => cl[i] ? ca[i]/cl[i] : null);
    const l2 = lay("Current Ratio");
    return [[barTrace(x, cr, "Current Ratio", BLUE, "Current Ratio: %{y:.2f}x")],
            {...l2, shapes:[
              {type:"line",x0:x[0],x1:x[x.length-1],y0:1,y1:1,xref:"x",yref:"y",line:{color:RED,width:1.5,dash:"dot"}},
              {type:"line",x0:x[0],x1:x[x.length-1],y0:2,y1:2,xref:"x",yref:"y",line:{color:GREEN,width:1.5,dash:"dot"}},
            ]}];
  });

  doChart("ch-work-cap", () => {
    const [x, ca, cl] = cleanSeries(yr_bal, curr_a, curr_l);
    const wc = x.map((_,i) => (ca[i] - cl[i]) / 1e9);
    return [[signedBarTrace(x, wc, "Working Capital", "Working Capital: $%{y:.2f}B")], lay("Working Capital")];
  });

  doChart("ch-ret-earn", () => {
    const [x, re] = cleanSeries(yr_bal, retained);
    if (!re.some(v => v != null)) return null;
    return [[signedBarTrace(x, re.map(v=>v/1e9), "Retained Earnings", "Retained Earnings: $%{y:.2f}B")], lay("Retained Earnings")];
  });

  doChart("ch-bvps", () => {
    const [x, e2, s] = cleanSeries(yr, equity, bsh);
    const bv = x.map((_,i) => s[i] ? e2[i]/s[i] : null);
    return [[barTrace(x, bv, "Book Value/Share", GREEN, "BVPS: $%{y:.2f}")], lay("Book Value Per Share")];
  });

  // ── Shareholder Returns ────────────────────────────────────────────────────
  doChart("ch-divs", () => {
    if (!div.years?.length) return null;
    const [x, dv] = cleanSeries(div.years, div.values);
    return [[barTrace(x, dv, "Dividends/Share", GREEN, "DPS: $%{y:.3f}")], lay("Dividends Per Share")];
  });

  doChart("ch-payout", () => {
    if (!div.years?.length) return null;
    const [x, dv, n] = cleanSeries(div.years.map(String), div.values, ni);
    const pr = x.map((_,i) => n[i] ? dv[i]/n[i]*100 : null);
    return [[barTrace(x, pr, "Payout Ratio", AMBER, "Payout: %{y:.1f}%")], lay("Dividend Payout Ratio")];
  });

  doChart("ch-shares", () => {
    const [x, b, dd] = cleanSeries(yr, bsh, dsh);
    return [[barTrace(x, b.map(v=>v/1e6),  "Basic Shares",   BLUE,   "Basic: %{y:.0f}M"),
             barTrace(x, dd.map(v=>v/1e6), "Diluted Shares", SILVER, "Diluted: %{y:.0f}M")],
            {...lay("Shares Outstanding"), barmode:"group"}];
  });

  // ── Operating Costs ────────────────────────────────────────────────────────
  doChart("ch-opex", () => {
    const traces = [];
    const [x, cg, r2, sg, ot] = cleanSeries(yr, cogs, rd, sga, null);
    if (cg.some(v=>v!=null)) traces.push(barTrace(x, cg.map(v=>v/1e9), "COGS",       RED,   "COGS: $%{y:.2f}B"));
    if (r2.some(v=>v!=null)) traces.push(barTrace(x, r2.map(v=>v/1e9), "R&D",        BLUE,  "R&D: $%{y:.2f}B"));
    if (sg.some(v=>v!=null)) traces.push(barTrace(x, sg.map(v=>v/1e9), "SG&A",       SILVER,"SG&A: $%{y:.2f}B"));
    if (!traces.length) return null;
    return [traces, {...lay("Operating Expense Breakdown"), barmode:"stack"}];
  });

  doChart("ch-rd-sga", () => {
    const [x, r2, sg] = cleanSeries(yr, rd, sga);
    const traces = [];
    if (r2.some(v=>v!=null)) traces.push(barTrace(x, r2.map(v=>v/1e9), "R&D",  BLUE,   "R&D: $%{y:.2f}B"));
    if (sg.some(v=>v!=null)) traces.push(barTrace(x, sg.map(v=>v/1e9), "SG&A", SILVER, "SG&A: $%{y:.2f}B"));
    if (!traces.length) return null;
    return [traces, {...lay("R&D & SG&A"), barmode:"group"}];
  });

  doChart("ch-rev-ps", () => {
    const [x, r, s] = cleanSeries(yr, rev, bsh);
    const rps = x.map((_,i) => s[i] ? r[i]/s[i] : null);
    return [[barTrace(x, rps, "Revenue/Share", BLUE, "Rev/Share: $%{y:.2f}")], lay("Revenue Per Share")];
  });
}

const CHART_NAMES = {
  "ch-rev-ni":      "Revenue & Net Income",
  "ch-gp":          "Revenue & Gross Profit",
  "ch-oi":          "Revenue & Operating Income",
  "ch-rev-cagr":    "Revenue CAGR",
  "ch-ni-cagr":     "Net Income CAGR",
  "ch-yoy":         "Year-over-Year Growth",
  "ch-margins":     "Profit Margins",
  "ch-ebitda":      "EBITDA",
  "ch-ebitda-m":    "EBITDA Margin",
  "ch-fcf-m":       "Free Cash Flow Margin",
  "ch-fcf-ps":      "Free Cash Flow Per Share",
  "ch-rd-pct":      "R&D as % of Revenue",
  "ch-pe":          "Price / Earnings",
  "ch-ev-ebitda":   "EV / EBITDA",
  "ch-ps":          "Price / Sales",
  "ch-pb":          "Price / Book",
  "ch-fcf-yield":   "FCF Yield",
  "ch-eps":         "Earnings Per Share",
  "ch-roe-roa":     "Return on Equity & Assets",
  "ch-roic":        "Return on Invested Capital",
  "ch-asset-turn":  "Asset Turnover",
  "ch-fcf":         "Free Cash Flow",
  "ch-cf-waterfall":"Cash Flow Components",
  "ch-capex-pct":   "CapEx as % of Revenue",
  "ch-assets-liab": "Assets, Liabilities & Equity",
  "ch-cash-debt":   "Cash vs. Debt",
  "ch-net-debt":    "Net Debt",
  "ch-de":          "Debt-to-Equity",
  "ch-int-cov":     "Interest Coverage",
  "ch-curr-ratio":  "Current Ratio",
  "ch-work-cap":    "Working Capital",
  "ch-ret-earn":    "Retained Earnings",
  "ch-bvps":        "Book Value Per Share",
  "ch-divs":        "Dividends Per Share",
  "ch-payout":      "Dividend Payout Ratio",
  "ch-shares":      "Shares Outstanding",
  "ch-opex":        "Operating Expense Breakdown",
  "ch-rd-sga":      "R&D & SG&A",
  "ch-rev-ps":      "Revenue Per Share",
};

function doChart(id, fn) {
  const el = document.getElementById(id);
  if (!el) return;
  try {
    const result = fn();
    if (!result) {
      // Hide the card completely — no data
      el.style.display = "none";
      // Record the title from the chart-card's section for the summary
      el.dataset.unavailable = "1";
      return;
    }
    el.style.display = "";
    const [traces, layout] = result;
    // Capture chart title for the unavailable list reference
    const chartTitle = layout?.title?.text || id;
    el.dataset.chartTitle = chartTitle;
    plot(el, traces, layout);
  } catch(e) {
    el.style.display = "none";
    el.dataset.unavailable = "1";
    el.dataset.errorMsg = e.message;
  }
}

function renderUnavailableSummary() {
  const unavailable = [];
  document.querySelectorAll("[data-unavailable='1']").forEach(el => {
    // Find nearest section-title above this element
    let node = el.previousElementSibling || el.parentElement?.previousElementSibling;
    let section = "";
    // Walk up/back to find the section title
    const allSections = document.querySelectorAll(".section-title");
    allSections.forEach(s => {
      if (el.compareDocumentPosition(s) & Node.DOCUMENT_POSITION_PRECEDING) {
        section = s.textContent;
      }
    });
    const label = el.dataset.errorMsg
      ? `${el.id} (error: ${el.dataset.errorMsg})`
      : el.id;
    unavailable.push({ id: el.id, section, error: el.dataset.errorMsg || null });
  });

  if (!unavailable.length) return;

  // Group by section
  const bySection = {};
  unavailable.forEach(({ id, section, error }) => {
    const key = section || "Other";
    if (!bySection[key]) bySection[key] = [];
    bySection[key].push({ id, error });
  });

  let html = `<div class="section-title" style="margin-top:32px;">Unavailable Charts</div>
    <div style="font-family:var(--sans);font-size:0.8rem;color:var(--muted);
      background:var(--surface);border:1px solid var(--border);padding:14px 18px;line-height:2;">`;
  Object.entries(bySection).forEach(([section, items]) => {
    html += `<div style="color:var(--label);font-weight:600;margin-bottom:2px;">${section}</div>`;
    html += items.map(({ id, error }) => {
      const name = CHART_NAMES[id] || id;
      return `<span style="display:inline-block;margin:2px 8px 2px 0;padding:2px 10px;
        background:var(--surface2);border:1px solid var(--border);font-size:0.76rem;color:var(--muted);">
        ${name}${error ? ` <span style="color:var(--red);font-size:0.7rem;">⚠</span>` : ""}</span>`;
    }).join("");
    html += `<div style="margin-bottom:10px;"></div>`;
  });
  html += `</div>`;

  const tabContent = document.getElementById("tab-content");
  if (tabContent) tabContent.insertAdjacentHTML("beforeend", html);
}

function buildYearEndPrices(yrs) {
  const ph = stockData?.price_history;
  if (!ph?.dates?.length) return yrs.map(() => null);
  return yrs.map(y => {
    let best = null;
    for (let i = ph.dates.length - 1; i >= 0; i--) {
      if (ph.dates[i].startsWith(y)) { best = ph.values[i]; break; }
    }
    return best;
  });
}

function cagrValues(yrs, vals) {
  const base = vals[0];
  return vals.map((v, i) => {
    if (i === 0 || base == null || base <= 0 || v == null || v <= 0) return null;
    return (Math.pow(v / base, 1 / i) - 1) * 100;
  });
}

// ── News tab ──────────────────────────────────────────────────────────────────
function renderNews(el) {
  const news = stockData?.news || [];
  if (!news.length) {
    el.innerHTML = `<div class="info-box">No news available for this ticker.</div>`;
    return;
  }
  el.innerHTML = `<div class="section-title">Latest News</div>` +
    news.slice(0, 20).map(item => {
      const content  = item.content || {};
      const title    = content.title || item.title || "Untitled";
      const summary  = content.summary || "";
      const pubDate  = content.pubDate || item.providerPublishTime || "";
      const source   = (content.provider || {}).displayName || item.publisher || "";
      const link     = (content.canonicalUrl || content.clickThroughUrl || {}).url || item.link || "#";
      let dateStr = "";
      if (pubDate) {
        try {
          const d = typeof pubDate === "number"
            ? new Date(pubDate * 1000)
            : new Date(pubDate);
          dateStr = d.toLocaleDateString("en-US", { month:"short", day:"numeric", year:"numeric" });
        } catch {}
      }
      const meta = [source, dateStr].filter(Boolean).join(" · ");
      return `<div style="padding:14px 18px;margin-bottom:8px;background:var(--surface);
        border:1px solid var(--border);border-left:3px solid var(--border2);">
        <a href="${link}" target="_blank" style="font-family:var(--sans);font-size:0.9rem;
          font-weight:500;color:var(--dim);text-decoration:none;display:block;line-height:1.4;"
          onmouseover="this.style.color='var(--bright)'" onmouseout="this.style.color='var(--dim)'">${title}</a>
        ${summary ? `<div style="font-family:var(--sans);font-size:0.81rem;color:var(--muted);
          margin-top:5px;line-height:1.5;">${summary}</div>` : ""}
        <div style="font-family:var(--sans);font-size:0.7rem;color:#666;margin-top:8px;letter-spacing:0.02em;">${meta}</div>
      </div>`;
    }).join("");
}

// ── Estimates tab ─────────────────────────────────────────────────────────────
function renderEstimates(el) {
  const d    = stockData;
  const info = d.info || {};
  const price = info.currentPrice || info.regularMarketPrice;

  const apt = d.analyst_price_targets || {};
  const aptLow  = apt.low  || info.targetLowPrice;
  const aptMean = apt.mean || info.targetMeanPrice;
  const aptMed  = apt.median || info.targetMedianPrice;
  const aptHigh = apt.high || info.targetHighPrice;
  const aptNum  = apt.numberOfAnalysts || info.numberOfAnalystOpinions;

  function upside(t) {
    if (!t || !price) return "";
    return ` <span style="font-size:0.75rem;color:var(--muted);">(${((t/price-1)*100).toFixed(1)}%)</span>`;
  }

  const targets = [["Current", price, true], ["Low", aptLow, false], ["Median", aptMed, false],
                   ["Mean", aptMean, false], ["High", aptHigh, false]].filter(([,v])=>v!=null);

  let html = `<div class="section-title">Analyst Price Targets</div>`;
  if (targets.length) {
    html += `<div class="kpi-strip" style="grid-template-columns:repeat(${targets.length + (aptNum?1:0)},1fr);margin-bottom:24px;">
      ${targets.map(([lbl, val, bright]) => {
        const color = !bright && price ? (val >= price ? GREEN : RED) : "";
        return `<div class="kpi-card">
          <div class="kpi-label">${lbl}</div>
          <div class="kpi-value" style="${color ? `color:${color};` : ""}">
            ${fmtPrice(val)}${bright ? "" : upside(val)}</div>
        </div>`;
      }).join("")}
      ${aptNum ? `<div class="kpi-card"><div class="kpi-label">Analysts</div>
        <div class="kpi-value">${Math.round(aptNum)}</div></div>` : ""}
    </div>`;
  } else {
    html += `<div class="info-box">No price target data available.</div>`;
  }

  // Recommendations
  html += `<div class="section-title">Recommendation Trend</div>`;
  const recs = d.recommendations;
  if (recs?.length) {
    html += `<div class="fin-table-wrap"><table class="fin-table">
      <thead><tr><th style="text-align:left;">Period</th>
        <th>Strong Buy</th><th>Buy</th><th>Hold</th><th>Sell</th><th>Strong Sell</th>
      </tr></thead><tbody>
      ${recs.slice(0,8).map(r => `<tr>
        <td style="text-align:left;">${r.period}</td>
        <td style="color:${GREEN};">${r.strongBuy||0}</td>
        <td style="color:${GREEN};">${r.buy||0}</td>
        <td>${r.hold||0}</td>
        <td style="color:${RED};">${r.sell||0}</td>
        <td style="color:${RED};">${r.strongSell||0}</td>
      </tr>`).join("")}
      </tbody></table></div>`;
  } else {
    html += `<div class="info-box">No recommendation data available.</div>`;
  }

  // Earnings estimates
  html += `<div class="section-title">Earnings Estimates (EPS)</div>`;
  const ee = d.earnings_estimate;
  if (ee?.length) {
    html += `<div class="fin-table-wrap"><table class="fin-table">
      <thead><tr><th style="text-align:left;">Period</th>
        <th>Avg EPS Est.</th><th>Low</th><th>High</th><th>Analysts</th>
      </tr></thead><tbody>
      ${ee.map(r => `<tr>
        <td style="text-align:left;">${r.period}</td>
        <td>${r.avg != null ? fmtN(r.avg) : "—"}</td>
        <td>${r.low != null ? fmtN(r.low) : "—"}</td>
        <td>${r.high != null ? fmtN(r.high) : "—"}</td>
        <td>${r.numberOfAnalysts != null ? Math.round(r.numberOfAnalysts) : "—"}</td>
      </tr>`).join("")}
      </tbody></table></div>`;
  } else {
    html += `<div class="info-box">No earnings estimate data available.</div>`;
  }

  // Revenue estimates
  html += `<div class="section-title">Revenue Estimates</div>`;
  const re = d.revenue_estimate;
  if (re?.length) {
    html += `<div class="fin-table-wrap"><table class="fin-table">
      <thead><tr><th style="text-align:left;">Period</th>
        <th>Avg Rev Est.</th><th>Low</th><th>High</th><th>Analysts</th>
      </tr></thead><tbody>
      ${re.map(r => `<tr>
        <td style="text-align:left;">${r.period}</td>
        <td>${r.avg != null ? fmtBig(r.avg) : "—"}</td>
        <td>${r.low != null ? fmtBig(r.low) : "—"}</td>
        <td>${r.high != null ? fmtBig(r.high) : "—"}</td>
        <td>${r.numberOfAnalysts != null ? Math.round(r.numberOfAnalysts) : "—"}</td>
      </tr>`).join("")}
      </tbody></table></div>`;
  } else {
    html += `<div class="info-box">No revenue estimate data available.</div>`;
  }

  el.innerHTML = html;
}

// ── Financial statement tab ───────────────────────────────────────────────────
function renderStatement(el, type) {
  const d = stockData;
  const stmtMap = { income:"income", balance:"balance", cashflow:"cashflow" };
  const titles  = { income:"Income Statement", balance:"Balance Sheet", cashflow:"Cash Flow Statement" };
  const annual  = d[stmtMap[type]];
  const qKey    = type + "_q";
  const quarterly = d[qKey];

  function buildTable(stmt, label) {
    if (!stmt?.years?.length) return `<div class="info-box">${label} unavailable.</div>`;
    const yrs  = stmt.years;
    const rows = Object.entries(stmt)
      .filter(([k]) => k !== "years")
      .map(([k, vals]) => {
        const cells = yrs.map((_, i) => {
          const v = vals[i];
          if (v == null || isNaN(v)) return `<td>—</td>`;
          const abs = Math.abs(v);
          const str = abs >= 1e9 ? `${(v/1e9).toFixed(2)}B`
                    : abs >= 1e6 ? `${(v/1e6).toFixed(2)}M`
                    : v.toFixed(0);
          return `<td>${str}</td>`;
        }).join("");
        return `<tr><td style="text-align:left;font-family:var(--sans);color:var(--label);">${k}</td>${cells}</tr>`;
      }).join("");
    return `<div class="fin-table-wrap"><table class="fin-table">
      <thead><tr><th style="text-align:left;min-width:220px;">${label}</th>
        ${yrs.map(y => `<th>${y}</th>`).join("")}
      </tr></thead>
      <tbody>${rows}</tbody>
    </table></div>`;
  }

  el.innerHTML = `
    <div class="section-title">Annual ${titles[type]}</div>
    ${buildTable(annual, "Annual")}
    <div class="section-title">Quarterly ${titles[type]}</div>
    ${buildTable(quarterly, "Quarterly")}`;
}

// ── Market Movers ─────────────────────────────────────────────────────────────
fetch(`${API}/yfinance/movers`)
  .then(r => r.json())
  .then(data => {
    const wrap = document.getElementById("movers-wrap");
    if (!wrap) return;
    if (data.error) { wrap.innerHTML = `<div class="info-box">${data.error}</div>`; return; }

    function moverTable(stocks) {
      if (!stocks?.length) return `<div style="color:var(--muted);font-size:0.8rem;padding:12px;">Data unavailable.</div>`;
      return `<table style="width:100%;border-collapse:collapse;font-family:var(--sans);font-size:0.82rem;">
        <thead><tr style="border-bottom:1px solid var(--grid);">
          <th style="text-align:left;padding:6px 0;color:var(--muted);font-weight:500;font-size:0.72rem;text-transform:uppercase;letter-spacing:0.06em;width:45%;">Symbol</th>
          <th style="text-align:right;padding:6px 0;color:var(--muted);font-weight:500;font-size:0.72rem;text-transform:uppercase;letter-spacing:0.06em;">Price</th>
          <th style="text-align:right;padding:6px 0;color:var(--muted);font-weight:500;font-size:0.72rem;text-transform:uppercase;letter-spacing:0.06em;">Change</th>
          <th style="text-align:right;padding:6px 0;color:var(--muted);font-weight:500;font-size:0.72rem;text-transform:uppercase;letter-spacing:0.06em;">Mkt Cap</th>
        </tr></thead>
        <tbody>
          ${stocks.map(s => {
            const chg = s.change;
            const cc  = chg != null ? (chg >= 0 ? GREEN : RED) : "var(--dim)";
            const cs  = chg != null ? `${chg >= 0 ? "+" : ""}${chg.toFixed(2)}%` : "—";
            return `<tr style="border-bottom:1px solid var(--surface2);cursor:pointer;"
              onclick="document.getElementById('ticker-input').value='${s.symbol}';loadStock();"
              onmouseover="this.style.background='var(--surface2)'" onmouseout="this.style.background=''">
              <td style="padding:7px 0;">
                <div style="color:var(--bright);font-weight:500;">${s.symbol}</div>
                <div style="color:var(--muted);font-size:0.72rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:120px;">${s.name}</div>
              </td>
              <td style="text-align:right;padding:7px 0;">${s.price != null ? fmtPrice(s.price) : "—"}</td>
              <td style="text-align:right;padding:7px 0;color:${cc};">${cs}</td>
              <td style="text-align:right;padding:7px 0;color:var(--muted);">${fmtBig(s.mkt_cap)}</td>
            </tr>`;
          }).join("")}
        </tbody>
      </table>`;
    }

    function panel(title, stocks) {
      return `<div style="background:var(--surface);border:1px solid var(--border);padding:14px 16px;">
        <div style="font-family:var(--sans);font-size:0.8rem;font-weight:600;letter-spacing:0.06em;
          text-transform:uppercase;color:var(--bright);margin-bottom:10px;">${title}</div>
        ${moverTable(stocks)}
      </div>`;
    }

    wrap.innerHTML = `<div class="chart-grid thirds" style="margin-bottom:0;">
      ${panel("Day Gainers", data.gainers)}
      ${panel("Day Losers",  data.losers)}
      ${panel("Most Active", data.active)}
    </div>`;
  })
  .catch(() => {
    const wrap = document.getElementById("movers-wrap");
    if (wrap) wrap.innerHTML = `<div class="info-box">Could not load market data.</div>`;
  });

})();