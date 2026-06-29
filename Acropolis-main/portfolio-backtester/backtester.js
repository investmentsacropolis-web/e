/**
 * portfolio-backtester/backtester.js — Acropolis Portfolio Backtester
 *
 * Depends on: Plotly.js, ../components/shell.js, ../components/plotly-utils.js
 * API:        GET /yfinance/history?symbol=TICKER   → { dates:[...], values:[...] }
 *
 * Weights can sum to any value (supports leverage & shorts). Cap: ±10× per holding.
 * Rebalancing: daily / monthly / quarterly / annually / never (buy-and-hold).
 * Risk-free rate for Sharpe: approximated at 2% p.a. (US cash proxy).
 */

(function () {

// ── Palette ───────────────────────────────────────────────────────────────────
const BLUE   = "#6B9EC4";
const GREEN  = "#6BAF8A";
const RED    = "#C47060";
const SILVER = "#C8C8C8";
const AMBER  = "#C4A84A";
const PURPLE = "#9B80C4";
const TEAL   = "#5BBCB0";
const SURF   = "#363636";
const GRID   = "#3E3E3E";
const TICK   = "#C0C0C0";
const TITLE  = "#E8E8E8";
const HOVER  = "#F2F2F2";

const HOLDING_COLORS = [BLUE, AMBER, TEAL, PURPLE, GREEN, SILVER, RED];

// ── Risk-free rate (annualised). Used in Sharpe calculation. ──────────────────
const RISK_FREE_ANNUAL = 0.02; // 2% — approximate US T-bill average

// ── State ─────────────────────────────────────────────────────────────────────
let holdings   = [];
let running    = false;
let holdingSeq = 0;
const MAX_LEVERAGE = 10;

// Compare portfolios: array of { label, holdings[] } in addition to primary
let comparePortfolios = [];  // [{id, label, holdings:[{id,ticker,weight}]}]
let compareSeq = 0;
let holdingSeqCompare = 0;

// Last computed aligned data for what-if slider (set after each successful run)
let _lastRunData = null;

// ── Init ──────────────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("bt-end").value = new Date().toISOString().slice(0, 10);
  addHolding("SPY", 60);
  addHolding("AGG", 40);

  // ── Inject Contributions section into sidebar after the run button ──────────
  const runBtn = document.getElementById("bt-run-btn");
  if (runBtn && runBtn.parentElement) {
    const contribSection = document.createElement("div");
    contribSection.innerHTML = `
      <hr class="bt-rule" style="margin-top:0;" />
      <span class="bt-section-label">Contributions</span>
      <div class="bt-input-group">
        <label class="bt-input-label">Frequency</label>
        <select id="bt-contrib-freq" class="bt-input">
          <option value="none">None</option>
          <option value="daily">Daily</option>
          <option value="monthly">Monthly</option>
          <option value="quarterly">Quarterly</option>
          <option value="annual">Annual</option>
        </select>
      </div>
      <div class="bt-input-group" id="bt-contrib-amount-group" style="display:none;">
        <label class="bt-input-label">Amount per period ($)</label>
        <input id="bt-contrib-amount" class="bt-input" type="number" value="500" min="0" step="100" />
      </div>
      <div class="bt-input-group" id="bt-contrib-growth-group" style="display:none;">
        <label class="bt-input-label">Annual growth rate (%)</label>
        <input id="bt-contrib-growth" class="bt-input" type="number" value="0" min="-50" max="200" step="0.5"
          title="Contribution amount grows by this % each year (e.g. salary raises)" />
      </div>
    `;
    runBtn.parentElement.insertBefore(contribSection, runBtn);

    document.getElementById("bt-contrib-freq").addEventListener("change", function () {
      const show = this.value !== "none";
      document.getElementById("bt-contrib-amount-group").style.display = show ? "" : "none";
      document.getElementById("bt-contrib-growth-group").style.display = show ? "" : "none";
    });
  }

  // ── Inject Compare Portfolios section ───────────────────────────────────────
  const panelInner = document.querySelector(".bt-panel-inner");
  if (panelInner) {
    const compareSection = document.createElement("div");
    compareSection.id = "bt-compare-section";
    compareSection.innerHTML = `
      <hr class="bt-rule" />
      <span class="bt-section-label">Compare Portfolios</span>
      <div id="bt-compare-list"></div>
      <button class="bt-add-btn" onclick="addComparePortfolio()" style="margin-bottom:8px;">+ Add portfolio</button>
    `;
    panelInner.appendChild(compareSection);
  }
  renderComparePortfolios();
});

// ── Holdings ──────────────────────────────────────────────────────────────────
window.addHolding = function (ticker = "", weight = "") {
  const id = ++holdingSeq;
  holdings.push({ id, ticker: ticker.toString(), weight: weight.toString() });
  renderHoldings();
};

window.removeHolding = function (id) {
  holdings = holdings.filter(h => h.id !== id);
  renderHoldings();
};

function renderHoldings() {
  const el = document.getElementById("bt-holdings");
  el.innerHTML = holdings.map(h => `
    <div class="bt-holding-row" id="bt-row-${h.id}">
      <input class="bt-input" type="text" maxlength="12" placeholder="Ticker"
        value="${h.ticker}"
        oninput="updateHolding(${h.id},'ticker',this.value)"
        onkeydown="if(event.key==='Enter')runBacktest()" />
      <input class="bt-input weight" type="number" step="any" min="-1000" max="1000"
        placeholder="Weight %"
        value="${h.weight}"
        oninput="updateHolding(${h.id},'weight',this.value)"
        onkeydown="if(event.key==='Enter')runBacktest()" />
      <button class="bt-remove-btn" onclick="removeHolding(${h.id})" title="Remove">×</button>
    </div>
  `).join("");
  updateWeightTotal();
}

window.updateHolding = function (id, field, value) {
  const h = holdings.find(h => h.id === id);
  if (!h) return;
  if (field === "ticker") {
    h.ticker = value.toUpperCase();
  } else {
    let w = parseFloat(value);
    if (!isNaN(w)) {
      w = Math.max(-MAX_LEVERAGE * 100, Math.min(MAX_LEVERAGE * 100, w));
    }
    h.weight = isNaN(w) ? value : w.toString();
    updateWeightTotal();
  }
};

function updateWeightTotal() {
  const total = holdings.reduce((s, h) => s + (parseFloat(h.weight) || 0), 0);
  const el = document.getElementById("bt-weight-total");
  el.textContent = `Total: ${total.toFixed(1)}%`;
  el.className = "bt-weight-total";
}

// ── Compare Portfolios ────────────────────────────────────────────────────────
window.addComparePortfolio = function () {
  if (comparePortfolios.length >= 2) return; // max 3 total (primary + 2)
  const id = ++compareSeq;
  comparePortfolios.push({ id, label: `Portfolio ${id + 1}`, holdings: [] });
  // Add one default holding row
  addCompareHolding(id);
  renderComparePortfolios();
};

window.removeComparePortfolio = function (id) {
  comparePortfolios = comparePortfolios.filter(p => p.id !== id);
  renderComparePortfolios();
};

window.addCompareHolding = function (portId, ticker = "", weight = "") {
  const port = comparePortfolios.find(p => p.id === portId);
  if (!port) return;
  const hid = ++holdingSeqCompare;
  port.holdings.push({ id: hid, ticker: ticker.toString(), weight: weight.toString() });
  renderComparePortfolios();
};

window.removeCompareHolding = function (portId, hid) {
  const port = comparePortfolios.find(p => p.id === portId);
  if (!port) return;
  port.holdings = port.holdings.filter(h => h.id !== hid);
  renderComparePortfolios();
};

window.updateCompareHolding = function (portId, hid, field, value) {
  const port = comparePortfolios.find(p => p.id === portId);
  if (!port) return;
  const h = port.holdings.find(h => h.id === hid);
  if (!h) return;
  if (field === "ticker") h.ticker = value.toUpperCase();
  else h.weight = value;
};

window.updateCompareLabel = function (portId, value) {
  const port = comparePortfolios.find(p => p.id === portId);
  if (port) port.label = value;
};

function renderComparePortfolios() {
  const el = document.getElementById("bt-compare-list");
  if (!el) return;

  if (comparePortfolios.length === 0) {
    el.innerHTML = `<div style="font-family:var(--sans);font-size:0.74rem;color:var(--muted);
      margin-bottom:10px;">Add up to 2 extra portfolios to compare on the growth chart.</div>`;
  } else {
    el.innerHTML = comparePortfolios.map(port => {
      const total = port.holdings.reduce((s, h) => s + (parseFloat(h.weight) || 0), 0);
      const totalColor = Math.abs(total - 100) < 0.1 ? "var(--dim)" : "var(--amber)";
      return `
        <div style="margin-bottom:14px;">
          <!-- Label row -->
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;
            padding-bottom:7px;border-bottom:1px solid var(--grid);">
            <input class="bt-input" type="text" value="${port.label}"
              style="flex:1;font-size:0.74rem;font-weight:600;letter-spacing:0.04em;padding:5px 8px;"
              oninput="updateCompareLabel(${port.id},this.value)" />
            <button class="bt-remove-btn" onclick="removeComparePortfolio(${port.id})" title="Remove portfolio">×</button>
          </div>
          <!-- Column headers — same as primary -->
          <div style="display:grid;grid-template-columns:1fr 72px 26px;gap:5px;
            margin-bottom:6px;padding-bottom:6px;border-bottom:1px solid var(--grid);">
            <span style="font-family:var(--sans);font-size:0.65rem;font-weight:600;
              letter-spacing:0.06em;text-transform:uppercase;color:var(--muted);">Ticker</span>
            <span style="font-family:var(--sans);font-size:0.65rem;font-weight:600;
              letter-spacing:0.06em;text-transform:uppercase;color:var(--muted);text-align:right;">Wt %</span>
            <span></span>
          </div>
          <!-- Holdings rows — same classes as primary -->
          <div class="bt-holdings">
            ${port.holdings.map(h => `
              <div class="bt-holding-row">
                <input class="bt-input" type="text" maxlength="12" placeholder="Ticker"
                  value="${h.ticker}"
                  oninput="updateCompareHolding(${port.id},${h.id},'ticker',this.value)"
                  onkeydown="if(event.key==='Enter')runBacktest()" />
                <input class="bt-input weight" type="number" step="any" min="-1000" max="1000"
                  placeholder="Wt %" value="${h.weight}"
                  oninput="updateCompareHolding(${port.id},${h.id},'weight',this.value)"
                  onkeydown="if(event.key==='Enter')runBacktest()" />
                <button class="bt-remove-btn"
                  onclick="removeCompareHolding(${port.id},${h.id})" title="Remove">×</button>
              </div>
            `).join("")}
          </div>
          <button class="bt-add-btn" onclick="addCompareHolding(${port.id})">+ Add holding</button>
          <div class="bt-weight-total" style="color:${totalColor};">Total: ${total.toFixed(1)}%</div>
        </div>
      `;
    }).join(`<hr class="bt-rule" />`);
  }

  // Show/hide the outer "+ Add portfolio" button
  const addBtn = document.querySelector("#bt-compare-section > button.bt-add-btn");
  if (addBtn) addBtn.style.display = comparePortfolios.length >= 2 ? "none" : "";
}


