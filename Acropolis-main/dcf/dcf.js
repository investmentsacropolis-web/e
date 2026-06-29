(function () {
// ── Acropolis DCF Model — dcf.js ─────────────────────────────────────────────
// Data via /yfinance/stock?symbol=X (server.py)
// Charts via Plotly.js

const API = "";

// ── Palette ───────────────────────────────────────────────────────────────────
const PLOT_BG  = "#2A2A2A";
const SURF_BG  = "#363636";
const GRID_CLR = "#3A3A3A";
const TEXT_CLR = "#AAAAAA";
const ACCENT   = "#CCCCCC";
const GREEN    = "#6BAF8A";
const RED      = "#C47060";
const GOLD     = "#C8A96A";
const HIST_CLR = "#484848";

// ── State ─────────────────────────────────────────────────────────────────────
let stockData = null;   // raw API response
let histDF    = null;   // processed historicals array of {year, ...}
let projInputs = null;  // current projection inputs
let pricePeriod = "3Y"; // currently selected stock-price chart timeframe

// ── Plotly base layout ────────────────────────────────────────────────────────
function basePlot(title = "", height = 320) {
  return {
    title: { text: title, font: { family: "Inter, sans-serif", size: 13, color: "#EEEEEE" },
      x: 0.01, xanchor: "left", y: 0.97, yanchor: "top" },
    paper_bgcolor: SURF_BG, plot_bgcolor: SURF_BG,
    font: { family: "Inter, sans-serif", color: TEXT_CLR, size: 11 },
    xaxis: { gridcolor: GRID_CLR, zeroline: false, tickfont: { color: TEXT_CLR }, linecolor: GRID_CLR },
    yaxis: { gridcolor: GRID_CLR, zeroline: false, tickfont: { color: TEXT_CLR }, linecolor: GRID_CLR },
    height, margin: { t: 48, b: 36, l: 60, r: 20 },
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

// ── Formatters ────────────────────────────────────────────────────────────────
function fmtB(v) {
  if (v == null || !isFinite(v)) return "N/A";
  const a = Math.abs(v);
  if (a >= 1e12) return `$${(v/1e12).toFixed(2)}T`;
  if (a >= 1e9)  return `$${(v/1e9).toFixed(2)}B`;
  if (a >= 1e6)  return `$${(v/1e6).toFixed(1)}M`;
  return `$${v.toLocaleString()}`;
}
function fmtPct(v) {
  if (v == null || !isFinite(v)) return "N/A";
  return `${(v * 100).toFixed(1)}%`;
}
function fmtPrice(v) {
  if (v == null || !isFinite(v)) return "N/A";
  return `$${parseFloat(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function clamp(v, lo, hi) {
  if (v == null || isNaN(v)) return lo;
  if (!isFinite(v)) return v > 0 ? hi : lo;
  return Math.max(lo, Math.min(hi, v));
}

// ── Data extraction (mirrors data.py extract_historicals) ─────────────────────
function extractHistoricals(d) {
  const inc = d.income    || {};
  const bal = d.balance   || {};
  const cf  = d.cashflow  || {};

  const years = (inc.years || []).slice().sort();
  if (!years.length) return [];

  function row(stmt, ...keys) {
    for (const k of keys) if (stmt[k]) return stmt[k];
    return Array(years.length).fill(null);
  }

  const rev    = row(inc, "Total Revenue");
  const gross  = row(inc, "Gross Profit");
  const ebit   = row(inc, "EBIT", "Operating Income");
  const ebitda = row(inc, "EBITDA");
  const ni     = row(inc, "Net Income");
  const da     = row(cf,  "Depreciation And Amortization", "Depreciation Amortization Depletion");
  const capex  = row(cf,  "Capital Expenditure");
  const ocf    = row(cf,  "Operating Cash Flow", "Cash Flow From Continuing Operating Activities");
  const debt   = row(bal, "Total Debt", "Long Term Debt");
  const cash   = row(bal, "Cash And Cash Equivalents", "Cash Cash Equivalents And Short Term Investments");

  return years.map((yr, i) => {
    const r  = parseFloat(rev[i])   || 0;
    const g  = parseFloat(gross[i]) || 0;
    const eb = parseFloat(ebit[i])  || 0;
    const n  = parseFloat(ni[i])    || 0;
    const o  = parseFloat(ocf[i])   || 0;
    const cx = parseFloat(capex[i]) || 0;
    const fcf = o + cx; // capex is negative
    const safeMgn = (num, denom) => (denom && Math.abs(denom) > 1 ? num / denom : null);
    return {
      year:       yr,
      revenue:    r,
      grossProfit:g,
      ebit:       eb,
      ebitda:     parseFloat(ebitda[i]) || 0,
      netIncome:  n,
      da:         parseFloat(da[i])   || 0,
      capex:      cx,
      ocf:        o,
      fcf:        fcf,
      grossMargin:safeMgn(g,  r),
      ebitMargin: safeMgn(eb, r),
      netMargin:  safeMgn(n,  r),
      fcfMargin:  safeMgn(fcf,r),
      totalDebt:  parseFloat(debt[i]) || 0,
      cash:       parseFloat(cash[i]) || 0,
    };
  });
}

// ── Default assumptions (mirrors utils.py) ────────────────────────────────────
function defaultRevGrowth(hist) {
  const revs = hist.map(r => r.revenue).filter(v => v > 0);
  if (revs.length < 2) return 5.0;
  const cagr = Math.pow(revs[revs.length-1] / revs[0], 1/(revs.length-1)) - 1;
  return clamp(parseFloat((cagr * 100).toFixed(1)), -30, 50);
}
function defaultFcfMargin(hist) {
  const margins = hist.map(r => r.fcfMargin).filter(v => v != null && isFinite(v));
  if (!margins.length) return 10.0;
  const mean = margins.reduce((a,b) => a+b, 0) / margins.length;
  return clamp(parseFloat((mean * 100).toFixed(1)), -50, 100);
}

// ── DCF engine (mirrors dcf.py run_dcf) ──────────────────────────────────────
function runDCF({ hist, projYears, wacc, terminalG, mode, projInputs, shares, totalDebt, cash, curPrice }) {
  const lastYear = hist[hist.length - 1].year;
  const years = Array.from({ length: projYears }, (_, i) => parseInt(lastYear) + i + 1);

  let fcfs, revs;
  if (mode === "revenue") {
    const lastRev = hist[hist.length - 1].revenue;
    fcfs = []; revs = [];
    let rev = lastRev;
    for (let i = 0; i < projYears; i++) {
      rev = rev * (1 + projInputs.revGrowth[i]);
      const fcf = rev * projInputs.fcfMargin[i];
      revs.push(rev); fcfs.push(fcf);
    }
  } else {
    revs = Array(projYears).fill(null);
    fcfs = projInputs.fcfValues.slice();
  }

  const effectiveWacc = Math.max(wacc, terminalG + 0.001);
  const terminalFcf = fcfs[fcfs.length - 1] * (1 + terminalG);
  const terminalVal = terminalFcf / (effectiveWacc - terminalG);

  const pvFcfs     = fcfs.map((f, i) => f / Math.pow(1 + wacc, i + 1));
  const pvTerminal = terminalVal / Math.pow(1 + wacc, projYears);

  const enterpriseValue = pvFcfs.reduce((a,b) => a+b, 0) + pvTerminal;
  const equityValue     = enterpriseValue - totalDebt + cash;
  const impliedPrice    = shares > 0 ? equityValue / shares : 0;

  // Implied WACC via bisection
  let impliedWacc = null;
  if (curPrice > 0 && shares > 0) {
    const targetEquity = curPrice * shares;
    impliedWacc = solveImpliedWacc(fcfs, terminalG, projYears, totalDebt, cash, targetEquity);
  }

  return {
    years, fcfs, revs, pvFcfs, pvTerminal, terminalVal,
    enterpriseValue, equityValue, impliedPrice,
    sumPvFcfs: pvFcfs.reduce((a,b) => a+b, 0),
    impliedWacc,
  };
}

function solveImpliedWacc(fcfs, terminalG, projYears, totalDebt, cash, targetEquity) {
  function equityAt(w) {
    const eff = Math.max(w, terminalG + 0.001);
    const tv  = fcfs[fcfs.length-1] * (1 + terminalG) / (eff - terminalG);
    const pvs = fcfs.reduce((s, f, i) => s + f / Math.pow(1+w, i+1), 0);
    return pvs + tv / Math.pow(1+w, projYears) - totalDebt + cash;
  }
  let lo = 0.001, hi = 0.50;
  try {
    if (equityAt(lo) < targetEquity) return null;
    if (equityAt(hi) > targetEquity) return null;
    for (let i = 0; i < 60; i++) {
      const mid = (lo + hi) / 2;
      equityAt(mid) > targetEquity ? (lo = mid) : (hi = mid);
    }
    return (lo + hi) / 2;
  } catch { return null; }
}

function sensitivityTable(hist, projYears, baseWacc, baseTg, mode, projInputs, shares, totalDebt, cash) {
  const waccDeltas = [-0.02, -0.01, 0.0, +0.01, +0.02];
  const tgDeltas   = [-0.01, -0.005, 0.0, +0.005, +0.01];
  const rows = waccDeltas.map(dw => {
    const w = baseWacc + dw;
    return tgDeltas.map(dg => {
      const g = baseTg + dg;
      if (w <= g) return null;
      const r = runDCF({ hist, projYears, wacc: w, terminalG: g, mode, projInputs, shares, totalDebt, cash, curPrice: 0 });
      return r.impliedPrice;
    });
  });
  return {
    waccLabels: waccDeltas.map(d => `${((baseWacc + d)*100).toFixed(2)}%`),
    tgLabels:   tgDeltas.map(d => `${((baseTg + d)*100).toFixed(2)}%`),
    rows,
  };
}

// ── Fetch ─────────────────────────────────────────────────────────────────────
window.fetchData = async function () {
  const sym = document.getElementById("dcf-ticker").value.trim().toUpperCase();
  if (!sym) return;

  const content = document.getElementById("dcf-content");
  content.innerHTML = `<div class="loading-placeholder" style="min-height:300px;"><span class="spinner"></span> Fetching ${sym}...</div>`;

  try {
    const res  = await fetch(`${API}/yfinance/stock?symbol=${encodeURIComponent(sym)}`);
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    stockData = data;
    histDF    = extractHistoricals(data);
    if (!histDF.length) throw new Error("No financial data found for this ticker.");
    projInputs = null;
    renderMain(sym);
  } catch (e) {
    content.innerHTML = `<div class="error-box">Could not load ${sym}: ${e.message}</div>`;
  }
};

// ── Main renderer ─────────────────────────────────────────────────────────────
function renderMain(sym) {
  const d    = stockData;
  const info = d.info || {};
  const hist = histDF;

  const name     = info.longName || sym;
  const sector   = info.sector || "";
  const industry = info.industry || "";
  const currency = info.currency || "USD";
  const curPrice = parseFloat(info.currentPrice || info.regularMarketPrice || 0);
  const mktCap   = parseFloat(info.marketCap || 0);
  const shares   = mktCap > 0 && curPrice > 0 ? mktCap / curPrice : parseFloat(info.sharesOutstanding || 0);

  const lastRow  = hist[hist.length - 1];
  const totalDebt = lastRow.totalDebt || 0;
  const cashVal   = lastRow.cash || 0;

  const content = document.getElementById("dcf-content");
  content.innerHTML = `
    <div style="margin-bottom:16px;">
      <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:4px;">
        <div style="font-family:'Times New Roman MT','Times New Roman',Times,serif;font-size:1.8rem;font-weight:400;color:var(--white);line-height:1.15;">${name}</div>
        <div style="font-family:var(--sans);font-size:0.7rem;font-weight:600;letter-spacing:0.14em;color:var(--dim);text-transform:uppercase;border:1px solid var(--border2);padding:4px 10px;background:var(--surface);flex-shrink:0;align-self:center;">${sym}</div>
      </div>
      <div style="font-family:var(--sans);font-size:0.75rem;color:var(--muted);letter-spacing:0.02em;">${[sector, industry, currency].filter(Boolean).join(" · ")}</div>
    </div>

    <div class="kpi-strip">
      <div class="kpi-card"><div class="kpi-label">Current Price</div><div class="kpi-value">${fmtPrice(curPrice)}</div></div>
      <div class="kpi-card"><div class="kpi-label">Market Cap</div><div class="kpi-value">${fmtB(mktCap)}</div></div>
      <div class="kpi-card"><div class="kpi-label">Revenue (LTM)</div><div class="kpi-value">${fmtB(lastRow.revenue)}</div></div>
      <div class="kpi-card"><div class="kpi-label">FCF (LTM)</div><div class="kpi-value">${fmtB(lastRow.fcf)}</div></div>
      <div class="kpi-card"><div class="kpi-label">Net Margin (LTM)</div><div class="kpi-value">${fmtPct(lastRow.netMargin)}</div></div>
    </div>

    <div class="dcf-tabs">
      <button class="dcf-tab active" data-tab="historicals" onclick="switchTab('historicals')">Historicals</button>
      <button class="dcf-tab" data-tab="projections"  onclick="switchTab('projections')">Projections</button>
      <button class="dcf-tab" data-tab="valuation"    onclick="switchTab('valuation')">Valuation</button>
      <button class="dcf-tab" data-tab="sensitivity"  onclick="switchTab('sensitivity')">Sensitivity</button>
    </div>

    <div id="tab-body" style="padding-top:20px;"></div>
  `;

  // store context on window for tab functions to access
  window._dcfCtx = { sym, hist, info, curPrice, mktCap, shares, totalDebt, cashVal };

  switchTab("historicals");
}

// ── Tab switcher ──────────────────────────────────────────────────────────────
window.switchTab = function(tab) {
  document.querySelectorAll(".dcf-tab").forEach(el =>
    el.classList.toggle("active", el.dataset.tab === tab));
  const body = document.getElementById("tab-body");
  if (!body) return;
  switch (tab) {
    case "historicals":  renderHistoricals(body); break;
    case "projections":  renderProjections(body); break;
    case "valuation":    renderValuation(body);   break;
    case "sensitivity":  renderSensitivity(body); break;
  }
};

// ── Historicals tab ───────────────────────────────────────────────────────────
function renderHistoricals(el) {
  const { sym, hist } = window._dcfCtx;

  el.innerHTML = `
    <div class="chart-grid">
      <div class="chart-card" id="ch-rev-fcf" style="min-height:280px;"><div class="loading-placeholder"><span class="spinner"></span></div></div>
      <div class="chart-card" id="ch-margins" style="min-height:280px;"><div class="loading-placeholder"><span class="spinner"></span></div></div>
    </div>

    <div id="price-chart-wrap">
      <div class="chart-card" id="ch-price" style="min-height:300px;margin-bottom:12px;"><div class="loading-placeholder"><span class="spinner"></span></div></div>
      <div class="range-btns" style="margin-bottom:16px;justify-content:center;">
        ${["1M","3M","6M","YTD","1Y","3Y","5Y","10Y","Max"].map(p =>
          `<button class="range-btn${p===pricePeriod?" active":""}" onclick="setDcfPeriod('${p}')">${p}</button>`
        ).join("")}
      </div>
    </div>

    <div class="section-title">Historical Financials</div>
    <div class="fin-table-wrap">
      <table class="fin-table">
        <thead><tr>
          <th style="text-align:left;">Metric</th>
          ${hist.map(r => `<th>${r.year}</th>`).join("")}
        </tr></thead>
        <tbody>${buildHistTable(hist)}</tbody>
      </table>
    </div>`;

  // Revenue & FCF bar chart
  plot(document.getElementById("ch-rev-fcf"), [
    { x: hist.map(r => String(r.year)), y: hist.map(r => r.revenue/1e9), name: "Revenue",
      type: "bar", marker: { color: ACCENT, opacity: 0.85 } },
    { x: hist.map(r => String(r.year)), y: hist.map(r => r.fcf/1e9), name: "FCF",
      type: "bar", marker: { color: GREEN, opacity: 0.85 } },
  ], { ...basePlot("Revenue & FCF (USD Billions)"), barmode: "group" });

  // Margin trends
  plot(document.getElementById("ch-margins"), [
    { x: hist.map(r => String(r.year)), y: hist.map(r => (r.grossMargin||0)*100), name: "Gross Margin",
      type: "scatter", mode: "lines+markers", line: { color: ACCENT, width: 2 } },
    { x: hist.map(r => String(r.year)), y: hist.map(r => (r.ebitMargin||0)*100), name: "EBIT Margin",
      type: "scatter", mode: "lines+markers", line: { color: GREEN, width: 2 } },
    { x: hist.map(r => String(r.year)), y: hist.map(r => (r.fcfMargin||0)*100), name: "FCF Margin",
      type: "scatter", mode: "lines+markers", line: { color: GOLD, width: 2 } },
  ], { ...basePlot("Margin Trends (%)"), yaxis: { ...basePlot().yaxis, ticksuffix: "%" } });

  renderPriceChart();
}

// ── Stock price chart with timeframe selector (mirrors equity-research) ───────
window.setDcfPeriod = function (p) {
  pricePeriod = p;
  document.querySelectorAll("#price-chart-wrap .range-btn").forEach(el => {
    el.classList.toggle("active", el.textContent === p);
  });
  renderPriceChart();
};

function renderPriceChart() {
  const priceEl = document.getElementById("ch-price");
  if (!priceEl || !stockData) return;

  const rawDates  = stockData.price_history?.dates  || [];
  const rawPrices = stockData.price_history?.values || [];
  if (!rawDates.length) {
    priceEl.innerHTML = `<div class="loading-placeholder" style="color:var(--muted);">No price data</div>`;
    return;
  }

  // Server always returns max-range history; slice client-side to the
  // selected timeframe so the title and % move always match what's plotted.
  const now = new Date(rawDates[rawDates.length - 1]);
  const p   = pricePeriod;
  let cutoff;
  if      (p === "Max") cutoff = null;
  else if (p === "YTD") cutoff = new Date(now.getFullYear(), 0, 1);
  else {
    const days = { "1M":30, "3M":91, "6M":182, "1Y":365, "3Y":1095, "5Y":1825, "10Y":3650 }[p] || 1095;
    cutoff = new Date(now - days * 86400000);
  }

  const dates = [], prices = [];
  rawDates.forEach((d, i) => {
    if (!cutoff || new Date(d) >= cutoff) { dates.push(d); prices.push(rawPrices[i]); }
  });

  const ret = dates.length >= 2 ? ((prices[prices.length - 1] / prices[0] - 1) * 100) : null;
  const { sym, curPrice } = window._dcfCtx;
  const retColor = ret != null && ret >= 0 ? GREEN : RED;
  const retSign  = ret != null && ret >= 0 ? "+" : "";

  const priceLayout = {
    ...basePlot("", 300),
    xaxis: { ...basePlot().xaxis, showgrid: false },
    margin: { l: 60, r: 18, t: 52, b: 36 },
    annotations: [{
      text: `<b>${sym} STOCK PRICE</b>`,
      xref: "paper", yref: "paper", x: 0, y: 1.12,
      xanchor: "left", yanchor: "bottom", showarrow: false,
      font: { family: "Inter, sans-serif", size: 12, color: ACCENT },
    }, {
      text: fmtPrice(curPrice),
      xref: "paper", yref: "paper", x: 0, y: 1.12,
      xanchor: "left", yanchor: "top", showarrow: false,
      font: { family: "Inter, sans-serif", size: 12, color: TEXT_CLR },
    }, ...(ret != null ? [{
      text: `${p} ${retSign}${ret.toFixed(2)}%`,
      xref: "paper", yref: "paper", x: 0, y: 1.12, xshift: 90,
      xanchor: "left", yanchor: "top", showarrow: false,
      font: { family: "Inter, sans-serif", size: 12, color: retColor },
    }] : [])],
  };

  plot(priceEl, [{
    x: dates, y: prices, type: "scatter", mode: "lines", name: "Price",
    line: { color: "#6B9EC4", width: 1.8 },
    fill: "tozeroy", fillcolor: "rgba(107,158,196,0.08)",
    hovertemplate: "$%{y:,.2f}<extra></extra>",
  }], priceLayout);
}

function buildHistTable(hist) {
  const metrics = [
    { key: "revenue",    label: "Revenue",     hl: true,  signed: true  },
    { key: "grossProfit",label: "Gross Profit", hl: true,  signed: true  },
    { key: "ebit",       label: "EBIT",         hl: false, signed: true  },
    { key: "ebitda",     label: "EBITDA",       hl: false, signed: false },
    { key: "netIncome",  label: "Net Income",   hl: true,  signed: true  },
    { key: "fcf",        label: "FCF",          hl: true,  signed: true  },
    { key: "capex",      label: "CapEx",        hl: false, signed: false },
  ];
  return metrics.map(m => {
    const cls = m.hl ? " class='row-hl'" : "";
    const tds = hist.map(r => {
      const v = r[m.key];
      const str = (v != null && isFinite(v)) ? fmtB(v) : "N/A";
      const cc  = m.signed && v != null && isFinite(v) ? (v >= 0 ? " class='pos'" : " class='neg'") : "";
      return `<td${cc}>${str}</td>`;
    }).join("");
    return `<tr${cls}><td>${m.label}</td>${tds}</tr>`;
  }).join("");
}

// ── Projections tab ───────────────────────────────────────────────────────────
function renderProjections(el) {
  const { hist, cashVal, totalDebt, shares, curPrice } = window._dcfCtx;
  const projYears = clamp(parseInt(document.getElementById("proj-years").value) || 5, 1, 10);
  const mode      = document.getElementById("proj-mode").value;
  const lastYear  = hist[hist.length - 1].year;
  const years     = Array.from({ length: projYears }, (_, i) => parseInt(lastYear) + i + 1);

  const defRevG  = defaultRevGrowth(hist);
  const defFcfM  = defaultFcfMargin(hist);
  const lastFcfM = hist[hist.length - 1].fcf / 1e6;

  el.innerHTML = `
    <div class="section-title">Projection Assumptions</div>
    <div id="proj-table-wrap"></div>
    <button id="run-dcf-btn" onclick="runAndPreview()">Run DCF →</button>
    <div id="proj-preview"></div>`;

  const wrap = document.getElementById("proj-table-wrap");

  if (mode === "revenue") {
    wrap.innerHTML = `
      <div class="proj-grid">
        <div class="proj-row">
          <div class="proj-cell label-col header">Metric</div>
          ${years.map(y => `<div class="proj-cell header">${y}</div>`).join("")}
        </div>
        <div class="proj-row" id="proj-row-rg">
          <div class="proj-cell label-col" style="display:flex;align-items:center;font-size:0.78rem;color:var(--label);">Rev Growth (%)</div>
          ${years.map((y, i) => `<div class="proj-cell"><input class="proj-input" id="rg-${i}" type="number" value="${defRevG}" step="0.1" /></div>`).join("")}
        </div>
        <div class="proj-row" id="proj-row-fm">
          <div class="proj-cell label-col" style="display:flex;align-items:center;font-size:0.78rem;color:var(--label);">FCF Margin (%)</div>
          ${years.map((y, i) => `<div class="proj-cell"><input class="proj-input" id="fm-${i}" type="number" value="${defFcfM}" step="0.1" /></div>`).join("")}
        </div>
      </div>`;
  } else {
    const defaultFcfs = years.map((_, i) => {
      const v = (isFinite(lastFcfM) ? lastFcfM : 0) * Math.pow(1.05, i + 1);
      return clamp(parseFloat(v.toFixed(1)), -1e6, 1e6);
    });
    wrap.innerHTML = `
      <div class="proj-grid">
        <div class="proj-row">
          <div class="proj-cell label-col header">Metric</div>
          ${years.map(y => `<div class="proj-cell header">${y}</div>`).join("")}
        </div>
        <div class="proj-row">
          <div class="proj-cell label-col" style="display:flex;align-items:center;font-size:0.78rem;color:var(--label);">FCF ($M)</div>
          ${years.map((y, i) => `<div class="proj-cell"><input class="proj-input" id="fcf-${i}" type="number" value="${defaultFcfs[i]}" step="1" /></div>`).join("")}
        </div>
      </div>`;
  }
}

window.runAndPreview = function() {
  const { hist, cashVal, totalDebt, shares, curPrice } = window._dcfCtx;
  const projYears = clamp(parseInt(document.getElementById("proj-years").value) || 5, 1, 10);
  const wacc      = clamp(parseFloat(document.getElementById("wacc").value) || 10, 1, 30) / 100;
  const terminalG = clamp(parseFloat(document.getElementById("terminal-g").value) || 2.5, 0, 8) / 100;
  const mode      = document.getElementById("proj-mode").value;

  let inputs;
  if (mode === "revenue") {
    inputs = {
      revGrowth:  Array.from({ length: projYears }, (_, i) => clamp(parseFloat(document.getElementById(`rg-${i}`)?.value) || 0, -50, 100) / 100),
      fcfMargin:  Array.from({ length: projYears }, (_, i) => clamp(parseFloat(document.getElementById(`fm-${i}`)?.value) || 0, -50, 100) / 100),
    };
  } else {
    inputs = {
      fcfValues: Array.from({ length: projYears }, (_, i) => clamp(parseFloat(document.getElementById(`fcf-${i}`)?.value) || 0, -1e6, 1e6) * 1e6),
    };
  }
  projInputs = inputs;

  // Preview projected FCF chart
  const result = runDCF({ hist, projYears, wacc, terminalG, mode, projInputs: inputs, shares, totalDebt, cash: cashVal, curPrice });
  const preview = document.getElementById("proj-preview");
  preview.innerHTML = `
    <div class="section-title">Projected FCF Preview</div>
    <div class="chart-card" id="ch-proj-fcf" style="min-height:280px;margin-bottom:16px;"></div>`;

  plot(document.getElementById("ch-proj-fcf"), [
    { x: hist.map(r => String(r.year)), y: hist.map(r => r.fcf/1e9),
      name: "Historical FCF", type: "bar", marker: { color: HIST_CLR } },
    { x: result.years.map(String), y: result.fcfs.map(f => f/1e9),
      name: "Projected FCF", type: "bar", marker: { color: ACCENT, opacity: 0.85 } },
  ], { ...basePlot("Free Cash Flow — Historical & Projected (USD Billions)"), barmode: "group" });
};

// ── Valuation tab ─────────────────────────────────────────────────────────────
function renderValuation(el) {
  if (!projInputs) {
    el.innerHTML = `<div class="info-box">Fill in the Projections tab first.</div>`;
    return;
  }
  const { hist, cashVal, totalDebt, shares, curPrice } = window._dcfCtx;
  const projYears = clamp(parseInt(document.getElementById("proj-years").value) || 5, 1, 10);
  const wacc      = clamp(parseFloat(document.getElementById("wacc").value) || 10, 1, 30) / 100;
  const terminalG = clamp(parseFloat(document.getElementById("terminal-g").value) || 2.5, 0, 8) / 100;
  const mode      = document.getElementById("proj-mode").value;

  let result;
  try {
    result = runDCF({ hist, projYears, wacc, terminalG, mode, projInputs, shares, totalDebt, cash: cashVal, curPrice });
  } catch(e) {
    el.innerHTML = `<div class="error-box">DCF error: ${e.message}</div>`;
    return;
  }

  const implied  = result.impliedPrice;
  const upside   = curPrice > 0 ? (implied / curPrice - 1) : 0;
  const upLabel  = upside >= 0 ? `+${(upside*100).toFixed(1)}%` : `${(upside*100).toFixed(1)}%`;
  const upCls    = upside >= 0 ? "pos" : "neg";
  const iwStr    = result.impliedWacc != null ? `${(result.impliedWacc*100).toFixed(1)}%` : "N/A";

  el.innerHTML = `
    <div class="implied-card">
      <div class="implied-card-label">Implied Share Price</div>
      <div class="implied-card-value">${fmtPrice(implied)}</div>
      <div class="implied-card-sub">
        Current Price: <strong style="color:#E0E0E0;">${fmtPrice(curPrice)}</strong>
        &nbsp;·&nbsp;
        Upside / Downside: <span class="${upCls}">${upLabel}</span>
      </div>
    </div>

    <div class="kpi-strip">
      ${[
        ["Enterprise Value",    fmtB(result.enterpriseValue)],
        ["Equity Value",        fmtB(result.equityValue)],
        ["PV of FCFs",          fmtB(result.sumPvFcfs)],
        ["PV of Terminal Val",  fmtB(result.pvTerminal)],
        ["Market-Implied WACC", iwStr],
      ].map(([l,v]) => `<div class="kpi-card"><div class="kpi-label">${l}</div><div class="kpi-value">${v}</div></div>`).join("")}
    </div>

    <hr class="dcf-divider" />

    <div class="chart-grid">
      <div class="chart-card" id="ch-waterfall" style="min-height:300px;"></div>
      <div class="chart-card" id="ch-pie"       style="min-height:300px;"></div>
    </div>

    <div class="section-title">Year-by-Year DCF Detail</div>
    <div class="fin-table-wrap">
      <table class="fin-table">
        <thead><tr>
          <th style="text-align:left;">Year</th>
          <th>Projected FCF</th>
          <th>Discount Factor</th>
          <th>PV of FCF</th>
        </tr></thead>
        <tbody>
          ${result.years.map((yr, i) => `<tr>
            <td>${yr}</td>
            <td>${fmtB(result.fcfs[i])}</td>
            <td>${(1/Math.pow(1+wacc,i+1)).toFixed(4)}</td>
            <td>${fmtB(result.pvFcfs[i])}</td>
          </tr>`).join("")}
          <tr class="row-hl">
            <td>Terminal</td>
            <td>${fmtB(result.terminalVal)}</td>
            <td>${(1/Math.pow(1+wacc,projYears)).toFixed(4)}</td>
            <td>${fmtB(result.pvTerminal)}</td>
          </tr>
        </tbody>
      </table>
    </div>`;

  // Waterfall
  const wfLabels = result.years.map(String).concat(["Terminal Value", "− Debt", "+ Cash", "Equity Value"]);
  const wfVals   = result.pvFcfs.concat([result.pvTerminal, -totalDebt, cashVal, result.equityValue]);
  const measures = Array(result.pvFcfs.length).fill("relative").concat(["relative","relative","relative","total"]);
  plot(document.getElementById("ch-waterfall"), [{ type: "waterfall", orientation: "v",
    measure: measures, x: wfLabels, y: wfVals.map(v => v/1e9),
    connector: { line: { color: GRID_CLR } },
    increasing: { marker: { color: GREEN } },
    decreasing: { marker: { color: RED } },
    totals: { marker: { color: ACCENT } },
    hovertemplate: "$%{y:.2f}B<extra></extra>",
  }], basePlot("DCF Bridge to Equity Value (USD Billions)", 300));

  // Pie — values converted to USD billions so the hover label matches the
  // displayed "B" suffix instead of showing the raw dollar figure.
  plot(document.getElementById("ch-pie"), [{ type: "pie",
    labels: ["PV of Projected FCFs", "PV of Terminal Value"],
    values: [result.sumPvFcfs / 1e9, result.pvTerminal / 1e9],
    hole: 0.55,
    marker: { colors: [ACCENT, GOLD], line: { color: SURF_BG, width: 2 } },
    textinfo: "percent",
    textposition: "inside",
    insidetextfont: { family: "Inter, sans-serif", size: 12, color: "#1A1A1A" },
    outsidetextfont: { family: "Inter, sans-serif", size: 12, color: TEXT_CLR },
    hovertemplate: "%{label}: $%{value:.2f}B (%{percent})<extra></extra>",
  }], { ...basePlot("Enterprise Value Composition", 300), showlegend: true });
}

// ── Sensitivity tab ───────────────────────────────────────────────────────────
function renderSensitivity(el) {
  if (!projInputs) {
    el.innerHTML = `<div class="info-box">Fill in the Projections tab first.</div>`;
    return;
  }
  const { hist, cashVal, totalDebt, shares, curPrice } = window._dcfCtx;
  const projYears = clamp(parseInt(document.getElementById("proj-years").value) || 5, 1, 10);
  const wacc      = clamp(parseFloat(document.getElementById("wacc").value) || 10, 1, 30) / 100;
  const terminalG = clamp(parseFloat(document.getElementById("terminal-g").value) || 2.5, 0, 8) / 100;
  const mode      = document.getElementById("proj-mode").value;

  const sens = sensitivityTable(hist, projYears, wacc, terminalG, mode, projInputs, shares, totalDebt, cashVal);

  // Find min/max for colour scaling
  const allVals = sens.rows.flat().filter(v => v != null && isFinite(v));
  const minV = Math.min(...allVals), maxV = Math.max(...allVals);

  function colourClass(v, isBase) {
    if (v == null || !isFinite(v)) return "";
    const t = (v - minV) / (maxV - minV || 1);
    const cls = t < 0.35 ? "sens-low" : t < 0.65 ? "sens-mid" : "sens-high";
    return isBase ? cls + " sens-base" : cls;
  }

  const baseWaccLabel = `${(wacc*100).toFixed(2)}%`;
  const baseTgLabel   = `${(terminalG*100).toFixed(2)}%`;

  el.innerHTML = `
    <div class="section-title">Sensitivity Analysis — Implied Price vs WACC & Terminal Growth</div>
    <div class="kpi-meta" style="margin-bottom:12px;">Rows = WACC ± 2pp &nbsp;·&nbsp; Columns = Terminal Growth ± 1pp &nbsp;·&nbsp; Base highlighted</div>
    <div class="sens-wrap">
      <table class="sens-table">
        <thead>
          <tr>
            <th>WACC \\ Term. Growth</th>
            ${sens.tgLabels.map(l => `<th>${l}</th>`).join("")}
          </tr>
        </thead>
        <tbody>
          ${sens.rows.map((row, ri) => `<tr>
            <th>${sens.waccLabels[ri]}</th>
            ${row.map((v, ci) => {
              const isBase = sens.waccLabels[ri] === baseWaccLabel && sens.tgLabels[ci] === baseTgLabel;
              const cls = colourClass(v, isBase);
              return `<td class="${cls}">${v != null && isFinite(v) ? fmtPrice(v) : "—"}</td>`;
            }).join("")}
          </tr>`).join("")}
        </tbody>
      </table>
    </div>`;
}

})();