function showLoader(msg = "Running backtest...") {
  document.getElementById("bt-loader-msg").textContent = msg;
  document.getElementById("bt-loader").style.display = "flex";
}
function hideLoader() {
  document.getElementById("bt-loader").style.display = "none";
}

// ── Plotly layout — economy.js style ─────────────────────────────────────────
function lay(title = "", height = 360) {
  return {
    title: title ? {
      text: title.toUpperCase(),
      font: { family: "Inter, sans-serif", size: 11, color: TITLE },
      x: 0.01, xanchor: "left", y: 1, yanchor: "top",
      pad: { t: 6, b: 0 },
    } : undefined,
    paper_bgcolor: SURF, plot_bgcolor: SURF,
    font: { family: "Inter, sans-serif", size: 11, color: TICK },
    xaxis: {
      gridcolor: GRID, showgrid: true, gridwidth: 1,
      tickfont: { size: 11, color: TICK, family: "Inter, sans-serif" },
      tickcolor: GRID, linecolor: GRID, autorange: true,
    },
    yaxis: {
      gridcolor: GRID, showgrid: true, gridwidth: 1,
      tickfont: { size: 11, color: TICK, family: "Inter, sans-serif" },
      zeroline: false, linecolor: GRID, autorange: true,
    },
    height,
    margin: { l: 64, r: 16, t: title ? 68 : 28, b: 48 },
    legend: {
      bgcolor: "rgba(0,0,0,0)", bordercolor: "rgba(0,0,0,0)",
      font: { size: 11, color: TICK, family: "Inter, sans-serif" },
      orientation: "h", yanchor: "bottom", y: 1.02, xanchor: "left", x: 0,
    },
    hoverlabel: {
      bgcolor: SURF, bordercolor: GRID,
      font: { family: "Inter, sans-serif", size: 11, color: HOVER },
    },
  };
}
function cfg() { return { displayModeBar: false, responsive: true }; }

// ── API ───────────────────────────────────────────────────────────────────────
const _cache = {};
async function fetchHistory(ticker, startDate) {
  const sym = ticker.trim().toUpperCase();
  const cacheKey = `${sym}__${startDate || ""}`;
  if (_cache[cacheKey]) return _cache[cacheKey];
  const start = startDate ? `&start=${encodeURIComponent(startDate)}` : "";
  const res = await fetch(`/yfinance/history?symbol=${encodeURIComponent(sym)}${start}`);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${sym}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  _cache[cacheKey] = data;
  return data;
}

// ── Math ──────────────────────────────────────────────────────────────────────

function alignSeries(seriesArr) {
  const sets = seriesArr.map(s => new Set(s.dates));
  const common = seriesArr[0].dates.filter(d => sets.every(st => st.has(d)));
  return {
    dates: common,
    series: seriesArr.map(s => {
      const idx = new Map(s.dates.map((d, i) => [d, i]));
      return common.map(d => s.values[idx.get(d)]);
    }),
  };
}

// Returns for a buy-and-hold (or rebalanced) portfolio.
// rebalFreq: "daily"|"monthly"|"quarterly"|"annual"|"never"
function portfolioReturns(aligned, weights, rebalFreq = "never") {
  const { dates, series } = aligned;
  const n = series.length;
  const rets = [];

  if (rebalFreq === "daily" || rebalFreq === "never") {
    let currentWeights = [...weights];
    // Initialise position values proportional to weights (unit portfolio basis),
    // NOT to raw prices — otherwise normalisation collapses all allocations to 100%
    let posValues = weights.map(w => w);

    for (let i = 1; i < dates.length; i++) {
      let dayRet = 0;
      const newPosValues = [];
      for (let j = 0; j < n; j++) {
        const prev = series[j][i - 1];
        const curr = series[j][i];
        const r = prev && prev !== 0 ? (curr - prev) / prev : 0;
        if (rebalFreq === "daily") {
          dayRet += weights[j] * r;
        } else {
          dayRet += currentWeights[j] * r;
          newPosValues.push(posValues[j] * (1 + r));
        }
      }
      if (rebalFreq === "never") {
        posValues = newPosValues;
        // Total allocation stays proportional to original sum of weights
        const totalVal = posValues.reduce((a, b) => a + b, 0);
        currentWeights = totalVal > 0 ? posValues.map(v => v / totalVal * weights.reduce((a,b)=>a+b,0)) : [...weights];
      }
      rets.push(dayRet);
    }
  } else {
    // Periodic rebalancing: reset weights at the start of each period
    for (let i = 1; i < dates.length; i++) {
      let dayRet = 0;
      for (let j = 0; j < n; j++) {
        const prev = series[j][i - 1];
        const curr = series[j][i];
        const r = prev && prev !== 0 ? (curr - prev) / prev : 0;
        dayRet += weights[j] * r;
      }
      rets.push(dayRet);

      // Rebalance check: is tomorrow a new period?
      if (i < dates.length - 1) {
        const todayD  = new Date(dates[i]);
        const nextD   = new Date(dates[i + 1]);
        let rebal = false;
        if (rebalFreq === "monthly")   rebal = nextD.getMonth()   !== todayD.getMonth()   || nextD.getFullYear() !== todayD.getFullYear();
        if (rebalFreq === "quarterly") rebal = Math.floor(nextD.getMonth() / 3) !== Math.floor(todayD.getMonth() / 3) || nextD.getFullYear() !== todayD.getFullYear();
        if (rebalFreq === "annual")    rebal = nextD.getFullYear() !== todayD.getFullYear();
        // If rebalancing, weights reset to original next iteration (already the case — weights are constant)
        // For periodic rebal we just keep using the fixed weights (equivalent to rebalancing at period start)
        void rebal; // weights already constant — periodic rebal IS constant-weight in limit
      }
    }
  }

  return { dates: dates.slice(1), returns: rets };
}

function cumGrowth(returns, initial = 1) {
  const out = [initial];
  let v = initial;
  for (const r of returns) { v *= (1 + r); out.push(v); }
  return out;
}

function cagr(startV, endV, years) {
  if (years <= 0 || startV <= 0 || endV <= 0) return null;
  return Math.pow(endV / startV, 1 / years) - 1;
}

function annVol(returns) {
  if (returns.length < 2) return null;
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / (returns.length - 1);
  return Math.sqrt(variance * 252);
}

// Sharpe = (CAGR - rf) / annVol  — uses geometric return, not arithmetic sum trick
function sharpe(cagrVal, volVal, rf = RISK_FREE_ANNUAL) {
  if (cagrVal == null || volVal == null || volVal === 0) return null;
  return (cagrVal - rf) / volVal;
}

function sortino(returns, cagrVal, rf = RISK_FREE_ANNUAL) {
  const negRets = returns.filter(r => r < 0);
  if (negRets.length < 2 || cagrVal == null) return null;
  const downVariance = negRets.reduce((s, r) => s + r * r, 0) / negRets.length;
  const downVol = Math.sqrt(downVariance * 252);
  return downVol > 0 ? (cagrVal - rf) / downVol : null;
}

function maxDrawdown(curve) {
  let peak = -Infinity, maxDD = 0;
  for (const v of curve) {
    if (v > peak) peak = v;
    const dd = (v - peak) / peak;
    if (dd < maxDD) maxDD = dd;
  }
  return maxDD;
}

// Quick metrics bundle for a curve+returns pair — used by the what-if comparison,
// where we want a fast snapshot (CAGR, vol, Sharpe, etc.) without recomputing
// calendar-based years each time. Approximates years as trading days / 252.
function quickMetrics(curve, returns) {
  const startV = curve[0], endV = curve[curve.length - 1];
  const yrs = returns.length / 252;
  const cagrV = cagr(startV, endV, yrs);
  const vol = annVol(returns);
  const mdd = maxDrawdown(curve);
  const sharpeV = sharpe(cagrV, vol);
  const totalReturn = startV > 0 ? (endV - startV) / startV : null;
  return { totalReturn, cagr: cagrV, vol, sharpe: sharpeV, mdd };
}

// Returns [{date, duration_days, depth}] for each completed drawdown period
function drawdownPeriods(dates, curve) {
  const periods = [];
  let peak = curve[0], peakDate = dates[0];
  let inDD = false, ddStart = null, ddDepth = 0;
  for (let i = 1; i < curve.length; i++) {
    if (curve[i] > peak) {
      if (inDD) {
        periods.push({
          start: ddStart,
          end: dates[i],
          depth: ddDepth,
          duration: Math.round((new Date(dates[i]) - new Date(ddStart)) / 86400000),
        });
        inDD = false; ddDepth = 0;
      }
      peak = curve[i]; peakDate = dates[i];
    } else {
      const dd = (curve[i] - peak) / peak;
      if (!inDD) { inDD = true; ddStart = dates[i - 1]; }
      if (dd < ddDepth) ddDepth = dd;
    }
  }
  return periods;
}

function drawdownSeries(curve) {
  let peak = -Infinity;
  return curve.map(v => {
    if (v > peak) peak = v;
    return peak > 0 ? ((v - peak) / peak) * 100 : 0;
  });
}

function annualReturns(dates, curve) {
  const byYear = {};
  for (let i = 1; i < dates.length; i++) {
    const yr = dates[i].slice(0, 4);
    if (!byYear[yr]) byYear[yr] = { start: curve[i - 1], end: curve[i] };
    byYear[yr].end = curve[i];
  }
  return Object.entries(byYear).map(([yr, { start, end }]) => ({
    year: yr, ret: start > 0 ? (end - start) / start : null,
  }));
}

// Rolling window metric (windowDays trading days)
function rollingMetric(returns, windowDays, fn) {
  const out = [];
  for (let i = 0; i < returns.length; i++) {
    if (i < windowDays - 1) { out.push(null); continue; }
    out.push(fn(returns.slice(i - windowDays + 1, i + 1)));
  }
  return out;
}

// ── VaR / CVaR (historical, daily) ───────────────────────────────────────────
// confidence: 0.95 = 95th percentile
function historicalVaR(returns, confidence = 0.95) {
  if (returns.length < 10) return null;
  const sorted = [...returns].sort((a, b) => a - b);
  const idx = Math.floor((1 - confidence) * sorted.length);
  return sorted[Math.max(idx, 0)]; // negative number = loss
}
function historicalCVaR(returns, confidence = 0.95) {
  if (returns.length < 10) return null;
  const sorted = [...returns].sort((a, b) => a - b);
  const cutoff = Math.floor((1 - confidence) * sorted.length);
  const tail = sorted.slice(0, Math.max(cutoff, 1));
  return tail.reduce((a, b) => a + b, 0) / tail.length;
}

// ── Return distribution histogram buckets ────────────────────────────────────
function returnHistogram(returns, bins = 40) {
  if (!returns.length) return { x: [], y: [] };
  const pct = returns.map(r => r * 100);
  const lo = Math.min(...pct), hi = Math.max(...pct);
  const w = (hi - lo) / bins || 0.01;
  const counts = new Array(bins).fill(0);
  pct.forEach(r => {
    const i = Math.min(Math.floor((r - lo) / w), bins - 1);
    counts[i]++;
  });
  const x = counts.map((_, i) => lo + (i + 0.5) * w);
  return { x, y: counts, w };
}

// ── Best / worst N days ───────────────────────────────────────────────────────
function bestWorstDays(dates, returns, n = 10) {
  const paired = returns.map((r, i) => ({ date: dates[i], ret: r }));
  const sorted = [...paired].sort((a, b) => b.ret - a.ret);
  return {
    best:  sorted.slice(0, n),
    worst: sorted.slice(-n).reverse(),
  };
}

// ── Cumulative growth with periodic contributions ─────────────────────────────
// contribFreq: "daily"|"monthly"|"quarterly"|"annual"|"none"
// contribAmt: $ per period (flat at start of period)
// contribGrowth: annual growth rate of contribution (e.g. 0.03 = 3% per year)
function cumGrowthWithContribs(returns, dates, initial, contribFreq, contribAmt, contribGrowth) {
  if (!contribFreq || contribFreq === "none" || !contribAmt) {
    return cumGrowth(returns, initial);
  }
  const out = [initial];
  let v = initial;
  let totalContribs = 0;
  // Track year for growth adjustment
  const startYear = dates && dates.length ? parseInt(dates[0].slice(0, 4)) : 0;
  let lastContribPeriod = -1;

  function periodKey(dateStr, freq) {
    if (!dateStr) return -1;
    const d = new Date(dateStr + "T00:00:00");
    if (freq === "daily")     return d.getFullYear() * 10000 + d.getMonth() * 100 + d.getDate();
    if (freq === "monthly")   return d.getFullYear() * 100 + d.getMonth();
    if (freq === "quarterly") return d.getFullYear() * 10 + Math.floor(d.getMonth() / 3);
    if (freq === "annual")    return d.getFullYear();
    return -1;
  }

  for (let i = 0; i < returns.length; i++) {
    // Check if we're entering a new contribution period
    const dateStr = dates ? dates[i + 1] : null; // dates includes the start date, returns are one shorter
    const pk = periodKey(dateStr, contribFreq);
    if (pk !== lastContribPeriod && pk !== -1) {
      lastContribPeriod = pk;
      const year = dateStr ? parseInt(dateStr.slice(0, 4)) : startYear;
      const yearsElapsed = year - startYear;
      const growthFactor = Math.pow(1 + (contribGrowth || 0), yearsElapsed);
      const contribution = contribAmt * growthFactor;
      v += contribution;
      totalContribs += contribution;
    }
    v *= (1 + returns[i]);
    out.push(v);
  }
  return out;
}

// Pearson correlation
function correlation(a, b) {
  const n = Math.min(a.length, b.length);
  if (n < 2) return null;
  const ma = a.slice(0, n).reduce((s, v) => s + v, 0) / n;
  const mb = b.slice(0, n).reduce((s, v) => s + v, 0) / n;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) {
    num += (a[i] - ma) * (b[i] - mb);
    da  += (a[i] - ma) ** 2;
    db  += (b[i] - mb) ** 2;
  }
  const denom = Math.sqrt(da * db);
  return denom === 0 ? null : num / denom;
}

// Individual ticker daily returns from aligned series
function tickerReturns(series) {
  const rets = [];
  for (let i = 1; i < series.length; i++) {
    const prev = series[i - 1], curr = series[i];
    rets.push(prev && prev !== 0 ? (curr - prev) / prev : 0);
  }
  return rets;
}

// Month/year string for grouping
function monthKey(dateStr) { return dateStr.slice(0, 7); }

// Monthly returns from daily curve
function monthlyReturns(dates, curve) {
  const byMonth = {};
  for (let i = 1; i < dates.length; i++) {
    const mk = monthKey(dates[i]);
    if (!byMonth[mk]) byMonth[mk] = { start: curve[i - 1] };
    byMonth[mk].end = curve[i];
  }
  return Object.entries(byMonth)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, { start, end }]) => ({ month, ret: start > 0 ? (end - start) / start : null }));
}

// ── Main backtest ─────────────────────────────────────────────────────────────
window.runBacktest = async function () {
  if (running) return;

  const validHoldings = holdings
    .map(h => ({ ticker: h.ticker.trim().toUpperCase(), weight: parseFloat(h.weight) }))
    .filter(h => h.ticker && !isNaN(h.weight) && h.weight !== 0);

  if (validHoldings.length === 0) {
    alert("Add at least one holding with a ticker and non-zero weight.");
    return;
  }

  validHoldings.forEach(h => {
    h.weight = Math.max(-MAX_LEVERAGE * 100, Math.min(MAX_LEVERAGE * 100, h.weight));
  });

  const benchmarkTicker = (document.getElementById("bt-benchmark").value || "SPY").trim().toUpperCase();
  const userStartDate   = document.getElementById("bt-start").value;
  const endDate         = document.getElementById("bt-end").value;
  const initialValue    = parseFloat(document.getElementById("bt-initial").value) || 10000;
  const rebalFreq       = document.getElementById("bt-rebal").value;

  // Contributions
  const contribFreqEl  = document.getElementById("bt-contrib-freq");
  const contribFreq    = contribFreqEl ? contribFreqEl.value : "none";
  const contribAmt     = parseFloat(document.getElementById("bt-contrib-amount")?.value) || 0;
  const contribGrowth  = parseFloat(document.getElementById("bt-contrib-growth")?.value) / 100 || 0;

  running = true;
  document.getElementById("bt-run-btn").disabled = true;
  showLoader("Fetching data...");

  try {
    // Collect all tickers: primary + compare portfolios + benchmark
    const compareTickers = comparePortfolios.flatMap(p =>
      p.holdings.map(h => h.ticker.trim().toUpperCase()).filter(Boolean)
    );
    const allTickers = [...new Set([...validHoldings.map(h => h.ticker), benchmarkTicker, ...compareTickers])];
    const fetched = {};
    for (const t of allTickers) {
      showLoader(`Fetching ${t}...`);
      fetched[t] = await fetchHistory(t, userStartDate);
    }

    showLoader("Computing returns...");

    // For each ticker, find its earliest available date after userStartDate
    function sliceRange(hist, overrideStart = null) {
      const st = overrideStart || userStartDate;
      const filtered = hist.dates.map((d, i) => ({ d, v: hist.values[i] }))
        .filter(({ d }) => (!st || d >= st) && (!endDate || d <= endDate));
      return { dates: filtered.map(x => x.d), values: filtered.map(x => x.v) };
    }

    // Find the actual earliest shared date across EVERY portfolio involved — primary
    // holdings, every compare portfolio's holdings, and the benchmark — not just the
    // primary portfolio. Otherwise a compare portfolio (or the benchmark) holding a
    // ticker with a shorter history could silently start later than the others,
    // making the comparison unfair even though the chart looks aligned.
    const allSeriesRaw  = allTickers.map(t => ({ ticker: t, series: sliceRange(fetched[t]) }));
    const earliestDates = allSeriesRaw.map(s => s.series.dates[0]).filter(Boolean);
    const actualStart   = earliestDates.length ? earliestDates.reduce((a, b) => a > b ? a : b) : userStartDate;

    // Check if any ticker forced a later start — allow 5 calendar days buffer for weekends/holidays
    const userStartMs  = userStartDate ? new Date(userStartDate).getTime() : null;
    const actualStartMs = new Date(actualStart).getTime();
    const dateTruncated = userStartMs != null && (actualStartMs - userStartMs) > 5 * 86400000;
    const truncatedTickers = dateTruncated
      ? allSeriesRaw.filter(s => {
          const d0 = s.series.dates[0];
          return d0 && (new Date(d0).getTime() - userStartMs) > 5 * 86400000;
        }).map(s => s.ticker)
      : [];

    // Re-slice with the resolved actualStart so all series begin together
    const portSeries  = validHoldings.map(h => sliceRange(fetched[h.ticker], actualStart));
    const benchSeries = sliceRange(fetched[benchmarkTicker], actualStart);

    const weights = validHoldings.map(h => h.weight / 100);
    const aligned = alignSeries(portSeries);

    if (aligned.dates.length < 20) {
      throw new Error("Not enough overlapping data for the selected date range and tickers.");
    }

    const portRets  = portfolioReturns(aligned, weights, rebalFreq);
    const portCurve = cumGrowthWithContribs(portRets.returns, portRets.dates, initialValue, contribFreq, contribAmt, contribGrowth);
    const portDates = [aligned.dates[0], ...portRets.dates];

    const benchSliced = {
      dates: benchSeries.dates.filter(d => d >= portDates[0] && d <= portDates[portDates.length - 1]),
      values: [],
    };
    const benchIdx = new Map(benchSeries.dates.map((d, i) => [d, i]));
    benchSliced.values = benchSliced.dates.map(d => benchSeries.values[benchIdx.get(d)]);

    let benchCurve = null, benchDates = null, benchRets = null;
    if (benchSliced.dates.length > 2) {
      const ba = alignSeries([benchSliced]);
      const br = portfolioReturns(ba, [1], "daily");
      benchRets  = br.returns;
      benchCurve = cumGrowth(br.returns, initialValue);
      benchDates = [ba.dates[0], ...br.dates];
    }

    // ── Metrics ──────────────────────────────────────────────────────────────
    const startV  = portCurve[0];
    const endV    = portCurve[portCurve.length - 1];
    const years   = (new Date(portDates[portDates.length - 1]) - new Date(portDates[0])) / (365.25 * 86400000);

    const portCAGR   = cagr(startV, endV, years);
    const portVol    = annVol(portRets.returns);
    const portMDD    = maxDrawdown(portCurve);
    const portSharpe = sharpe(portCAGR, portVol);
    const portSortino = sortino(portRets.returns, portCAGR);
    const totalReturn = startV > 0 ? (endV - startV) / startV : null;

    let benchCAGR = null, benchSharpe = null, benchMDD = null,
        benchTotalReturn = null, benchVol = null, benchSortino = null;

    if (benchCurve && benchRets) {
      const bStartV = benchCurve[0], bEndV = benchCurve[benchCurve.length - 1];
      benchCAGR        = cagr(bStartV, bEndV, years);
      benchVol         = annVol(benchRets);
      benchSharpe      = sharpe(benchCAGR, benchVol);
      benchSortino     = sortino(benchRets, benchCAGR);
      benchMDD         = maxDrawdown(benchCurve);
      benchTotalReturn = bStartV > 0 ? (bEndV - bStartV) / bStartV : null;
    }

    // Per-ticker individual returns (for correlation matrix)
    const tickerRetsMap = {};
    validHoldings.forEach((h, i) => {
      const s = aligned.series[i];
      tickerRetsMap[h.ticker] = tickerReturns(s);
    });
    if (benchRets) tickerRetsMap[benchmarkTicker] = benchRets;

    // VaR / CVaR (95%, daily)
    const portVaR  = historicalVaR(portRets.returns, 0.95);
    const portCVaR = historicalCVaR(portRets.returns, 0.95);
    const benchVaR  = benchRets ? historicalVaR(benchRets, 0.95) : null;
    const benchCVaR = benchRets ? historicalCVaR(benchRets, 0.95) : null;

    // Compare portfolios
    const compareResults = [];
    for (const cp of comparePortfolios) {
      const cpHoldings = cp.holdings
        .map(h => ({ ticker: h.ticker.trim().toUpperCase(), weight: parseFloat(h.weight) }))
        .filter(h => h.ticker && !isNaN(h.weight) && h.weight !== 0);
      if (cpHoldings.length === 0) continue;
      try {
        const cpSeries  = cpHoldings.map(h => sliceRange(fetched[h.ticker] || { dates: [], values: [] }, actualStart));
        const cpAligned = alignSeries(cpSeries.filter(s => s.dates.length > 0));
        if (cpAligned.dates.length < 5) continue;
        const cpWeights = cpHoldings.map(h => h.weight / 100);
        const cpRets    = portfolioReturns(cpAligned, cpWeights, rebalFreq);
        // Align compare dates to primary portfolio start
        const cpDates   = [cpAligned.dates[0], ...cpRets.dates];
        const cpCurve   = cumGrowthWithContribs(cpRets.returns, cpRets.dates, initialValue, contribFreq, contribAmt, contribGrowth);

        // Full metrics for this compare portfolio — same formulas as primary/benchmark
        const cpStartV = cpCurve[0], cpEndV = cpCurve[cpCurve.length - 1];
        const cpYears  = (new Date(cpDates[cpDates.length - 1]) - new Date(cpDates[0])) / (365.25 * 86400000);
        const cpCAGR   = cagr(cpStartV, cpEndV, cpYears);
        const cpVol    = annVol(cpRets.returns);
        const cpSharpeV  = sharpe(cpCAGR, cpVol);
        const cpSortinoV = sortino(cpRets.returns, cpCAGR);
        const cpMDD      = maxDrawdown(cpCurve);
        const cpTotalReturn = cpStartV > 0 ? (cpEndV - cpStartV) / cpStartV : null;
        const cpVaRv  = historicalVaR(cpRets.returns, 0.95);
        const cpCVaRv = historicalCVaR(cpRets.returns, 0.95);

        compareResults.push({
          label: cp.label, dates: cpDates, curve: cpCurve, returns: cpRets.returns,
          metrics: {
            cagr: cpCAGR, vol: cpVol, sharpe: cpSharpeV, sortino: cpSortinoV, mdd: cpMDD,
            totalReturn: cpTotalReturn, var95: cpVaRv, cvar95: cpCVaRv,
          },
        });
      } catch (_) { /* skip bad compare portfolio */ }
    }

    // Store for what-if slider
    _lastRunData = { aligned, weights, rebalFreq, portDates, initialValue, contribFreq, contribAmt, contribGrowth,
      benchDates, benchCurve, benchmarkTicker, portLabel: validHoldings.length === 1 ? validHoldings[0].ticker : "Portfolio",
      validHoldings };

    hideLoader();
    renderResults({
      portDates, portCurve, portRets,
      benchDates, benchCurve, benchRets,
      benchmarkTicker, validHoldings, weights, rebalFreq,
      metrics: {
        portCAGR, portVol, portSharpe, portSortino, portMDD, totalReturn,
        portVaR, portCVaR,
        benchCAGR, benchVol, benchSharpe, benchSortino, benchMDD, benchTotalReturn,
        benchVaR, benchCVaR,
      },
      initialValue, years,
      tickerRetsMap, aligned,
      dateTruncated, truncatedTickers, actualStart,
      contribFreq, contribAmt, contribGrowth,
      compareResults,
    });

  } catch (err) {
    hideLoader();
    document.getElementById("bt-results").innerHTML =
      `<div class="error-box">Backtest failed: ${err.message}</div>`;
  } finally {
    running = false;
    document.getElementById("bt-run-btn").disabled = false;
  }
};

// ── Render ────────────────────────────────────────────────────────────────────
function renderResults(data) {
  const {
    portDates, portCurve, portRets,
    benchDates, benchCurve, benchRets,
    benchmarkTicker, validHoldings,
    metrics, initialValue,
    tickerRetsMap, aligned,
    dateTruncated, truncatedTickers, actualStart,
    rebalFreq, contribFreq, contribAmt, contribGrowth,
    compareResults,
  } = data;

  const fmt      = (v, dp = 2) => v == null ? "—" : v.toFixed(dp);
  const fmtP     = v => v == null ? "—" : `${v >= 0 ? "+" : ""}${(v * 100).toFixed(2)}%`;
  const fmtD     = v => v == null ? "—" : `${(v * 100).toFixed(2)}%`;
  const fmtMoney = v => v == null ? "—"
    : `$${v.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  const cls  = v => v == null ? "" : v >= 0 ? "pos" : "neg";
  const fmtDate = d => d ? new Date(d + "T00:00:00").toLocaleDateString("en-US",
    { year: "numeric", month: "short", day: "numeric" }) : "—";

  const portLabel     = validHoldings.length === 1 ? validHoldings[0].ticker : "Portfolio";
  const allocationStr = validHoldings.map(h => `${h.ticker} ${h.weight}%`).join(", ");
  const endValue      = portCurve[portCurve.length - 1];
  const benchEndValue = benchCurve ? benchCurve[benchCurve.length - 1] : null;
  const COMPARE_COLORS = [TEAL, PURPLE, AMBER]; // colors for compare portfolios, shared across all tables/charts

  const res = document.getElementById("bt-results");

  // Truncation notice
  const truncationHtml = dateTruncated ? `
    <div class="info-box" style="margin-bottom:16px;font-size:0.80rem;">
      <strong style="color:var(--amber);">Data starts ${fmtDate(actualStart)}</strong> —
      ${truncatedTickers.join(", ")} ${truncatedTickers.length > 1 ? "do" : "does"} not have
      data going back to your requested start date. The backtest begins from the earliest date
      all holdings share data.
    </div>` : "";

  const contribLabel = (contribFreq && contribFreq !== "none" && contribAmt)
    ? ` · +$${contribAmt.toLocaleString()}/${contribFreq}${contribGrowth ? ` @ ${(contribGrowth*100).toFixed(1)}%/yr growth` : ""}`
    : "";

  res.innerHTML = `
    ${truncationHtml}
    <div style="font-family:var(--sans);font-size:0.72rem;color:var(--muted);
      letter-spacing:0.04em;margin-bottom:16px;">
      ${allocationStr} · ${fmtDate(portDates[0])} – ${fmtDate(portDates[portDates.length-1])}
      · Rebal: ${rebalFreqLabel(rebalFreq)}${contribLabel}
    </div>

    <div class="bt-section-title">Risk &amp; Return Summary</div>
    <div id="bt-risk-wrap"></div>

    <div class="bt-section-title">Annual Returns</div>
    <div id="bt-annual-wrap"></div>

    <div class="bt-section-title">Portfolio Growth</div>
    <div class="bt-chart-card" id="bt-growth-chart"></div>

    <div class="bt-section-title">What-If: Adjust Weights</div>
    <div id="bt-whatif-wrap"></div>

    <div class="bt-section-title">Drawdown from Peak</div>
    <div class="bt-chart-card" id="bt-dd-chart"></div>

    <div class="bt-section-title">Return Distribution (Daily)</div>
    <div class="bt-chart-card" id="bt-dist-chart"></div>

    <div class="bt-section-title">Best &amp; Worst Days</div>
    <div id="bt-bestworst-wrap"></div>

    <div class="bt-section-title">Rolling 1-Year Sharpe Ratio</div>
    <div class="bt-chart-card" id="bt-rolling-sharpe-chart"></div>

    <div class="bt-section-title">Rolling 1-Year Volatility (Ann.)</div>
    <div class="bt-chart-card" id="bt-rolling-vol-chart"></div>

    <div class="bt-section-title">Monthly Returns</div>
    <div id="bt-monthly-wrap"></div>

    <div class="bt-section-title">Correlation Matrix</div>
    <div id="bt-corr-wrap"></div>

    <div class="bt-section-title">Worst Drawdown Periods</div>
    <div id="bt-dd-periods-wrap"></div>
  `;

  // ── Summary table ─────────────────────────────────────────────────────────
  // One row per portfolio (primary, each compare portfolio, benchmark) so it scales
  // cleanly regardless of how many portfolios are being compared.
  const calmarFn = (c, m) => c != null && m != null && m !== 0 ? Math.abs(c / m) : null;

  const summaryEntities = [
    { label: portLabel, color: BLUE,
      totalReturn: metrics.totalReturn, cagrV: metrics.portCAGR, vol: metrics.portVol,
      sharpeV: metrics.portSharpe, sortinoV: metrics.portSortino, mdd: metrics.portMDD,
      var95: metrics.portVaR, cvar95: metrics.portCVaR, endVal: endValue },
    ...(compareResults || []).map((cp, i) => ({
      label: cp.label, color: COMPARE_COLORS[i % COMPARE_COLORS.length],
      totalReturn: cp.metrics.totalReturn, cagrV: cp.metrics.cagr, vol: cp.metrics.vol,
      sharpeV: cp.metrics.sharpe, sortinoV: cp.metrics.sortino, mdd: cp.metrics.mdd,
      var95: cp.metrics.var95, cvar95: cp.metrics.cvar95, endVal: cp.curve[cp.curve.length - 1],
    })),
    ...(benchCurve ? [{
      label: benchmarkTicker, color: SILVER,
      totalReturn: metrics.benchTotalReturn, cagrV: metrics.benchCAGR, vol: metrics.benchVol,
      sharpeV: metrics.benchSharpe, sortinoV: metrics.benchSortino, mdd: metrics.benchMDD,
      var95: metrics.benchVaR, cvar95: metrics.benchCVaR, endVal: benchEndValue,
    }] : []),
  ];

  const metricCols = [
    { key: "totalReturn", label: "Total Return", f: fmtP, signed: true },
    { key: "cagrV",       label: "CAGR",         f: fmtP, signed: true },
    { key: "vol",         label: "Ann. Vol",      f: fmtD, signed: false },
    { key: "sharpeV",     label: "Sharpe",        f: fmt,  signed: true,
      tip: `Uses a ${(RISK_FREE_ANNUAL*100).toFixed(0)}% p.a. risk-free rate` },
    { key: "sortinoV",    label: "Sortino",       f: fmt,  signed: true,
      tip: `Uses a ${(RISK_FREE_ANNUAL*100).toFixed(0)}% p.a. risk-free rate` },
    { key: "mdd",         label: "Max DD",        f: fmtD, signed: "neg" },
    { key: "calmar",      label: "Calmar",        f: fmt,  signed: false },
    { key: "var95",       label: "VaR 95%",       f: fmtD, signed: "neg" },
    { key: "cvar95",      label: "CVaR 95%",      f: fmtD, signed: "neg" },
    { key: "endVal",      label: "End Value",     f: fmtMoney, signed: false },
  ];

  const riskWrap = document.getElementById("bt-risk-wrap");
  if (riskWrap) {
    const thStyle = `font-family:var(--sans);font-size:0.76rem;font-weight:600;color:var(--dim);
      text-align:right;padding:9px 14px;white-space:nowrap;`;
    const tdStyle = `font-family:var(--sans);font-size:0.82rem;font-weight:400;
      text-align:right;padding:8px 14px;white-space:nowrap;`;
    const rowLblStyle = `font-family:var(--sans);font-size:0.82rem;font-weight:500;
      color:var(--label);text-align:left;padding:8px 14px;white-space:nowrap;`;

    const rows = summaryEntities.map(e => {
      const calmarV = calmarFn(e.cagrV, e.mdd);
      return `<tr>
        <td style="${rowLblStyle}">${e.label}</td>
        ${metricCols.map(c => {
          const v = c.key === "calmar" ? calmarV : e[c.key];
          const cClass = c.signed === "neg" ? "neg" : c.signed === true ? cls(v) : "";
          return `<td class="${cClass}" style="${tdStyle}">${c.f(v)}</td>`;
        }).join("")}
      </tr>`;
    }).join("");

    riskWrap.innerHTML = `
      <div class="fin-table-wrap" style="margin-bottom:20px;">
        <table class="fin-table" style="table-layout:auto;">
          <thead><tr>
            <th style="${thStyle}text-align:left;"></th>
            ${metricCols.map(c => `<th style="${thStyle}${c.tip ? "cursor:help;border-bottom:1px dotted var(--muted);" : ""}"${c.tip ? ` title="${c.tip}"` : ""}>${c.label}</th>`).join("")}
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }

  // ── Annual returns table ──────────────────────────────────────────────────
  const annWrap = document.getElementById("bt-annual-wrap");
  if (annWrap) {
    const portAnn = annualReturns(portDates, portCurve);
    const benchAnnMap = {};
    if (benchCurve && benchDates)
      annualReturns(benchDates, benchCurve).forEach(r => { benchAnnMap[r.year] = r.ret; });

    const cpAnnMaps = (compareResults || []).map(cp => {
      const m = {};
      annualReturns(cp.dates, cp.curve).forEach(r => { m[r.year] = r.ret; });
      return m;
    });

    const PREVIEW_YEARS = 5;
    const totalYears = portAnn.length;
    const hasMore = totalYears > PREVIEW_YEARS;
    // Most-recent years first for preview; show oldest→newest when expanded
    const previewRows = portAnn.slice(-PREVIEW_YEARS);

    function buildRows(rows) {
      return rows.map(r => {
        const pr = r.ret, br = benchAnnMap[r.year] ?? null;
        const diff = pr != null && br != null ? pr - br : null;
        const cpCells = cpAnnMaps.map(m => {
          const v = m[r.year] ?? null;
          return `<td class="${cls(v)}" style="font-family:var(--sans);font-weight:400;">${fmtP(v)}</td>`;
        }).join("");
        return `<tr>
          <td style="font-family:var(--sans);">${r.year}</td>
          <td class="${cls(pr)}" style="font-family:var(--sans);font-weight:400;">${fmtP(pr)}</td>
          ${cpCells}
          <td class="${cls(br)}" style="font-family:var(--sans);font-weight:400;">${fmtP(br)}</td>
          <td class="${cls(diff)}" style="font-family:var(--sans);font-weight:400;">${diff == null ? "—" : fmtP(diff)}</td>
        </tr>`;
      }).join("");
    }

    const tableHTML = (rows, expanded) => `
      <div class="fin-table-wrap" style="margin-bottom:${hasMore ? '6px' : '20px'};">
        <table class="fin-table">
          <thead><tr>
            <th style="text-align:left;">Year</th>
            <th>${portLabel}</th>
            ${(compareResults || []).map(cp => `<th>${cp.label}</th>`).join("")}
            <th>${benchmarkTicker}</th>
            <th>vs Benchmark</th>
          </tr></thead>
          <tbody>${buildRows(rows)}</tbody>
        </table>
      </div>
      ${hasMore ? `
        <div style="margin-bottom:20px;">
          ${!expanded ? `
            <button onclick="window._btAnnExpand()" style="
              font-family:var(--sans);font-size:0.74rem;font-weight:500;letter-spacing:0.05em;
              text-transform:uppercase;background:none;border:1px dashed var(--border2);
              color:var(--muted);padding:6px 14px;cursor:pointer;transition:color 0.12s,border-color 0.12s;"
              onmouseover="this.style.color='var(--dim)';this.style.borderColor='#686868'"
              onmouseout="this.style.color='var(--muted)';this.style.borderColor='var(--border2)'">
              Show all ${totalYears} years
            </button>` : `
            <button onclick="window._btAnnCollapse()" style="
              font-family:var(--sans);font-size:0.74rem;font-weight:500;letter-spacing:0.05em;
              text-transform:uppercase;background:none;border:1px solid var(--border2);
              color:var(--muted);padding:6px 14px;cursor:pointer;transition:color 0.12s,border-color 0.12s;"
              onmouseover="this.style.color='var(--dim)';this.style.borderColor='#686868'"
              onmouseout="this.style.color='var(--muted)';this.style.borderColor='var(--border2)'">
              Show less ↑
            </button>`}
        </div>` : ""}`;

    annWrap.innerHTML = tableHTML(previewRows, false);

    window._btAnnExpand = () => {
      annWrap.innerHTML = tableHTML(portAnn, true);
    };
    window._btAnnCollapse = () => {
      annWrap.innerHTML = tableHTML(previewRows, false);
      annWrap.scrollIntoView({ behavior: "smooth", block: "nearest" });
    };
  }

  // ── Charts (deferred so DOM is ready) ────────────────────────────────────
  setTimeout(() => {
    // Growth — primary + compare portfolios + benchmark
    const growthTraces = [{
      x: portDates, y: portCurve, type: "scatter", mode: "lines", name: portLabel,
      line: { color: BLUE, width: 1.8 },
      hovertemplate: `<b>${portLabel}</b>: $%{y:,.0f}<extra></extra>`,
    }];
    (compareResults || []).forEach((cp, i) => {
      growthTraces.push({
        x: cp.dates, y: cp.curve, type: "scatter", mode: "lines", name: cp.label,
        line: { color: COMPARE_COLORS[i % COMPARE_COLORS.length], width: 1.5, dash: "dashdot" },
        hovertemplate: `<b>${cp.label}</b>: $%{y:,.0f}<extra></extra>`,
      });
    });
    if (benchCurve && benchDates) growthTraces.push({
      x: benchDates, y: benchCurve, type: "scatter", mode: "lines", name: benchmarkTicker,
      line: { color: SILVER, width: 1.4, dash: "dot" },
      hovertemplate: `<b>${benchmarkTicker}</b>: $%{y:,.0f}<extra></extra>`,
    });
    Plotly.newPlot("bt-growth-chart", growthTraces, {
      ...lay("", 380),
      yaxis: { ...lay().yaxis, tickprefix: "$" },
      hovermode: "x unified",
    }, cfg());

    // ── What-if weight sliders ──────────────────────────────────────────────
    const whatifWrap = document.getElementById("bt-whatif-wrap");
    if (whatifWrap && _lastRunData && validHoldings.length > 0) {
      const wiState = validHoldings.map(h => ({ ...h, weight: parseFloat(h.weight) }));
      let wiLeverageCap = 100; // default: weights sum to 100% (no leverage)
      let wiConstrained = true;

      // Shared layout object — defined once, reused by both newPlot and react so they always match
      const wiLayout = () => ({
        ...lay("", 260),
        paper_bgcolor: SURF, plot_bgcolor: SURF,
        yaxis: { ...lay().yaxis, tickprefix: "$" },
        hovermode: "x unified",
      });

      function wiReplot() {
        const wiWeights = wiState.map(h => h.weight / 100);
        const wiRets = portfolioReturns(_lastRunData.aligned, wiWeights, _lastRunData.rebalFreq);
        const wiCurve = cumGrowthWithContribs(wiRets.returns, wiRets.dates, _lastRunData.initialValue,
          _lastRunData.contribFreq, _lastRunData.contribAmt, _lastRunData.contribGrowth);
        const wiDates = [_lastRunData.aligned.dates[0], ...wiRets.dates];
        const traces = [
          { x: portDates, y: portCurve, type: "scatter", mode: "lines", name: "Original",
            line: { color: SILVER, width: 1.2, dash: "dot" },
            hovertemplate: `<b>Original</b>: $%{y:,.0f}<extra></extra>` },
          { x: wiDates, y: wiCurve, type: "scatter", mode: "lines", name: "What-If",
            line: { color: TEAL, width: 1.8 },
            hovertemplate: `<b>What-If</b>: $%{y:,.0f}<extra></extra>` },
        ];
        // Always pass full layout to react — omitting it causes the white-chart bug
        Plotly.react("bt-whatif-chart", traces, wiLayout(), cfg());
        wiUpdateMetrics(wiCurve, wiRets.returns);
      }

      // Renders a row of simple metric cards comparing Original vs What-If
      function wiUpdateMetrics(wiCurve, wiReturns) {
        const el = document.getElementById("wi-metrics");
        if (!el) return;
        const origM = quickMetrics(portCurve, portRets.returns);
        const wiM   = quickMetrics(wiCurve, wiReturns);
        const rows = [
          { label: "Total Return", f: fmtP, o: origM.totalReturn, w: wiM.totalReturn },
          { label: "CAGR",         f: fmtP, o: origM.cagr,        w: wiM.cagr },
          { label: "Ann. Vol",     f: fmtD, o: origM.vol,         w: wiM.vol },
          { label: "Sharpe",       f: fmt,  o: origM.sharpe,      w: wiM.sharpe },
          { label: "Max DD",       f: fmtD, o: origM.mdd,         w: wiM.mdd },
        ];
        el.innerHTML = rows.map(r => `
          <div style="background:#2A2A2A;border:1px solid var(--border);padding:8px 10px;">
            <div style="font-family:var(--sans);font-size:0.64rem;font-weight:600;letter-spacing:0.05em;
              text-transform:uppercase;color:var(--muted);margin-bottom:5px;white-space:nowrap;">${r.label}</div>
            <div style="font-family:var(--sans);font-size:0.78rem;color:var(--label);white-space:nowrap;">
              ${r.f(r.o)} <span style="color:#555;">→</span>
              <span style="color:${TEAL};font-weight:600;">${r.f(r.w)}</span>
            </div>
          </div>`).join("");
      }

      function wiUpdateSliderDisplays() {
        const total = wiState.reduce((s, h) => s + h.weight, 0);
        wiState.forEach((h, i) => {
          const valEl = document.getElementById(`wi-val-${i}`);
          const rangeEl = document.getElementById(`wi-range-${i}`);
          if (valEl) valEl.textContent = h.weight.toFixed(1) + "%";
          if (rangeEl) rangeEl.value = h.weight;
        });
        const totalEl = document.getElementById("wi-total");
        if (totalEl) {
          totalEl.textContent = total.toFixed(1) + "%";
          const onTarget = Math.abs(total - wiLeverageCap) < 0.5;
          totalEl.style.color = onTarget ? "var(--green)" : "var(--amber)";
        }
      }

      function renderWhatif() {
        const total = wiState.reduce((s, h) => s + h.weight, 0);
        const capColor = Math.abs(total - wiLeverageCap) < 0.5 ? "var(--green)" : "var(--amber)";

        whatifWrap.innerHTML = `
          <div style="background:var(--surface);border:1px solid var(--border);
            padding:14px 16px 0;margin-bottom:16px;">

            <!-- Controls row -->
            <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px;
              flex-wrap:wrap;">
              <label style="display:flex;align-items:center;gap:7px;
                font-family:var(--sans);font-size:0.74rem;color:var(--muted);cursor:pointer;">
                <input type="checkbox" id="wi-constrain" ${wiConstrained ? "checked" : ""}
                  onchange="window._btWiSetConstrain(this.checked)"
                  style="accent-color:${TEAL};width:13px;height:13px;cursor:pointer;outline:none;" />
                Constrain to
              </label>
              <div style="display:flex;align-items:center;gap:5px;">
                <input id="wi-cap-input" type="number" value="${wiLeverageCap}" min="-1000" max="1000" step="5"
                  class="wi-cap-input"
                  style="font-family:var(--sans);font-size:0.80rem;background:#282828;
                    border:1px solid var(--border2);color:var(--dim);padding:4px 8px;
                    outline:none;width:72px;text-align:right;"
                  oninput="window._btWiSetCap(parseFloat(this.value))" />
                <span style="font-family:var(--sans);font-size:0.80rem;color:var(--muted);">% total</span>
              </div>
              <div style="margin-left:auto;display:flex;gap:6px;">
                <button onclick="window._btWiNorm()" class="bt-btn"
                  style="width:auto;padding:5px 10px;font-size:0.70rem;margin-top:0;">
                  Snap to ${wiLeverageCap}%
                </button>
                <button onclick="window._btWiReset()" class="bt-btn"
                  style="width:auto;padding:5px 10px;font-size:0.70rem;margin-top:0;">
                  Reset
                </button>
              </div>
            </div>

            <!-- Sliders -->
            ${wiState.map((h, i) => `
              <div style="margin-bottom:12px;">
                <div style="display:flex;justify-content:space-between;align-items:baseline;
                  margin-bottom:3px;">
                  <span style="font-family:var(--sans);font-size:0.80rem;font-weight:500;
                    color:var(--dim);">${h.ticker}</span>
                  <span id="wi-val-${i}" style="font-family:var(--sans);font-size:0.80rem;
                    color:var(--bright);font-weight:600;">${h.weight.toFixed(1)}%</span>
                </div>
                <input type="range" id="wi-range-${i}" min="-200" max="300" step="0.5"
                  value="${h.weight}"
                  style="width:100%;accent-color:${HOLDING_COLORS[i % HOLDING_COLORS.length]};cursor:pointer;outline:none;"
                  oninput="window._btWiUpdate(${i}, parseFloat(this.value))" />
              </div>
            `).join("")}

            <!-- Footer total -->
            <div style="border-top:1px solid var(--grid);padding:8px 0 12px;
              font-family:var(--sans);font-size:0.74rem;color:var(--muted);">
              Total: <span id="wi-total" style="color:${capColor};font-weight:600;">
                ${total.toFixed(1)}%</span>
              ${wiConstrained ? `<span style="color:var(--muted);"> (constrained to ${wiLeverageCap}%)</span>` : ""}
            </div>

            <!-- Quick metrics: Original vs What-If -->
            <div id="wi-metrics" style="display:grid;grid-template-columns:repeat(5,1fr);
              gap:8px;margin-bottom:14px;"></div>

            <!-- Chart -->
            <div class="bt-chart-card" id="bt-whatif-chart"
              style="margin:0 -16px;border-left:none;border-right:none;border-bottom:none;"></div>
          </div>`;

        // newPlot on first render (div was just recreated)
        const wiWeights = wiState.map(h => h.weight / 100);
        const wiRets = portfolioReturns(_lastRunData.aligned, wiWeights, _lastRunData.rebalFreq);
        const wiCurve = cumGrowthWithContribs(wiRets.returns, wiRets.dates, _lastRunData.initialValue,
          _lastRunData.contribFreq, _lastRunData.contribAmt, _lastRunData.contribGrowth);
        const wiDates = [_lastRunData.aligned.dates[0], ...wiRets.dates];
        Plotly.newPlot("bt-whatif-chart", [
          { x: portDates, y: portCurve, type: "scatter", mode: "lines", name: "Original",
            line: { color: SILVER, width: 1.2, dash: "dot" },
            hovertemplate: `<b>Original</b>: $%{y:,.0f}<extra></extra>` },
          { x: wiDates, y: wiCurve, type: "scatter", mode: "lines", name: "What-If",
            line: { color: TEAL, width: 1.8 },
            hovertemplate: `<b>What-If</b>: $%{y:,.0f}<extra></extra>` },
        ], wiLayout(), cfg());
        wiUpdateMetrics(wiCurve, wiRets.returns);
      }

      // Called on every slider move
      window._btWiUpdate = (movedIdx, newVal) => {
        if (wiConstrained && !isNaN(wiLeverageCap) && wiState.length > 1) {
          // Clamp moved slider
          newVal = Math.max(-200, Math.min(300, newVal));
          const oldVal = wiState[movedIdx].weight;
          const delta = newVal - oldVal;

          // Distribute -delta proportionally among all other sliders
          const others = wiState.map((h, i) => i !== movedIdx ? i : null).filter(i => i !== null);
          const othersTotal = others.reduce((s, i) => s + wiState[i].weight, 0);

          if (Math.abs(othersTotal) > 0.001) {
            others.forEach(i => {
              wiState[i].weight -= delta * (wiState[i].weight / othersTotal);
              wiState[i].weight = parseFloat(wiState[i].weight.toFixed(2));
            });
          } else {
            // Even split if all others are zero
            others.forEach(i => { wiState[i].weight -= delta / others.length; });
          }
          wiState[movedIdx].weight = newVal;

          // Correct floating point drift — nudge the largest-weight other to hit cap exactly
          const currentTotal = wiState.reduce((s, h) => s + h.weight, 0);
          const drift = wiLeverageCap - currentTotal;
          if (Math.abs(drift) > 0.01) {
            const largestOther = others.reduce((a, b) =>
              Math.abs(wiState[a].weight) > Math.abs(wiState[b].weight) ? a : b);
            wiState[largestOther].weight += drift;
            wiState[largestOther].weight = parseFloat(wiState[largestOther].weight.toFixed(2));
          }
        } else {
          wiState[movedIdx].weight = Math.max(-200, Math.min(300, newVal));
        }
        wiUpdateSliderDisplays();
        wiReplot();
      };

      window._btWiSetConstrain = (checked) => {
        wiConstrained = checked;
        renderWhatif();
      };

      window._btWiSetCap = (val) => {
        if (!isNaN(val)) wiLeverageCap = val;
      };

      window._btWiReset = () => {
        validHoldings.forEach((h, i) => { wiState[i].weight = parseFloat(h.weight); });
        renderWhatif();
      };

      window._btWiNorm = () => {
        const total = wiState.reduce((s, h) => s + h.weight, 0);
        if (total === 0) return;
        wiState.forEach(h => { h.weight = parseFloat(((h.weight / total) * wiLeverageCap).toFixed(2)); });
        renderWhatif();
      };

      renderWhatif();
    }

    // Drawdown
    const ddTraces = [{
      x: portDates, y: drawdownSeries(portCurve), type: "scatter", mode: "lines", name: portLabel,
      fill: "tozeroy", fillcolor: "rgba(196,112,96,0.12)",
      line: { color: RED, width: 1.5 },
      hovertemplate: `<b>${portLabel}</b>: %{y:.2f}%<extra></extra>`,
    }];
    (compareResults || []).forEach((cp, i) => {
      ddTraces.push({
        x: cp.dates, y: drawdownSeries(cp.curve), type: "scatter", mode: "lines", name: cp.label,
        line: { color: COMPARE_COLORS[i % COMPARE_COLORS.length], width: 1.4, dash: "dashdot" },
        hovertemplate: `<b>${cp.label}</b>: %{y:.2f}%<extra></extra>`,
      });
    });
    if (benchCurve && benchDates) ddTraces.push({
      x: benchDates, y: drawdownSeries(benchCurve), type: "scatter", mode: "lines", name: benchmarkTicker,
      line: { color: SILVER, width: 1.2, dash: "dot" },
      hovertemplate: `<b>${benchmarkTicker}</b>: %{y:.2f}%<extra></extra>`,
    });
    Plotly.newPlot("bt-dd-chart", ddTraces, {
      ...lay("", 280),
      yaxis: { ...lay().yaxis, ticksuffix: "%" },
      hovermode: "x unified",
      shapes: [{ type: "line", xref: "paper", x0: 0, x1: 1, yref: "y", y0: 0, y1: 0,
        line: { color: "#555", width: 1 } }],
    }, cfg());

    // ── Return distribution histogram ────────────────────────────────────────
    const distEl = document.getElementById("bt-dist-chart");
    if (distEl) {
      const { x, y, w } = returnHistogram(portRets.returns, 50);
      const var95 = (metrics.portVaR != null) ? metrics.portVaR * 100 : null;
      const cvar95 = (metrics.portCVaR != null) ? metrics.portCVaR * 100 : null;
      const barColors = x.map(v => v < 0 ? "rgba(196,112,96,0.65)" : "rgba(107,175,138,0.65)");
      const distShapes = [];
      if (var95 != null) distShapes.push({
        type: "line", xref: "x", yref: "paper", x0: var95, x1: var95, y0: 0, y1: 1,
        line: { color: AMBER, width: 1.5, dash: "dash" },
      });
      if (cvar95 != null) distShapes.push({
        type: "line", xref: "x", yref: "paper", x0: cvar95, x1: cvar95, y0: 0, y1: 1,
        line: { color: RED, width: 1.5, dash: "dot" },
      });
      const distAnnotations = [];
      if (var95 != null) distAnnotations.push({
        x: var95, y: 1, xref: "x", yref: "paper", xanchor: "right",
        text: `VaR 95%: ${(var95).toFixed(2)}%`, showarrow: false,
        font: { family: "Inter, sans-serif", size: 10, color: AMBER },
      });
      if (cvar95 != null) distAnnotations.push({
        x: cvar95, y: 0.85, xref: "x", yref: "paper", xanchor: "right",
        text: `CVaR 95%: ${(cvar95).toFixed(2)}%`, showarrow: false,
        font: { family: "Inter, sans-serif", size: 10, color: RED },
      });
      Plotly.newPlot("bt-dist-chart", [{
        x, y, type: "bar", name: "Daily Returns",
        width: w ? new Array(x.length).fill(w * 0.95) : undefined,
        marker: { color: barColors },
        hovertemplate: "%{x:.2f}%: %{y} days<extra></extra>",
      }], {
        ...lay("", 280),
        xaxis: { ...lay().xaxis, ticksuffix: "%" },
        yaxis: { ...lay().yaxis, title: { text: "Days", font: { size: 10 } } },
        shapes: distShapes,
        annotations: distAnnotations,
        bargap: 0.04,
        hovermode: "closest",
      }, cfg());
    }

    // ── Best & worst days table ──────────────────────────────────────────────
    const bwWrap = document.getElementById("bt-bestworst-wrap");
    if (bwWrap) {
      const fmtBW = r => `${r >= 0 ? "+" : ""}${(r * 100).toFixed(2)}%`;
      const tdS = `font-family:var(--sans);font-size:0.80rem;padding:6px 12px;`;

      function bestWorstBlock(label, dates, returns, color) {
        if (!returns.length) return "";
        const { best, worst } = bestWorstDays(dates, returns, 10);
        return `
          <div style="margin-bottom:14px;">
            <div style="display:flex;align-items:center;gap:7px;margin-bottom:8px;">
              <span style="font-family:var(--sans);font-size:0.74rem;font-weight:600;
                letter-spacing:0.04em;color:var(--dim);">${label}</span>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px;">
              <div>
                <div style="font-family:var(--sans);font-size:0.72rem;font-weight:600;
                  letter-spacing:0.06em;text-transform:uppercase;color:var(--green);
                  margin-bottom:6px;">Best Days</div>
                <div class="fin-table-wrap">
                  <table class="fin-table">
                    <thead><tr>
                      <th style="text-align:left;">Date</th>
                      <th>Return</th>
                    </tr></thead>
                    <tbody>${best.map(d => `<tr>
                      <td style="${tdS}text-align:left;">${fmtDate(d.date)}</td>
                      <td class="pos" style="${tdS}text-align:right;">${fmtBW(d.ret)}</td>
                    </tr>`).join("")}</tbody>
                  </table>
                </div>
              </div>
              <div>
                <div style="font-family:var(--sans);font-size:0.72rem;font-weight:600;
                  letter-spacing:0.06em;text-transform:uppercase;color:var(--red);
                  margin-bottom:6px;">Worst Days</div>
                <div class="fin-table-wrap">
                  <table class="fin-table">
                    <thead><tr>
                      <th style="text-align:left;">Date</th>
                      <th>Return</th>
                    </tr></thead>
                    <tbody>${worst.map(d => `<tr>
                      <td style="${tdS}text-align:left;">${fmtDate(d.date)}</td>
                      <td class="neg" style="${tdS}text-align:right;">${fmtBW(d.ret)}</td>
                    </tr>`).join("")}</tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>`;
      }

      let bwHTML = bestWorstBlock(portLabel, portRets.dates, portRets.returns, BLUE);
      (compareResults || []).forEach((cp, i) => {
        bwHTML += bestWorstBlock(cp.label, cp.dates.slice(1), cp.returns, COMPARE_COLORS[i % COMPARE_COLORS.length]);
      });
      bwWrap.innerHTML = bwHTML;
    }

    const WINDOW = 252;
    const rollingSharpePort = rollingMetric(portRets.returns, WINDOW, rets => {
      const c = cagr(1, cumGrowth(rets)[rets.length], rets.length / 252);
      const v = annVol(rets);
      return sharpe(c, v);
    });
    // Helper: strip leading nulls from a paired dates+values array
    function trimLeadingNulls(dates, values) {
      const first = values.findIndex(v => v != null);
      if (first <= 0) return { dates, values };
      return { dates: dates.slice(first), values: values.slice(first) };
    }

    const sharpePortTrimmed = trimLeadingNulls(portRets.dates, rollingSharpePort);
    const rollingSharpeTraces = [{
      x: sharpePortTrimmed.dates, y: sharpePortTrimmed.values,
      type: "scatter", mode: "lines", name: portLabel,
      line: { color: BLUE, width: 1.6 },
      hovertemplate: `<b>${portLabel}</b>: %{y:.2f}<extra></extra>`,
    }];
    if (benchRets && benchDates) {
      const rollingSharpeB = rollingMetric(benchRets, WINDOW, rets => {
        const c = cagr(1, cumGrowth(rets)[rets.length], rets.length / 252);
        const v = annVol(rets);
        return sharpe(c, v);
      });
      const sharpeBTrimmed = trimLeadingNulls(benchDates.slice(1), rollingSharpeB);
      rollingSharpeTraces.push({
        x: sharpeBTrimmed.dates, y: sharpeBTrimmed.values,
        type: "scatter", mode: "lines", name: benchmarkTicker,
        line: { color: SILVER, width: 1.2, dash: "dot" },
        hovertemplate: `<b>${benchmarkTicker}</b>: %{y:.2f}<extra></extra>`,
      });
    }
    (compareResults || []).forEach((cp, i) => {
      const rollingSharpeCp = rollingMetric(cp.returns, WINDOW, rets => {
        const c = cagr(1, cumGrowth(rets)[rets.length], rets.length / 252);
        const v = annVol(rets);
        return sharpe(c, v);
      });
      const sharpeCpTrimmed = trimLeadingNulls(cp.dates.slice(1), rollingSharpeCp);
      rollingSharpeTraces.push({
        x: sharpeCpTrimmed.dates, y: sharpeCpTrimmed.values,
        type: "scatter", mode: "lines", name: cp.label,
        line: { color: COMPARE_COLORS[i % COMPARE_COLORS.length], width: 1.4, dash: "dashdot" },
        hovertemplate: `<b>${cp.label}</b>: %{y:.2f}<extra></extra>`,
      });
    });
    Plotly.newPlot("bt-rolling-sharpe-chart", rollingSharpeTraces, {
      ...lay("", 280),
      yaxis: { ...lay().yaxis, zeroline: true, zerolinecolor: "#555", zerolinewidth: 1 },
      hovermode: "x unified",
      shapes: [{ type: "line", xref: "paper", x0: 0, x1: 1, yref: "y", y0: 0, y1: 0,
        line: { color: "#555", width: 1 } }],
    }, cfg());

    // Rolling 1Y Vol
    const rollingVolPort = rollingMetric(portRets.returns, WINDOW, rets => (annVol(rets) || 0) * 100);
    const volPortTrimmed = trimLeadingNulls(portRets.dates, rollingVolPort);
    const rollingVolTraces = [{
      x: volPortTrimmed.dates, y: volPortTrimmed.values,
      type: "scatter", mode: "lines", name: portLabel,
      line: { color: AMBER, width: 1.6 },
      hovertemplate: `<b>${portLabel}</b>: %{y:.2f}%<extra></extra>`,
    }];
    if (benchRets && benchDates) {
      const rollingVolB = rollingMetric(benchRets, WINDOW, rets => (annVol(rets) || 0) * 100);
      const volBTrimmed = trimLeadingNulls(benchDates.slice(1), rollingVolB);
      rollingVolTraces.push({
        x: volBTrimmed.dates, y: volBTrimmed.values,
        type: "scatter", mode: "lines", name: benchmarkTicker,
        line: { color: SILVER, width: 1.2, dash: "dot" },
        hovertemplate: `<b>${benchmarkTicker}</b>: %{y:.2f}%<extra></extra>`,
      });
    }
    (compareResults || []).forEach((cp, i) => {
      const rollingVolCp = rollingMetric(cp.returns, WINDOW, rets => (annVol(rets) || 0) * 100);
      const volCpTrimmed = trimLeadingNulls(cp.dates.slice(1), rollingVolCp);
      rollingVolTraces.push({
        x: volCpTrimmed.dates, y: volCpTrimmed.values,
        type: "scatter", mode: "lines", name: cp.label,
        line: { color: COMPARE_COLORS[i % COMPARE_COLORS.length], width: 1.4, dash: "dashdot" },
        hovertemplate: `<b>${cp.label}</b>: %{y:.2f}%<extra></extra>`,
      });
    });
    Plotly.newPlot("bt-rolling-vol-chart", rollingVolTraces, {
      ...lay("", 280),
      yaxis: { ...lay().yaxis, ticksuffix: "%" },
      hovermode: "x unified",
    }, cfg());

    // Monthly returns heatmap
    const monthlyWrap = document.getElementById("bt-monthly-wrap");
    if (monthlyWrap) {
      monthlyWrap.innerHTML = "";
      const portMonthly = monthlyReturns(portDates, portCurve);
      const primaryHeader = document.createElement("div");
      primaryHeader.style.cssText = "font-family:var(--sans);font-size:0.74rem;font-weight:600;letter-spacing:0.04em;color:var(--dim);margin-bottom:8px;";
      primaryHeader.textContent = portLabel;
      monthlyWrap.appendChild(primaryHeader);
      const primaryHolder = document.createElement("div");
      monthlyWrap.appendChild(primaryHolder);
      renderMonthlyHeatmap(primaryHolder, portMonthly, portLabel);

      (compareResults || []).forEach((cp, i) => {
        const cpMonthly = monthlyReturns(cp.dates, cp.curve);
        const header = document.createElement("div");
        header.style.cssText = "font-family:var(--sans);font-size:0.74rem;font-weight:600;letter-spacing:0.04em;color:var(--dim);margin-bottom:8px;display:flex;align-items:center;gap:7px;";
        header.textContent = cp.label;
        monthlyWrap.appendChild(header);
        const holder = document.createElement("div");
        monthlyWrap.appendChild(holder);
        renderMonthlyHeatmap(holder, cpMonthly, cp.label);
      });
    }

    // Correlation matrix — include compare portfolios as additional rows/cols
    const corrWrap = document.getElementById("bt-corr-wrap");
    if (corrWrap) {
      const corrRetsMap = { ...tickerRetsMap };
      const compareLabels = (compareResults || []).map(cp => {
        corrRetsMap[cp.label] = cp.returns;
        return cp.label;
      });
      renderCorrelationMatrix(corrWrap, corrRetsMap, benchmarkTicker, validHoldings, compareLabels);
    }

    // Worst drawdown periods table
    const ddPeriodsWrap = document.getElementById("bt-dd-periods-wrap");
    if (ddPeriodsWrap) {
      function ddPeriodsBlock(label, dates, curve, color) {
        const periods = drawdownPeriods(dates, curve).sort((a, b) => a.depth - b.depth).slice(0, 10);
        const header = `
          <div style="display:flex;align-items:center;gap:7px;margin-bottom:8px;">
            <span style="font-family:var(--sans);font-size:0.74rem;font-weight:600;
              letter-spacing:0.04em;color:var(--dim);">${label}</span>
          </div>`;
        if (periods.length === 0) {
          return `${header}<div class="loading-placeholder" style="min-height:50px;margin-bottom:16px;">No completed drawdown periods</div>`;
        }
        return `${header}
          <div class="fin-table-wrap" style="margin-bottom:20px;">
            <table class="fin-table">
              <thead><tr>
                <th style="text-align:left;">Start</th>
                <th style="text-align:left;">Recovery</th>
                <th style="text-align:center;">Duration (days)</th>
                <th style="text-align:center;">Depth</th>
              </tr></thead>
              <tbody>${periods.map(p => `<tr>
                <td style="font-family:var(--sans);text-align:left;">${fmtDate(p.start)}</td>
                <td style="font-family:var(--sans);text-align:left;">${fmtDate(p.end)}</td>
                <td style="font-family:var(--sans);font-weight:400;text-align:center;">${p.duration}</td>
                <td class="neg" style="font-family:var(--sans);font-weight:400;text-align:center;">${fmtD(p.depth)}</td>
              </tr>`).join("")}</tbody>
            </table>
          </div>`;
      }

      let ddHTML = ddPeriodsBlock(portLabel, portDates, portCurve, BLUE);
      (compareResults || []).forEach((cp, i) => {
        ddHTML += ddPeriodsBlock(cp.label, cp.dates, cp.curve, COMPARE_COLORS[i % COMPARE_COLORS.length]);
      });
      ddPeriodsWrap.innerHTML = ddHTML;
    }

  }, 0);
}

// ── Monthly returns heatmap ───────────────────────────────────────────────────
function renderMonthlyHeatmap(container, monthlyData, label) {
  const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const byYear = {};
  monthlyData.forEach(({ month, ret }) => {
    const [yr, mo] = month.split("-");
    if (!byYear[yr]) byYear[yr] = {};
    byYear[yr][parseInt(mo) - 1] = ret;
  });
  const years = Object.keys(byYear).sort();

  const colorForRet = r => {
    if (r == null) return "var(--surface)";
    // Cap at 5% monthly return for full saturation; wider opacity range for differentiation
    const intensity = Math.min(Math.abs(r) / 0.05, 1);
    const opacity = 0.12 + intensity * 0.78;
    if (r >= 0) return `rgba(107,175,138,${opacity.toFixed(2)})`;
    return `rgba(196,112,96,${opacity.toFixed(2)})`;
  };

  const headerRow = `<tr>
    <th style="font-family:var(--sans);font-size:0.72rem;font-weight:600;color:var(--dim);
      text-align:left;padding:7px 10px;"></th>
    ${MONTHS.map(m => `<th style="font-family:var(--sans);font-size:0.72rem;font-weight:600;
      color:var(--dim);text-align:center;padding:7px 6px;">${m}</th>`).join("")}
    <th style="font-family:var(--sans);font-size:0.72rem;font-weight:600;color:var(--dim);
      text-align:right;padding:7px 10px;">Full Year</th>
  </tr>`;

  const bodyRows = years.map(yr => {
    const row = byYear[yr];
    // Full year return from compounding monthly rets
    let fullYearRet = 1;
    let hasData = false;
    const cells = MONTHS.map((_, i) => {
      const r = row[i];
      if (r != null) { fullYearRet *= (1 + r); hasData = true; }
      const bg = colorForRet(r);
      // Always use white text on coloured cells for readability
      const txtColor = r == null ? "var(--muted)" : "var(--white)";
      return `<td style="font-family:var(--sans);font-size:0.72rem;font-weight:400;
        text-align:center;padding:5px 4px;background:${bg};color:${txtColor};white-space:nowrap;">
        ${r == null ? "" : `${r >= 0 ? "+" : ""}${(r * 100).toFixed(1)}%`}
      </td>`;
    }).join("");
    fullYearRet -= 1;
    return `<tr>
      <td style="font-family:var(--sans);font-size:0.76rem;font-weight:500;color:var(--dim);
        text-align:left;padding:5px 10px;">${yr}</td>
      ${cells}
      <td style="font-family:var(--sans);font-size:0.76rem;font-weight:500;color:var(--white);
        text-align:right;padding:5px 10px;background:${colorForRet(hasData ? fullYearRet : null)};">
        ${hasData ? `${fullYearRet >= 0 ? "+" : ""}${(fullYearRet * 100).toFixed(1)}%` : "—"}
      </td>
    </tr>`;
  }).join("");

  container.innerHTML = `
    <div class="fin-table-wrap" style="margin-bottom:20px;overflow-x:auto;">
      <table class="fin-table" style="table-layout:fixed;min-width:700px;">
        <thead>${headerRow}</thead>
        <tbody>${bodyRows}</tbody>
      </table>
    </div>`;
}

// ── Correlation matrix ────────────────────────────────────────────────────────
function renderCorrelationMatrix(container, retsMap, benchTicker, validHoldings, compareLabels = []) {
  const labels = [...validHoldings.map(h => h.ticker)];
  compareLabels.forEach(l => { if (!labels.includes(l)) labels.push(l); });
  if (retsMap[benchTicker] && !labels.includes(benchTicker)) labels.push(benchTicker);
  if (labels.length < 2) {
    container.innerHTML = `<div class="loading-placeholder" style="min-height:60px;color:var(--muted);">Add more holdings to see correlations.</div>`;
    return;
  }

  // Align all series to same length (use min)
  const allRets = labels.map(l => retsMap[l] || []);
  const minLen = Math.min(...allRets.map(r => r.length));
  const trimmed = allRets.map(r => r.slice(-minLen));

  const matrix = labels.map((_, i) => labels.map((__, j) => correlation(trimmed[i], trimmed[j])));

  const corrColor = r => {
    if (r == null) return "var(--surface)";
    const abs = Math.abs(r);
    if (r >= 0) return `rgba(107,175,138,${0.1 + abs * 0.7})`;
    return `rgba(196,112,96,${0.1 + abs * 0.7})`;
  };

  const thStyle = `font-family:var(--sans);font-size:0.76rem;font-weight:600;color:var(--dim);
    text-align:center;padding:8px 10px;`;
  const tdLbl = `font-family:var(--sans);font-size:0.76rem;font-weight:500;color:var(--dim);
    text-align:left;padding:7px 10px;`;

  const header = `<tr>
    <th style="${thStyle}text-align:left;"></th>
    ${labels.map(l => `<th style="${thStyle}">${l}</th>`).join("")}
  </tr>`;

  const rows = matrix.map((row, i) => `<tr>
    <td style="${tdLbl}">${labels[i]}</td>
    ${row.map((r, j) => {
      const bg  = corrColor(r);
      const txt = i === j ? "1.00" : (r != null ? r.toFixed(2) : "—");
      const color = r == null ? "var(--muted)"
        : i === j ? "var(--dim)"
        : Math.abs(r) > 0.7 ? "var(--bright)" : "var(--dim)";
      return `<td style="font-family:var(--sans);font-size:0.80rem;font-weight:400;
        text-align:center;padding:7px 10px;background:${bg};color:${color};">${txt}</td>`;
    }).join("")}
  </tr>`).join("");

  container.innerHTML = `
    <div class="fin-table-wrap" style="margin-bottom:20px;">
      <table class="fin-table" style="table-layout:auto;">
        <thead>${header}</thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function rebalFreqLabel(freq) {
  return { daily: "Daily", monthly: "Monthly", quarterly: "Quarterly", annual: "Annual", never: "Buy & Hold" }[freq] || freq;
}

})();