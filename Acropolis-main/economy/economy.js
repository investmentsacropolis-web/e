(function () {
// ── Acropolis Economics — economics.js ───────────────────────────────────────
// Shared globals (C, PALETTE, recessionShapes, withRecessions, FRED_BASE) are
// provided by components/plotly-utils.js and components/fred.js, which are
// loaded before this file in index.html. Do not redeclare them here.

// ── FOMC Meeting Calendar ─────────────────────────────────────────────────────
// Real scheduled FOMC decision dates (2nd day of each 2-day meeting), sourced
// from federalreserve.gov/monetarypolicy/fomccalendars.htm. 2027 dates are the
// Fed's own pre-announced (tentative) schedule. Replaces the old placeholder
// that just added +45/+90/+135/... days to "today".
const FOMC_MEETINGS = [
  { date: "2026-01-28", sep: false },
  { date: "2026-03-18", sep: true  },
  { date: "2026-04-29", sep: false },
  { date: "2026-06-17", sep: true  },
  { date: "2026-07-29", sep: false },
  { date: "2026-09-16", sep: true  },
  { date: "2026-10-28", sep: false },
  { date: "2026-12-09", sep: true  },
  { date: "2027-01-27", sep: false },
  { date: "2027-03-17", sep: true  },
  { date: "2027-04-28", sep: false },
  { date: "2027-06-09", sep: true  },
];

// ── Key Economic Data Release Calendar ───────────────────────────────────────
// Official release dates from bls.gov/schedule and bea.gov/news/schedule
// (release times are ET). Used by the Calendar page. Past dates are kept too
// (harmless — the page filters to upcoming) so this can be extended in place.
const CALENDAR_EVENTS = [
  // ── Employment Situation (BLS) ──
  { date: "2026-07-02", type: "jobs",      title: "Employment Situation",     period: "June 2026" },
  { date: "2026-08-07", type: "jobs",      title: "Employment Situation",     period: "July 2026" },
  { date: "2026-09-04", type: "jobs",      title: "Employment Situation",     period: "Aug 2026" },
  { date: "2026-10-02", type: "jobs",      title: "Employment Situation",     period: "Sep 2026" },
  { date: "2026-11-06", type: "jobs",      title: "Employment Situation",     period: "Oct 2026" },
  { date: "2026-12-04", type: "jobs",      title: "Employment Situation",     period: "Nov 2026" },
  // ── CPI (BLS) ──
  { date: "2026-07-14", type: "inflation", title: "Consumer Price Index",     period: "June 2026" },
  { date: "2026-08-12", type: "inflation", title: "Consumer Price Index",     period: "July 2026" },
  { date: "2026-09-11", type: "inflation", title: "Consumer Price Index",     period: "Aug 2026" },
  { date: "2026-10-14", type: "inflation", title: "Consumer Price Index",     period: "Sep 2026" },
  { date: "2026-11-10", type: "inflation", title: "Consumer Price Index",     period: "Oct 2026" },
  { date: "2026-12-10", type: "inflation", title: "Consumer Price Index",     period: "Nov 2026" },
  // ── PPI (BLS) ──
  { date: "2026-07-15", type: "inflation", title: "Producer Price Index",     period: "June 2026" },
  { date: "2026-08-13", type: "inflation", title: "Producer Price Index",     period: "July 2026" },
  { date: "2026-09-10", type: "inflation", title: "Producer Price Index",     period: "Aug 2026" },
  { date: "2026-10-15", type: "inflation", title: "Producer Price Index",     period: "Sep 2026" },
  { date: "2026-11-13", type: "inflation", title: "Producer Price Index",     period: "Oct 2026" },
  { date: "2026-12-15", type: "inflation", title: "Producer Price Index",     period: "Nov 2026" },
  // ── GDP (BEA) ──
  { date: "2026-07-30", type: "gdp",       title: "GDP — Advance Estimate",   period: "Q2 2026" },
  { date: "2026-08-26", type: "gdp",       title: "GDP — Second Estimate",    period: "Q2 2026" },
  { date: "2026-09-30", type: "gdp",       title: "GDP — Third Estimate",     period: "Q2 2026" },
  { date: "2026-10-29", type: "gdp",       title: "GDP — Advance Estimate",   period: "Q3 2026" },
  { date: "2026-11-25", type: "gdp",       title: "GDP — Second Estimate",    period: "Q3 2026" },
  { date: "2026-12-23", type: "gdp",       title: "GDP — Third Estimate",     period: "Q3 2026" },
  // ── Personal Income & Outlays / PCE (BEA) ──
  { date: "2026-07-30", type: "pce",       title: "Personal Income & PCE",    period: "June 2026" },
  { date: "2026-08-26", type: "pce",       title: "Personal Income & PCE",    period: "July 2026" },
  { date: "2026-09-30", type: "pce",       title: "Personal Income & PCE",    period: "Aug 2026" },
  { date: "2026-10-29", type: "pce",       title: "Personal Income & PCE",    period: "Sep 2026" },
  { date: "2026-11-25", type: "pce",       title: "Personal Income & PCE",    period: "Oct 2026" },
  { date: "2026-12-23", type: "pce",       title: "Personal Income & PCE",    period: "Nov 2026" },
  // ── Trade Balance (BEA) ──
  { date: "2026-07-07", type: "trade",     title: "Trade in Goods & Services",period: "May 2026" },
  { date: "2026-08-04", type: "trade",     title: "Trade in Goods & Services",period: "June 2026" },
  { date: "2026-09-03", type: "trade",     title: "Trade in Goods & Services",period: "July 2026" },
  { date: "2026-10-06", type: "trade",     title: "Trade in Goods & Services",period: "Aug 2026" },
  { date: "2026-11-04", type: "trade",     title: "Trade in Goods & Services",period: "Sep 2026" },
  { date: "2026-12-08", type: "trade",     title: "Trade in Goods & Services",period: "Oct 2026" },
  // ── FOMC decisions (mirrors FOMC_MEETINGS, tagged for the Calendar page) ──
  ...FOMC_MEETINGS.map(m => ({ date: m.date, type: "fomc", title: m.sep ? "FOMC Decision + SEP / Dot Plot" : "FOMC Decision", period: "" })),
];

const EVENT_META = {
  fomc:      { label: "FOMC",  color: "#C47060" },
  jobs:      { label: "JOBS",  color: "#6B9EC4" },
  inflation: { label: "PRICES",color: "#C4A84A" },
  gdp:       { label: "GDP",   color: "#6BAF8A" },
  pce:       { label: "PCE",   color: "#9B80C4" },
  trade:     { label: "TRADE", color: "#C8C8C8" },
};

// Market-importance rating per event, used to drive the pip indicator on the
// Calendar page. Based on typical market sensitivity to each release type —
// FOMC decisions and the headline jobs/CPI reports move markets the most;
// later GDP/PCE revisions and the trade balance tend to be lower-impact.
const IMPORTANCE_META = {
  high:   { pips: 3, color: C.red,   label: "High"   },
  medium: { pips: 2, color: C.amber, label: "Medium" },
  low:    { pips: 1, color: "#6C6C6C",label: "Low"    },
};

function eventImportance(e) {
  switch (e.type) {
    case "fomc":      return "high";
    case "jobs":      return "high";
    case "inflation": return e.title.includes("Producer") ? "medium" : "high";
    case "gdp":       return e.title.includes("Advance") ? "high" : e.title.includes("Second") ? "medium" : "low";
    case "pce":       return "medium";
    case "trade":     return "low";
    default:          return "medium";
  }
}

function importancePips(level) {
  const m = IMPORTANCE_META[level] || IMPORTANCE_META.medium;
  const bars = Array.from({ length: 3 }, (_, i) =>
    `<span style="display:inline-block;width:5px;height:9px;margin-right:2px;background:${i < m.pips ? m.color : "var(--border2)"};"></span>`
  ).join("");
  return `<span title="${m.label} impact">${bars}</span>`;
}


const S = {
  GDP:                  "GDP",
  REAL_GDP:             "GDPC1",
  GDI:                  "GDI",
  INDUSTRIAL_PRODUCTION:"INDPRO",
  CAPACITY_UTILIZATION: "TCU",
  CPI:                  "CPIAUCSL",
  CORE_CPI:             "CPILFESL",
  PCE:                  "PCEPI",
  CORE_PCE:             "PCEPILFE",
  PPI:                  "PPIACO",
  IMPORT_PRICES:        "IR",
  EXPORT_PRICES:        "IQ",
  UNEMPLOYMENT_RATE:    "UNRATE",
  NONFARM_PAYROLLS:     "PAYEMS",
  EMPLOYMENT_LEVEL:     "CE16OV",
  LABOR_FORCE:          "CLF16OV",
  PARTICIPATION_RATE:   "CIVPART",
  EMP_POP_RATIO:        "EMRATIO",
  INITIAL_CLAIMS:       "ICSA",
  CONTINUING_CLAIMS:    "CCSA",
  AVG_HOURLY_EARNINGS:  "CES0500000003",
  AVG_WEEKLY_HOURS:     "AWHNONAG",
  JOLTS_OPENINGS:       "JTSJOL",
  JOLTS_HIRES:          "JTSHIL",
  JOLTS_QUITS:          "JTSQUL",
  RETAIL_SALES:         "RSAFS",
  PERSONAL_INCOME:      "PI",
  DISPOSABLE_INCOME:    "DPI",
  PCE_CONSUMPTION:      "PCEC96",
  PERSONAL_SAVING_RATE: "PSAVERT",
  CONSUMER_CREDIT:      "TOTALSL",
  HOUSING_STARTS:       "HOUST",
  BUILDING_PERMITS:     "PERMIT",
  NEW_HOME_SALES:       "HSN1F",
  EXISTING_HOME_SALES:  "EXHOSLUSM495S",
  CASE_SHILLER:         "CSUSHPISA",
  DURABLE_GOODS:        "DGORDER",
  FACTORY_ORDERS:       "FTD",
  INVENTORIES:          "BUSINV",
  WHOLESALE_INVENTORIES:"WHLSLRIMSA",
  M1:                   "M1SL",
  M2:                   "M2SL",
  MONETARY_BASE:        "BOGMBASE",
  COMMERCIAL_BANK_CREDIT:"TOTBKCR",
  FED_BALANCE_SHEET:    "WALCL",
  FED_FUNDS:            "FEDFUNDS",
  SOFR:                 "SOFR",
  TBILL_1M:             "DTB1",
  TBILL_3M:             "DTB3",
  TBILL_6M:             "DTB6",
  TBILL_1Y:             "DTB1YR",
  TREASURY_2Y:          "GS2",
  TREASURY_3Y:          "GS3",
  TREASURY_5Y:          "GS5",
  TREASURY_7Y:          "GS7",
  TREASURY_10Y:         "GS10",
  TREASURY_20Y:         "GS20",
  TREASURY_30Y:         "GS30",
  TRADE_BALANCE:        "BOPGSTB",
  EXPORTS:              "EXPGS",
  IMPORTS:              "IMPGS",
  DOLLAR_INDEX:         "DTWEXBGS",
  SP500:                "SP500",
  VIX:                  "VIXCLS",
  BAA_YIELD:            "BAA",
  AAA_YIELD:            "AAA",
  MORTGAGE_30Y:         "MORTGAGE30US",
};

// ── Cache ─────────────────────────────────────────────────────────────────────
const _cache = {};

async function fetchSeries(id, startDate = "2000-01-01") {
  const key = `${id}::${startDate}`;
  if (_cache[key]) return _cache[key];
  let result;
  if (id === "SP500") {
    const full = await fetchSP500FromYFinance();
    const idx = full.dates.findIndex(d => d >= startDate);
    const i0 = idx === -1 ? full.dates.length : idx;
    result = { dates: full.dates.slice(i0), values: full.values.slice(i0) };
  } else {
    const url = `${FRED_BASE}?series_id=${id}&observation_start=${startDate}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`FRED ${id}: ${res.status}`);
    const json = await res.json();
    const obs = (json.observations || []).filter(o => o.value !== ".");
    result = { dates: obs.map(o => o.date), values: obs.map(o => parseFloat(o.value)) };
  }
  _cache[key] = result;
  return result;
}

// ── S&P 500 — full history via yfinance (served by server.py /yfinance/) ──────
let _sp500FullPromise = null;
function fetchSP500FromYFinance() {
  if (!_sp500FullPromise) {
    _sp500FullPromise = (async () => {
      const res = await fetch("/yfinance/sp500?start=1950-01-01");
      if (!res.ok) throw new Error(`yfinance SP500: ${res.status}`);
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      return { dates: json.dates, values: json.values };
    })();
  }
  return _sp500FullPromise;
}

// Helper: check cache by logical name key (what render functions use)
function isCached(seriesId, range) {
  const fredCode = S[seriesId] || seriesId;
  return !!_cache[`${fredCode}::${startDate(range)}`];
}

const _startDateCache = {};
function startDate(range) {
  if (_startDateCache[range]) return _startDateCache[range];
  const now = new Date();
  const map = { "5Y": 5, "10Y": 10, "20Y": 20, "MAX": 80 };
  const yrs = map[range] || 10;
  now.setFullYear(now.getFullYear() - yrs);
  _startDateCache[range] = now.toISOString().slice(0, 10);
  return _startDateCache[range];
}

// ── Plotly layout factory ─────────────────────────────────────────────────────
function layout(title = "", height = 320) {
  return {
    title: {
      text: title.toUpperCase(),
      font: { family: "Inter, sans-serif", size: 11, color: C.title },
      x: 0.01, xanchor: "left", y: 1, yanchor: "top",
      pad: { t: 6, b: 0 },
    },
    paper_bgcolor: C.surface,
    plot_bgcolor:  C.surface,
    font: { family: "Inter, sans-serif", size: 11, color: C.tick },
    xaxis: {
      gridcolor: C.grid, showgrid: true, gridwidth: 1,
      tickfont: { size: 11, color: C.tick }, tickcolor: C.grid, linecolor: C.grid,
      autorange: true,
    },
    yaxis: {
      gridcolor: C.grid, showgrid: true, gridwidth: 1,
      tickfont: { size: 11, color: C.tick }, zeroline: false, linecolor: C.grid,
      autorange: true,
    },
    height,
    margin: { l: 64, r: 16, t: 68, b: 48 },
    legend: {
      bgcolor: "rgba(0,0,0,0)", bordercolor: "rgba(0,0,0,0)",
      font: { size: 11, color: C.tick },
      orientation: "h", yanchor: "bottom", y: 1.08, xanchor: "left", x: 0,
    },
    hoverlabel: {
      bgcolor: C.surface, bordercolor: C.grid,
      font: { family: "Inter, sans-serif", size: 11, color: C.hover },
    },
  };
}

function cfg() { return { displayModeBar: false, responsive: true }; }

// ── Chart helpers ─────────────────────────────────────────────────────────────
function lineSeries(dates, values, name, color, dash = "solid") {
  return {
    x: dates, y: values, type: "scatter", mode: "lines", name,
    line: { color, width: 1.8, dash },
    hovertemplate: `${name}: %{y:.2f}<extra></extra>`,
  };
}

// Use newPlot on first render (clears spinner), Plotly.react on subsequent (no flicker, no recursion)
function plotly(el, traces, layoutObj, configObj) {
  if (el._isPlotly) {
    return Plotly.react(el, traces, layoutObj, configObj);
  } else {
    el.innerHTML = "";
    el._isPlotly = true;
    return Plotly.newPlot(el, traces, layoutObj, configObj);
  }
}

async function renderLine(elId, seriesId, label, color, range, yLabel = "") {
  const el = document.getElementById(elId);
  if (!el) return;
  try {
    const d = await fetchSeries(S[seriesId] || seriesId, startDate(range));
    const l = withRecessions({ ...layout(label), yaxis: { ...layout().yaxis, title: { text: yLabel, font: { size: 11, color: C.tick } } } }, d.dates);
    plotly(el, [lineSeries(d.dates, d.values, label, color)], l, cfg());
  } catch (e) {
    el.innerHTML = `<div class="error-box">Failed to load ${label}: ${e.message}</div>`;
  }
}

// Like renderLine but divides values by a divisor (e.g. 1000 to convert B→T or M→T)
async function renderLineScaled(elId, seriesId, label, color, range, yLabel = "", divisor = 1) {
  const el = document.getElementById(elId);
  if (!el) return;
  try {
    const d = await fetchSeries(S[seriesId] || seriesId, startDate(range));
    const scaled = d.values.map(v => v / divisor);
    const l = withRecessions({ ...layout(label), yaxis: { ...layout().yaxis, title: { text: yLabel, font: { size: 11, color: C.tick } } } }, d.dates);
    plotly(el, [lineSeries(d.dates, scaled, label, color)], l, cfg());
  } catch (e) {
    el.innerHTML = `<div class="error-box">Failed to load ${label}: ${e.message}</div>`;
  }
}

async function renderMultiLine(elId, series, title, range, yLabel = "") {
  // series: [{id, label, color}]
  const el = document.getElementById(elId);
  if (!el) return;
  try {
    const traces = await Promise.all(series.map(async (s, i) => {
      const d = await fetchSeries(S[s.id] || s.id, startDate(range));
      return lineSeries(d.dates, d.values, s.label, s.color || PALETTE[i]);
    }));
    // Use dates from first series for recession bounds
    const firstDates = (await fetchSeries(S[series[0].id] || series[0].id, startDate(range))).dates;
    const l = withRecessions({ ...layout(title), yaxis: { ...layout().yaxis, title: { text: yLabel, font: { size: 11, color: C.tick } } } }, firstDates);
    plotly(el, traces, l, cfg());
  } catch (e) {
    el.innerHTML = `<div class="error-box">Failed: ${e.message}</div>`;
  }
}

// YoY % change helper
// Note: uses *nearest* date within a tolerance window, not an exact string
// match. Monthly/quarterly series land on the same day each period so exact
// matching happens to work for them, but weekly series (e.g. WALCL, bank
// credit) almost never fall on the same calendar date one year apart —
// exact matching silently produced zero output points for those.
function yoy(dates, values) {
  const outD = [], outV = [];
  const dateMap = {};
  dates.forEach((d, i) => dateMap[d] = i);
  const TOLERANCE_DAYS = 10;
  dates.forEach((d, i) => {
    const target = new Date(d);
    target.setFullYear(target.getFullYear() - 1);
    const targetKey = target.toISOString().slice(0, 10);
    let matchIdx;
    if (dateMap[targetKey] !== undefined) {
      matchIdx = dateMap[targetKey];
    } else {
      // Search outward day-by-day within tolerance for the nearest date present in the series
      for (let off = 1; off <= TOLERANCE_DAYS && matchIdx === undefined; off++) {
        for (const sign of [-1, 1]) {
          const probe = new Date(target);
          probe.setDate(probe.getDate() + sign * off);
          const probeKey = probe.toISOString().slice(0, 10);
          if (dateMap[probeKey] !== undefined) { matchIdx = dateMap[probeKey]; break; }
        }
      }
    }
    if (matchIdx !== undefined) {
      const pv = values[matchIdx];
      outD.push(d);
      outV.push(((values[i] - pv) / Math.abs(pv)) * 100);
    }
  });
  return { dates: outD, values: outV };
}

async function renderYoY(elId, seriesId, label, color, range) {
  const el = document.getElementById(elId);
  if (!el) return;
  try {
    // Fetch one extra year of history so the YoY calc has prior-year values
    // for the first data point in the requested range.
    const sd = startDate(range);
    const extraStart = new Date(sd);
    extraStart.setFullYear(extraStart.getFullYear() - 1);
    const extraStartStr = extraStart.toISOString().slice(0, 10);

    const d = await fetchSeries(S[seriesId] || seriesId, extraStartStr);
    const ch = yoy(d.dates, d.values);

    // Trim computed YoY to the requested range so the chart window is correct
    const trimIdx = ch.dates.findIndex(dt => dt >= sd);
    const trimDates  = trimIdx === -1 ? ch.dates  : ch.dates.slice(trimIdx);
    const trimValues = trimIdx === -1 ? ch.values : ch.values.slice(trimIdx);

    const trace = lineSeries(trimDates, trimValues, `${label} YoY %`, color);
    const l = withRecessions({
      ...layout(`${label} — Year-over-Year %`),
      yaxis: { ...layout().yaxis, title: { text: "%", font: { size: 11, color: C.tick } } },
      shapes: [{ type: "line", x0: trimDates[0], x1: trimDates[trimDates.length - 1], y0: 0, y1: 0, line: { color: C.zero, width: 1.2, dash: "solid" } }],
    }, trimDates);
    plotly(el, [trace], l, cfg());
  } catch (e) {
    el.innerHTML = `<div class="error-box">Failed: ${e.message}</div>`;
  }
}

// MoM % change
function mom(dates, values) {
  const outD = [], outV = [];
  for (let i = 1; i < values.length; i++) {
    if (values[i - 1] !== 0) {
      outD.push(dates[i]);
      outV.push(((values[i] - values[i - 1]) / Math.abs(values[i - 1])) * 100);
    }
  }
  return { dates: outD, values: outV };
}

// Bar chart
async function renderBar(elId, seriesId, label, color, range, useMoM = false) {
  const el = document.getElementById(elId);
  if (!el) return;
  try {
    const d = await fetchSeries(S[seriesId] || seriesId, startDate(range));
    let dates = d.dates, values = d.values, titleSuffix = "";
    if (useMoM) { const c = mom(dates, values); dates = c.dates; values = c.values; titleSuffix = " MoM %"; }
    const colors = values.map(v => v >= 0 ? C.green : C.red);
    plotly(el, [{
      x: dates, y: values, type: "bar", name: label,
      marker: { color: colors, opacity: 0.85 },
      hovertemplate: `${label}: %{y:.2f}<extra></extra>`,
    }], withRecessions({ ...layout(`${label}${titleSuffix}`), yaxis: { ...layout().yaxis, title: { text: useMoM ? "%" : "", font: { size: 11, color: C.tick } } } }, dates), cfg());
  } catch (e) {
    el.innerHTML = `<div class="error-box">Failed: ${e.message}</div>`;
  }
}

// ── KPI strip updater ─────────────────────────────────────────────────────────
async function updateKPI(elId, seriesId, label, fmt = v => v.toFixed(2)) {
  const el = document.getElementById(elId);
  if (!el) return;
  try {
    const d = await fetchSeries(S[seriesId] || seriesId, startDate("5Y"));
    const v = d.values[d.values.length - 1];
    const prev = d.values[d.values.length - 2];
    const chg = v - prev;
    const cls = chg >= 0 ? "pos" : "neg";
    const date = d.dates[d.dates.length - 1];
    el.innerHTML = `
      <div class="kpi-label">${label}</div>
      <div class="kpi-value ${cls}">${fmt(v)}</div>
      <div class="kpi-meta">${date}</div>`;
  } catch {
    el.innerHTML = `<div class="kpi-label">${label}</div><div class="kpi-value">—</div>`;
  }
}

// ── Yield curve ───────────────────────────────────────────────────────────────
const YIELD_SERIES = [
  { id: "TBILL_1M",  label: "1M",  months: 1  },
  { id: "TBILL_3M",  label: "3M",  months: 3  },
  { id: "TBILL_6M",  label: "6M",  months: 6  },
  { id: "TBILL_1Y",  label: "1Y",  months: 12 },
  { id: "TREASURY_2Y",  label: "2Y",  months: 24 },
  { id: "TREASURY_3Y",  label: "3Y",  months: 36 },
  { id: "TREASURY_5Y",  label: "5Y",  months: 60 },
  { id: "TREASURY_7Y",  label: "7Y",  months: 84 },
  { id: "TREASURY_10Y", label: "10Y", months: 120 },
  { id: "TREASURY_20Y", label: "20Y", months: 240 },
  { id: "TREASURY_30Y", label: "30Y", months: 360 },
];

async function renderYieldCurve(elId) {
  const el = document.getElementById(elId);
  if (!el) return;
  try {
    const results = await Promise.all(YIELD_SERIES.map(s => fetchSeries(S[s.id], startDate("5Y"))));
    const labels = YIELD_SERIES.map(s => s.label);
    // Use evenly-spaced integer x positions so short-end tenors aren't crushed
    const x = YIELD_SERIES.map((_, i) => i);
    const current = results.map(r => r.values[r.values.length - 1]);
    const ago1Y = results.map(r => {
      const target = new Date(); target.setFullYear(target.getFullYear() - 1);
      const tk = target.toISOString().slice(0, 10);
      const idx = r.dates.findIndex(d => d >= tk);
      return idx >= 0 ? r.values[idx] : null;
    });
    const traces = [
      { x, y: current, type: "scatter", mode: "lines+markers", name: "Current",
        line: { color: C.blue, width: 2.5 }, marker: { color: C.blue, size: 7, symbol: "circle" },
        hovertemplate: "%{text}: %{y:.3f}%<extra></extra>", text: labels },
      { x, y: ago1Y, type: "scatter", mode: "lines+markers", name: "1Y Ago",
        line: { color: C.silver, width: 1.5, dash: "dot" }, marker: { color: C.silver, size: 5 },
        hovertemplate: "%{text} (1Y ago): %{y:.3f}%<extra></extra>", text: labels },
    ];
    const l = {
      ...layout("US Treasury Yield Curve", 340),
      xaxis: {
        ...layout().xaxis,
        tickvals: x,
        ticktext: labels,
        tickfont: { size: 12, color: C.tick },
        title: { text: "Maturity", font: { size: 11, color: C.tick } },
      },
      yaxis: { ...layout().yaxis, title: { text: "Yield (%)", font: { size: 11, color: C.tick } } },
    };
    plotly(el, traces, l, cfg());
  } catch (e) {
    el.innerHTML = `<div class="error-box">Failed: ${e.message}</div>`;
  }
}

// ── Spread chart ──────────────────────────────────────────────────────────────
async function renderSpread(elId, id1, id2, label, range) {
  const el = document.getElementById(elId);
  if (!el) return;
  try {
    const [a, b] = await Promise.all([
      fetchSeries(S[id1] || id1, startDate(range)),
      fetchSeries(S[id2] || id2, startDate(range)),
    ]);
    const bMap = {};
    b.dates.forEach((d, i) => bMap[d] = b.values[i]);
    const dates = [], values = [];
    a.dates.forEach((d, i) => {
      if (bMap[d] !== undefined) { dates.push(d); values.push(a.values[i] - bMap[d]); }
    });
    const posY = values.map(v => v >= 0 ? v : 0);
    const negY = values.map(v => v < 0 ? v : 0);
    const traces = [
      { x: dates, y: posY, type: "scatter", mode: "none", name: "Positive",
        fill: "tozeroy", fillcolor: "rgba(107,158,196,0.22)", showlegend: false, hoverinfo: "skip" },
      { x: dates, y: negY, type: "scatter", mode: "none", name: "Inverted",
        fill: "tozeroy", fillcolor: "rgba(196,112,96,0.30)", showlegend: false, hoverinfo: "skip" },
      { x: dates, y: values, type: "scatter", mode: "lines", name: label,
        line: { color: C.blue, width: 1.8 },
        hovertemplate: `${label}: %{y:.2f}%<extra></extra>` },
    ];
    plotly(el, traces, withRecessions({
      ...layout(label),
      yaxis: { ...layout().yaxis, title: { text: "%", font: { size: 11, color: C.tick } } },
      shapes: [{ type: "line", x0: dates[0], x1: dates[dates.length - 1], y0: 0, y1: 0,
        line: { color: C.zero, width: 1.2, dash: "solid" } }],
    }, dates), cfg());
  } catch (e) {
    el.innerHTML = `<div class="error-box">Failed: ${e.message}</div>`;
  }
}

// ── Implied Rate Curve ────────────────────────────────────────────────────────
// Builds a "dot-plot style" view from current SOFR vs Treasury short-end yields
// showing where rates are priced across maturities
async function renderImpliedRateCurve(elId) {
  const el = document.getElementById(elId);
  if (!el) return;
  try {
    const tenors = [
      { id: "TBILL_1M",     label: "1M",   months: 1  },
      { id: "TBILL_3M",     label: "3M",   months: 3  },
      { id: "TBILL_6M",     label: "6M",   months: 6  },
      { id: "TBILL_1Y",     label: "1Y",   months: 12 },
      { id: "TREASURY_2Y",  label: "2Y",   months: 24 },
      { id: "TREASURY_3Y",  label: "3Y",   months: 36 },
      { id: "TREASURY_5Y",  label: "5Y",   months: 60 },
    ];
    const results = await Promise.all(tenors.map(t => fetchSeries(S[t.id] || t.id, startDate("5Y"))));
    const labels = tenors.map(t => t.label);
    const x = tenors.map(t => t.months);

    const current = results.map(r => r.values[r.values.length - 1]);
    const ago6M = results.map(r => {
      const target = new Date(); target.setMonth(target.getMonth() - 6);
      const tk = target.toISOString().slice(0, 10);
      const idx = r.dates.findIndex(d => d >= tk);
      return idx >= 0 ? r.values[idx] : null;
    });
    const ago1Y = results.map(r => {
      const target = new Date(); target.setFullYear(target.getFullYear() - 1);
      const tk = target.toISOString().slice(0, 10);
      const idx = r.dates.findIndex(d => d >= tk);
      return idx >= 0 ? r.values[idx] : null;
    });

    const traces = [
      {
        x, y: current, type: "scatter", mode: "lines+markers", name: "Current",
        line: { color: C.blue, width: 2.5 }, marker: { color: C.blue, size: 8 },
        hovertemplate: "%{text}: %{y:.3f}%<extra></extra>", text: labels,
      },
      {
        x, y: ago6M, type: "scatter", mode: "lines+markers", name: "6M Ago",
        line: { color: C.amber, width: 1.5, dash: "dot" }, marker: { color: C.amber, size: 5 },
        hovertemplate: "%{text} (6M ago): %{y:.3f}%<extra></extra>", text: labels,
      },
      {
        x, y: ago1Y, type: "scatter", mode: "lines+markers", name: "1Y Ago",
        line: { color: C.silver, width: 1.5, dash: "dash" }, marker: { color: C.silver, size: 5 },
        hovertemplate: "%{text} (1Y ago): %{y:.3f}%<extra></extra>", text: labels,
      },
    ];
    const l = {
      ...layout("Market-Implied Policy Rate Curve", 360),
      xaxis: { ...layout().xaxis, tickvals: x, ticktext: labels, title: { text: "Tenor", font: { size: 11, color: C.tick } } },
      yaxis: { ...layout().yaxis, title: { text: "Rate (%)", font: { size: 11, color: C.tick } } },
    };
    plotly(el, traces, l, cfg());
  } catch (e) {
    el.innerHTML = `<div class="error-box">Failed to load implied curve: ${e.message}</div>`;
  }
}

// ── Real Rate Chart ───────────────────────────────────────────────────────────
async function renderRealRate(elId, range) {
  const el = document.getElementById(elId);
  if (!el) return;
  if (!el.querySelector(".js-plotly-plot")) el.innerHTML = `<div class="loading-placeholder"><span class="spinner"></span>Computing real rate...</div>`;
  try {
    // We need extra history for YoY calc on CPI, so fetch from further back
    const extraStart = (() => {
      const d = new Date(startDate(range));
      d.setFullYear(d.getFullYear() - 1);
      return d.toISOString().slice(0, 10);
    })();
    const [ff, cpi] = await Promise.all([
      fetchSeries(S["FED_FUNDS"],  startDate(range)),
      fetchSeries(S["CORE_CPI"],   extraStart),
    ]);
    // Compute Core CPI YoY
    const cpiYoY = yoy(cpi.dates, cpi.values);
    const cpiMap = {};
    cpiYoY.dates.forEach((d, i) => cpiMap[d] = cpiYoY.values[i]);

    // Align Fed Funds to CPI YoY dates
    const dates = [], real = [], nominal = [];
    ff.dates.forEach((d, i) => {
      // Find nearest CPI date
      const closest = Object.keys(cpiMap).reduce((a, b) =>
        Math.abs(new Date(a) - new Date(d)) < Math.abs(new Date(b) - new Date(d)) ? a : b, Object.keys(cpiMap)[0]);
      if (closest) {
        dates.push(d);
        nominal.push(ff.values[i]);
        real.push(ff.values[i] - cpiMap[closest]);
      }
    });

    const traces = [
      { x: dates, y: real, type: "scatter", mode: "lines", name: "Real Rate (FF − Core CPI YoY)",
        line: { color: C.blue, width: 2 }, hovertemplate: "Real: %{y:.2f}%<extra></extra>" },
      { x: dates, y: nominal, type: "scatter", mode: "lines", name: "Nominal Fed Funds",
        line: { color: C.green, width: 1.5, dash: "dot" }, hovertemplate: "Nominal: %{y:.2f}%<extra></extra>" },
    ];
    const l = withRecessions({
      ...layout("Real Policy Rate"),
      shapes: [{ type: "line", x0: dates[0], x1: dates[dates.length-1], y0: 0, y1: 0,
        line: { color: C.zero, width: 1.2, dash: "solid" } }],
      yaxis: { ...layout().yaxis, title: { text: "%", font: { size: 11, color: C.tick } } },
    }, dates);
    plotly(el, traces, l, cfg());
  } catch (e) {
    el.innerHTML = `<div class="error-box">Failed: ${e.message}</div>`;
  }
}

// ── FOMC Probability Strip ────────────────────────────────────────────────────
async function renderFOMCProbStrip(elId) {
  const el = document.getElementById(elId);
  if (!el) return;
  el.innerHTML = `<div class="loading-placeholder"><span class="spinner"></span>Computing rate expectations...</div>`;
  try {
    const tenors = [
      { id: "SOFR",         months: 0   },
      { id: "TBILL_1M",     months: 1   },
      { id: "TBILL_3M",     months: 3   },
      { id: "TBILL_6M",     months: 6   },
      { id: "TBILL_1Y",     months: 12  },
      { id: "TREASURY_2Y",  months: 24  },
    ];
    const [ff, ...curveSeries] = await Promise.all([
      fetchSeries(S["FED_FUNDS"], startDate("5Y")),
      ...tenors.map(t => fetchSeries(S[t.id], startDate("5Y"))),
    ]);
    const last = arr => arr.values.length ? arr.values[arr.values.length - 1] : null;
    const current = last(ff);
    const ffDate   = ff.dates.length ? ff.dates[ff.dates.length - 1] : "N/A";
    if (current == null) throw new Error("No Fed Funds data");

    const curvePoints = tenors.map((t, i) => ({ months: t.months, rate: last(curveSeries[i]) }))
      .filter(p => p.rate != null);

    function interpolateRate(months) {
      if (!curvePoints.length) return null;
      if (months <= curvePoints[0].months) return curvePoints[0].rate;
      const lastPt = curvePoints[curvePoints.length - 1];
      if (months >= lastPt.months) return lastPt.rate;
      for (let i = 0; i < curvePoints.length - 1; i++) {
        const a = curvePoints[i], b = curvePoints[i + 1];
        if (months >= a.months && months <= b.months) {
          const frac = (months - a.months) / (b.months - a.months);
          return a.rate + frac * (b.rate - a.rate);
        }
      }
      return lastPt.rate;
    }

    const today = new Date();
    const upcoming = FOMC_MEETINGS
      .map(m => ({ ...m, d: new Date(m.date + "T00:00:00") }))
      .filter(m => m.d > today)
      .slice(0, 5);

    const step = 0.25;
    // 5 discrete outcomes, fixed relative to TODAY's rate
    const outcomes = [-2, -1, 0, 1, 2]; // in units of 25bp

    function normalPdf(x, sigma) { return Math.exp(-(x * x) / (2 * sigma * sigma)); }

    const meetingsHtml = upcoming.map(m => {
      const daysOut = Math.round((m.d - today) / 86400000);
      const months = daysOut / 30.44;
      const implied = interpolateRate(months);
      let probs;
      if (implied == null) {
        probs = outcomes.map(() => 0);
      } else {
        const expectedMoves = (implied - current) / step; // in 25bp units, can be fractional
        // Uncertainty grows with horizon — roughly 0.4 "move units" of std dev per 3 months out
        const sigma = Math.max(0.45, 0.4 * Math.sqrt(months / 3));
        const weights = outcomes.map(o => normalPdf(o - expectedMoves, sigma));
        const total = weights.reduce((a, b) => a + b, 0) || 1;
        probs = weights.map(w => (w / total) * 100);
      }
      const modalIdx = probs.reduce((best, p, i) => (p > probs[best] ? i : best), 0);
      const mtgLabel = m.d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
      const barSegments = outcomes.map((o, i) => {
        const bp = o * 25;
        const color = bp < 0 ? C.green : bp > 0 ? C.red : C.amber;
        const pct = probs[i];
        return `<div title="${bp > 0 ? "+" : ""}${bp}bp: ${pct.toFixed(0)}%" style="height:100%;width:${pct}%;background:${color};opacity:${i === modalIdx ? 1 : 0.55};"></div>`;
      }).join("");
      const legend = outcomes.map((o, i) => {
        const bp = o * 25;
        const lbl = bp === 0 ? "Hold" : (bp > 0 ? `+${bp}bp` : `${bp}bp`);
        return `<div style="text-align:center;flex:1;">
          <div style="font-family:var(--sans);font-size:0.6rem;color:${i === modalIdx ? "var(--bright)" : "var(--dim)"};">${probs[i].toFixed(0)}%</div>
          <div style="font-family:var(--sans);font-size:0.54rem;color:#8a8a8a;letter-spacing:0.05em;">${lbl}</div>
        </div>`;
      }).join("");
      return `
        <div style="background:var(--surface);border:1px solid var(--border);padding:13px 14px 12px;">
          <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:9px;">
            <div style="font-family:var(--sans);font-size:0.62rem;letter-spacing:0.1em;color:var(--bright);text-transform:uppercase;">${mtgLabel}</div>
            ${m.sep ? '<div style="font-family:var(--sans);font-size:0.52rem;color:var(--amber);letter-spacing:0.08em;">SEP</div>' : ""}
          </div>
          <div style="display:flex;height:8px;border-radius:2px;overflow:hidden;background:var(--border2);margin-bottom:8px;">${barSegments}</div>
          <div style="display:flex;">${legend}</div>
          <div style="font-family:var(--sans);font-size:0.54rem;color:#8a8a8a;margin-top:8px;letter-spacing:0.08em;">IMPLIED ${implied != null ? implied.toFixed(2) : "—"}%</div>
        </div>`;
    }).join("");

    el.innerHTML = `
      <div style="font-family:var(--sans);font-size:0.6rem;letter-spacing:0.12em;color:var(--muted);text-transform:uppercase;margin-bottom:10px;">
        Current Rate: <span style="color:var(--bright)">${current.toFixed(2)}%</span> &nbsp;·&nbsp; As of: ${ffDate}
      </div>
      <div style="display:grid;grid-template-columns:repeat(${upcoming.length || 1},1fr);gap:10px;">
        ${meetingsHtml}
      </div>`;
  } catch (e) {
    el.innerHTML = `<div class="error-box">Failed: ${e.message}</div>`;
  }
}

// ── Recession Signal Board ────────────────────────────────────────────────────
// Fetches all indicator data, evaluates each signal, then renders a BofA-style
// "X of Y indicators red" summary with individual pill badges.
async function renderRecessionSignalBoard(elId, range) {
  const el = document.getElementById(elId);
  if (!el) return;

  try {
    // Fetch all needed series
    const [t10y, t2y, t3m, unrate, initClaims, baa, aaa, tsy10y, indpro, permits, saving, wages, m2, bankCredit] =
      await Promise.all([
        fetchSeries(S["TREASURY_10Y"],          startDate("5Y")),
        fetchSeries(S["TREASURY_2Y"],           startDate("5Y")),
        fetchSeries(S["TBILL_3M"],              startDate("5Y")),
        fetchSeries(S["UNEMPLOYMENT_RATE"],     startDate("5Y")),
        fetchSeries(S["INITIAL_CLAIMS"],        startDate("5Y")),
        fetchSeries(S["BAA_YIELD"],             startDate("5Y")),
        fetchSeries(S["AAA_YIELD"],             startDate("5Y")),
        fetchSeries(S["TREASURY_10Y"],          startDate("5Y")),
        fetchSeries(S["INDUSTRIAL_PRODUCTION"], startDate("5Y")),
        fetchSeries(S["BUILDING_PERMITS"],      startDate("5Y")),
        fetchSeries(S["PERSONAL_SAVING_RATE"],  startDate("5Y")),
        fetchSeries(S["AVG_HOURLY_EARNINGS"],   startDate("5Y")),
        fetchSeries(S["M2"],                    startDate("5Y")),
        fetchSeries(S["COMMERCIAL_BANK_CREDIT"],startDate("5Y")),
      ]);

    const last = d => d.values[d.values.length - 1];
    const prev = (d, n = 3) => d.values[Math.max(0, d.values.length - 1 - n)];

    // YoY helper for a raw series object
    function latestYoY(d) {
      const ch = yoy(d.dates, d.values);
      return ch.values.length ? ch.values[ch.values.length - 1] : null;
    }

    // Spread helper
    function spreadLast(a, b) {
      const bMap = {};
      b.dates.forEach((date, i) => bMap[date] = b.values[i]);
      let lastVal = null;
      a.dates.forEach((date, i) => { if (bMap[date] !== undefined) lastVal = a.values[i] - bMap[date]; });
      return lastVal;
    }

    // ── Signal definitions ─────────────────────────────────────────────────
    // Each: { name, value, threshold, flipped: value crosses threshold in bearish direction, note }
    const spread2s10 = spreadLast(t10y, t2y);
    const spread3m10 = spreadLast(t10y, t3m);
    const creditSpd  = spreadLast(baa, tsy10y);
    const hySpd      = spreadLast(baa, aaa);
    const indproYoY  = latestYoY(indpro);
    const permitsYoY = latestYoY(permits);
    const wagesYoY   = latestYoY(wages);
    const m2YoY      = latestYoY(m2);
    const creditYoY  = latestYoY(bankCredit);
    const unrateNow  = last(unrate);
    const unratePrev = prev(unrate, 6);
    const claimsNow  = last(initClaims);
    const claimsPrev = prev(initClaims, 13); // ~3 months ago
    const savingNow  = last(saving);

    const signals = [
      {
        name: "2s10s Inverted",
        flipped: spread2s10 !== null && spread2s10 < 0,
        value: spread2s10 !== null ? `${spread2s10.toFixed(2)}%` : "—",
        note: "Yield curve inverted (10Y<2Y)",
      },
      {
        name: "3m10y Inverted",
        flipped: spread3m10 !== null && spread3m10 < 0,
        value: spread3m10 !== null ? `${spread3m10.toFixed(2)}%` : "—",
        note: "Yield curve inverted (10Y<3M)",
      },
      {
        name: "Unemployment Rising",
        flipped: unrateNow - unratePrev > 0.3,
        value: `${unrateNow?.toFixed(1)}%`,
        note: "+0.3pp rise over 6 months",
      },
      {
        name: "Claims Elevated",
        flipped: claimsNow > claimsPrev * 1.1,
        value: claimsNow ? `${(claimsNow/1000).toFixed(0)}k` : "—",
        note: ">10% rise in initial claims",
      },
      {
        name: "Credit Spread Wide",
        flipped: creditSpd !== null && creditSpd > 2.5,
        value: creditSpd !== null ? `${creditSpd.toFixed(2)}%` : "—",
        note: "BAA−10Y spread >250bps",
      },
      {
        name: "HY Spread Wide",
        flipped: hySpd !== null && hySpd > 1.5,
        value: hySpd !== null ? `${hySpd.toFixed(2)}%` : "—",
        note: "BAA−AAA spread >150bps",
      },
      {
        name: "IndPro Contracting",
        flipped: indproYoY !== null && indproYoY < 0,
        value: indproYoY !== null ? `${indproYoY.toFixed(1)}%` : "—",
        note: "Industrial output YoY negative",
      },
      {
        name: "Permits Declining",
        flipped: permitsYoY !== null && permitsYoY < -5,
        value: permitsYoY !== null ? `${permitsYoY.toFixed(1)}%` : "—",
        note: "Building permits YoY <−5%",
      },
      {
        name: "Real Wages Negative",
        flipped: wagesYoY !== null && wagesYoY < 0,
        value: wagesYoY !== null ? `${wagesYoY.toFixed(1)}%` : "—",
        note: "Avg hourly earnings YoY negative",
      },
      {
        name: "M2 Contracting",
        flipped: m2YoY !== null && m2YoY < 0,
        value: m2YoY !== null ? `${m2YoY.toFixed(1)}%` : "—",
        note: "M2 money supply shrinking YoY",
      },
      {
        name: "Bank Credit Weak",
        flipped: creditYoY !== null && creditYoY < 2,
        value: creditYoY !== null ? `${creditYoY.toFixed(1)}%` : "—",
        note: "Commercial bank credit YoY <2%",
      },
      {
        name: "Low Saving Rate",
        flipped: savingNow !== null && savingNow < 4,
        value: savingNow !== null ? `${savingNow.toFixed(1)}%` : "—",
        note: "Personal saving rate <4%",
      },
    ];

    const total   = signals.length;
    const red     = signals.filter(s => s.flipped).length;
    const pct     = Math.round((red / total) * 100);
    const alertColor = pct >= 60 ? C.red : pct >= 35 ? C.amber : C.green;
    const alertLabel = pct >= 60 ? "ELEVATED RISK" : pct >= 35 ? "WATCH" : "LOW SIGNAL";

    el.innerHTML = `
      <div style="
        background:var(--surface);
        border:1px solid var(--border);
        border-left: 3px solid ${alertColor};
        padding:18px 20px 16px;
        margin-bottom:4px;
      ">
        <div style="display:flex;align-items:center;gap:20px;margin-bottom:14px;flex-wrap:wrap;">
          <div>
            <div style="font-family:var(--sans);font-size:0.58rem;letter-spacing:0.2em;text-transform:uppercase;color:var(--muted);margin-bottom:4px;">Recession Signal Board</div>
            <div style="display:flex;align-items:baseline;gap:10px;">
              <span style="font-family:var(--sans);font-size:1.9rem;color:${alertColor};line-height:1;">${red}/${total}</span>
              <span style="font-family:var(--sans);font-size:0.72rem;color:var(--dim);">indicators flipped</span>
              <span style="font-family:var(--sans);font-size:0.65rem;letter-spacing:0.14em;color:${alertColor};border:1px solid ${alertColor};padding:2px 8px;text-transform:uppercase;">${alertLabel}</span>
            </div>
          </div>
          <div style="flex:1;min-width:180px;">
            <div style="height:6px;background:var(--border2);border-radius:3px;overflow:hidden;margin-bottom:4px;">
              <div style="height:6px;width:${pct}%;background:${alertColor};border-radius:3px;transition:width 0.6s;"></div>
            </div>
            <div style="font-family:var(--sans);font-size:0.58rem;color:var(--muted);letter-spacing:0.1em;">${pct}% of indicators in warning zone</div>
          </div>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:6px;">
          ${signals.map(s => `
            <div title="${s.note}" style="
              font-family:var(--sans);
              font-size:0.58rem;
              letter-spacing:0.1em;
              text-transform:uppercase;
              padding:4px 9px;
              border:1px solid ${s.flipped ? C.red : "var(--border)"};
              background:${s.flipped ? "rgba(196,112,96,0.12)" : "rgba(255,255,255,0.02)"};
              color:${s.flipped ? C.red : "var(--muted)"};
              white-space:nowrap;
              cursor:default;
            ">
              ${s.flipped ? "▲" : "·"} ${s.name}
              <span style="color:${s.flipped ? "rgba(196,112,96,0.8)" : "#9A9A9A"};margin-left:4px;">${s.value}</span>
            </div>`).join("")}
        </div>
      </div>`;
  } catch(e) {
    el.innerHTML = `<div class="error-box">Signal board failed: ${e.message}</div>`;
  }
}

// ── Chart card helper — renders spinner inside card so placeholder shows immediately ──
function cc(id, style = "") {
  return `<div class="chart-card" id="${id}"${style ? ` style="${style}"` : ""}><div class="loading-placeholder"><span class="spinner"></span></div></div>`;
}

// ── Calendar page renderer ────────────────────────────────────────────────────
let calendarFilter = "all";

function setCalendarFilter(filter) {
  calendarFilter = filter;
  document.querySelectorAll("#cal-filters .range-btn").forEach(el => {
    el.classList.toggle("active", el.dataset.filter === filter);
  });
  renderCalendarList();
}

function daysUntilLabel(d, today) {
  const days = Math.round((d - today) / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days < 0) return `${Math.abs(days)}d ago`;
  return `in ${days}d`;
}

function renderCalendar() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const events = CALENDAR_EVENTS
    .map(e => ({ ...e, d: new Date(e.date + "T00:00:00") }))
    .sort((a, b) => a.d - b.d);

  const upcoming = events.filter(e => e.d >= today);
  const next = upcoming[0];

  const nextEl = document.getElementById("cal-next");
  if (nextEl) {
    if (next) {
      const meta = EVENT_META[next.type];
      const imp = eventImportance(next);
      nextEl.innerHTML = `
        <div style="background:var(--surface);border:1px solid var(--border);border-left:3px solid ${meta.color};padding:18px 20px;cursor:pointer;" onclick="openEventHistory('${next.type}','${next.title.replace(/'/g, "\\'")}')">
          <div style="font-family:var(--sans);font-size:0.58rem;letter-spacing:0.2em;text-transform:uppercase;color:var(--muted);margin-bottom:8px;">Next Up</div>
          <div style="display:flex;align-items:baseline;gap:14px;flex-wrap:wrap;">
            <span style="font-family:var(--sans);font-size:1.3rem;color:var(--bright);">${next.title}</span>
            ${next.period ? `<span style="font-family:var(--sans);font-size:0.75rem;color:var(--label);">${next.period}</span>` : ""}
            <span style="font-family:var(--sans);font-size:0.7rem;letter-spacing:0.1em;color:${meta.color};border:1px solid ${meta.color};padding:2px 8px;text-transform:uppercase;">${daysUntilLabel(next.d, today)}</span>
            ${importancePips(imp)}
          </div>
          <div style="font-family:var(--sans);font-size:0.72rem;color:var(--dim);margin-top:8px;">${next.d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })} &nbsp;·&nbsp; Click for history</div>
        </div>`;
    } else {
      nextEl.innerHTML = `<div class="info-box">No upcoming events in the loaded calendar window.</div>`;
    }
  }

  renderCalendarList();
}

function renderCalendarList() {
  const listEl = document.getElementById("cal-list");
  if (!listEl) return;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const oneMonthAgo = new Date(today);
  oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

  let allEvents = CALENDAR_EVENTS
    .map(e => ({ ...e, d: new Date(e.date + "T00:00:00") }))
    .sort((a, b) => a.d - b.d);

  if (calendarFilter !== "all") allEvents = allEvents.filter(e => e.type === calendarFilter);

  const pastEvents    = allEvents.filter(e => e.d >= oneMonthAgo && e.d < today);
  const futureEvents  = allEvents.filter(e => e.d >= today);

  function buildTable(events, isPast) {
    if (!events.length) return "";
    const groups = {};
    events.forEach(e => {
      const key = e.d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
      (groups[key] = groups[key] || []).push(e);
    });

    let html = `<div class="fin-table-wrap"><table class="fin-table"><thead><tr>
      <th style="text-align:left;">Date</th>
      <th style="text-align:left;">Event</th>
      <th style="text-align:left;">Period</th>
      <th>Importance</th>
      <th>Type</th>
      <th>${isPast ? "Released" : "In"}</th>
    </tr></thead><tbody>`;

    Object.entries(groups).forEach(([month, evs], gi) => {
      if (gi > 0) {
        // spacer row between months
        html += `<tr><td colspan="6" style="height:10px;background:var(--bg);border:none;padding:0;"></td></tr>`;
      }
      html += `<tr><td colspan="6" style="background:#222;color:var(--dim);font-size:0.72rem;
        font-weight:600;letter-spacing:0.08em;text-transform:uppercase;padding:8px 12px;
        border-bottom:1px solid var(--border2);">${month}</td></tr>`;
      evs.forEach(e => {
        const meta = EVENT_META[e.type];
        const imp = eventImportance(e);
        const timeLabel = daysUntilLabel(e.d, today);
        const rowStyle = isPast ? "opacity:0.7;" : "";
        html += `<tr style="cursor:pointer;${rowStyle}" onclick="openEventHistory('${e.type}','${e.title.replace(/'/g, "\\'")}')" title="Click for history">
          <td style="text-align:left;">${e.d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}</td>
          <td style="text-align:left;color:var(--bright);">${e.title}</td>
          <td style="text-align:left;">${e.period || "—"}</td>
          <td>${importancePips(imp)}</td>
          <td><span style="font-family:var(--sans);font-size:0.62rem;letter-spacing:0.08em;color:${meta.color};border:1px solid ${meta.color};padding:1px 7px;">${meta.label}</span></td>
          <td style="color:${isPast ? C.muted : ""};">${timeLabel}</td>
        </tr>`;
      });
    });

    html += `</tbody></table></div>`;
    return html;
  }

  let html = "";

  if (pastEvents.length) {
    html += `<div class="section-title" style="color:var(--muted);">Past Releases — Last Month</div>`;
    html += buildTable(pastEvents, true);
    html += `<div style="height:20px;"></div>`;
  }

  if (futureEvents.length) {
    html += `<div class="section-title">Upcoming Releases</div>`;
    html += buildTable(futureEvents, false);
  } else {
    html += `<div class="info-box">No upcoming events match this filter.</div>`;
  }

  listEl.innerHTML = html;
}

// ── Event history panel ───────────────────────────────────────────────────────
function diffSeries(dates, values) {
  const d = [], v = [];
  for (let i = 1; i < dates.length; i++) { d.push(dates[i]); v.push(values[i] - values[i - 1]); }
  return { dates: d, values: v };
}

async function getEventHistorySeries(type, title) {
  let seriesId, label, transform, fmt;
  switch (type) {
    case "jobs":
      seriesId = "NONFARM_PAYROLLS";
      label = "Nonfarm Payrolls — Monthly Change";
      transform = diffSeries;
      fmt = v => `${v >= 0 ? "+" : ""}${v.toFixed(0)}k`;
      break;
    case "inflation":
      seriesId = title.includes("Producer") ? "PPI" : "CPI";
      label = `${title.includes("Producer") ? "PPI" : "CPI"} — Month-over-Month`;
      transform = (d, v) => mom(d, v);
      fmt = v => `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
      break;
    case "gdp":
      seriesId = "REAL_GDP";
      label = "Real GDP — Year-over-Year";
      transform = (d, v) => yoy(d, v);
      fmt = v => `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;
      break;
    case "pce":
      seriesId = "CORE_PCE";
      label = "Core PCE — Year-over-Year";
      transform = (d, v) => yoy(d, v);
      fmt = v => `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;
      break;
    case "trade":
      seriesId = "TRADE_BALANCE";
      label = "Trade Balance (USD Millions)";
      transform = (d, v) => ({ dates: d, values: v });
      fmt = v => `${v >= 0 ? "+" : ""}${Math.round(v).toLocaleString()}`;
      break;
    case "fomc":
      seriesId = "FED_FUNDS";
      label = "Effective Fed Funds Rate";
      transform = (d, v) => ({ dates: d, values: v });
      fmt = v => `${v.toFixed(2)}%`;
      break;
    default:
      return null;
  }
  const raw = await fetchSeries(S[seriesId] || seriesId, startDate("20Y"));
  const t = transform(raw.dates, raw.values);
  return { ...t, label, fmt };
}

function buildHistoryRows(dates, values, n = 12) {
  const rows = [];
  for (let i = dates.length - 1; i >= 1 && rows.length < n; i--) {
    rows.push({ date: dates[i], actual: values[i], prior: values[i - 1], change: values[i] - values[i - 1] });
  }
  return rows;
}

function ensureEventModal() {
  if (document.getElementById("event-modal-overlay")) return;
  const div = document.createElement("div");
  div.id = "event-modal-overlay";
  div.className = "event-modal-overlay";
  div.innerHTML = `
    <div class="event-modal" id="event-modal">
      <div class="event-modal-header">
        <div id="event-modal-title" class="event-modal-title"></div>
        <button class="event-modal-close" onclick="closeEventHistory()">&times;</button>
      </div>
      <div id="event-modal-body" class="event-modal-body"></div>
    </div>`;
  div.addEventListener("click", (e) => { if (e.target === div) closeEventHistory(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeEventHistory(); });
  document.body.appendChild(div);
}

function closeEventHistory() {
  const ov = document.getElementById("event-modal-overlay");
  if (ov) ov.classList.remove("open");
}

async function openEventHistory(type, title) {
  ensureEventModal();
  const overlay = document.getElementById("event-modal-overlay");
  const titleEl  = document.getElementById("event-modal-title");
  const bodyEl   = document.getElementById("event-modal-body");
  const meta = EVENT_META[type] || { label: type.toUpperCase(), color: C.silver };
  const imp  = IMPORTANCE_META[eventImportance({ type, title })] || IMPORTANCE_META.medium;

  titleEl.innerHTML = `<span style="color:${meta.color};">${meta.label}</span>&nbsp;&nbsp;${title}`;
  bodyEl.innerHTML = `<div class="loading-placeholder" style="min-height:180px;"><span class="spinner"></span>Loading history...</div>`;
  overlay.classList.add("open");

  try {
    const hist = await getEventHistorySeries(type, title);
    if (!hist) {
      bodyEl.innerHTML = `<div class="info-box">No history available for this event type.</div>`;
      return;
    }
    const rows = buildHistoryRows(hist.dates, hist.values, 12);
    bodyEl.innerHTML = `
      <div style="font-family:var(--sans);font-size:0.62rem;letter-spacing:0.1em;color:var(--muted);text-transform:uppercase;margin-bottom:12px;">
        ${importancePips(eventImportance({ type, title }))} <span style="margin-left:6px;color:${imp.color};">${imp.label} impact</span>
      </div>
      <div id="event-modal-chart" style="height:190px;margin-bottom:14px;"></div>
      <div class="fin-table-wrap">
        <table class="fin-table">
          <thead><tr><th style="text-align:left;">Date</th><th>Actual</th><th>Prior</th><th>Change</th></tr></thead>
          <tbody>
            ${rows.map(r => `<tr>
              <td style="text-align:left;">${r.date}</td>
              <td>${hist.fmt(r.actual)}</td>
              <td>${hist.fmt(r.prior)}</td>
              <td class="${r.change >= 0 ? "pos" : "neg"}">${hist.fmt(r.change)}</td>
            </tr>`).join("")}
          </tbody>
        </table>
      </div>
      `;

    const chartEl = document.getElementById("event-modal-chart");
    if (chartEl) {
      const plotRows = rows.slice().reverse();
      plotly(chartEl, [{
        x: plotRows.map(r => r.date), y: plotRows.map(r => r.actual),
        type: "bar",
        marker: { color: plotRows.map(r => r.actual >= 0 ? C.green : C.red), opacity: 0.85 },
        hovertemplate: "%{x}: %{y:.2f}<extra></extra>",
      }], { ...layout(hist.label, 190), margin: { l: 48, r: 12, t: 40, b: 36 } }, cfg());
    }
  } catch (e) {
    bodyEl.innerHTML = `<div class="error-box">Failed to load history: ${e.message}</div>`;
  }
}
window.setCalendarFilter = setCalendarFilter;
window.openEventHistory  = openEventHistory;

// ── Pages ─────────────────────────────────────────────────────────────────────
const PAGES = {

  // ── Overview ──────────────────────────────────────────────────────────────
  overview: {
    title: "Overview",
    subtitle: "Key macro indicators at a glance",
    render(range) {
      return `
        <div class="section-title">Snapshot</div>
        <div class="kpi-strip" id="kpi-overview" style="grid-template-columns:repeat(6,1fr)">
          <div class="kpi-card" id="kpi-gdp"></div>
          <div class="kpi-card" id="kpi-cpi"></div>
          <div class="kpi-card" id="kpi-unemp"></div>
          <div class="kpi-card" id="kpi-fedfunds"></div>
          <div class="kpi-card" id="kpi-10y"></div>
          <div class="kpi-card" id="kpi-sp500"></div>
        </div>

        <div class="section-title">Growth & Inflation</div>
        <div class="chart-grid">
          ${cc("ov-gdp")} ${cc("ov-cpi")}
        </div>

        <div class="section-title">Labor & Policy</div>
        <div class="chart-grid">
          ${cc("ov-unemp")} ${cc("ov-fedfunds")}
        </div>

        <div class="section-title">Markets</div>
        <div class="chart-grid">
          ${cc("ov-sp500")} ${cc("ov-vix")}
        </div>`;
    },
    async load(range) {
      updateKPI("kpi-gdp",      "REAL_GDP",        "Real GDP",      v => `$${(v/1000).toFixed(1)}T`);
      updateKPI("kpi-cpi",      "CPI",             "CPI",           v => v.toFixed(1));
      updateKPI("kpi-unemp",    "UNEMPLOYMENT_RATE","Unemployment",  v => `${v.toFixed(1)}%`);
      updateKPI("kpi-fedfunds", "FED_FUNDS",        "Fed Funds",     v => `${v.toFixed(2)}%`);
      updateKPI("kpi-10y",      "TREASURY_10Y",     "10Y Treasury",  v => `${v.toFixed(2)}%`);
      updateKPI("kpi-sp500",    "SP500",            "S&P 500",       v => `${v.toFixed(0)}`);
      renderYoY("ov-gdp",    "REAL_GDP",         "Real GDP",      C.blue,  range);
      renderYoY("ov-cpi",    "CPI",              "CPI",           C.red,   range);
      renderLine("ov-unemp",    "UNEMPLOYMENT_RATE","Unemployment Rate",C.amber, range, "%");
      renderLine("ov-fedfunds", "FED_FUNDS",        "Fed Funds Rate",   C.green, range, "%");
      renderLine("ov-sp500",    "SP500",            "S&P 500",          C.blue,  range);
      renderLine("ov-vix",      "VIX",              "VIX",              C.red,   range);
    },
  },

  // ── Output ────────────────────────────────────────────────────────────────
  output: {
    title: "Output",
    subtitle: "GDP, industrial production, capacity utilization",
    render(range) {
      return `
        <div class="section-title">Gross Domestic Product</div>
        <div class="chart-grid">
          ${cc("out-realgdp")} ${cc("out-realgdp-yoy")}
        </div>
        <div class="chart-grid">
          ${cc("out-gdp-nom")} ${cc("out-gdi")}
        </div>

        <div class="section-title">Industrial Activity</div>
        <div class="chart-grid">
          ${cc("out-indpro")} ${cc("out-tcu")}
        </div>`;
    },
    async load(range) {
      renderLine("out-realgdp",     "REAL_GDP",             "Real GDP",                C.blue,  range, "USD Billions");
      renderYoY( "out-realgdp-yoy", "REAL_GDP",             "Real GDP",                C.blue,  range);
      renderLine("out-gdp-nom",     "GDP",                  "Nominal GDP",      C.green, range, "USD Billions");
      renderLine("out-gdi",         "GDI",                  "Gross Domestic Income",    C.amber, range, "USD Billions");
      renderLine("out-indpro",      "INDUSTRIAL_PRODUCTION","Industrial Production",    C.purple,range);
      renderLine("out-tcu",         "CAPACITY_UTILIZATION", "Capacity Utilization",     C.silver,range, "%");
    },
  },

  // ── Prices ────────────────────────────────────────────────────────────────
  prices: {
    title: "Prices & Inflation",
    subtitle: "CPI, PCE, PPI, import/export prices",
    render(range) {
      return `
        <div class="section-title">Consumer Price Indices</div>
        <div class="chart-grid">
          ${cc("pr-cpi-yoy")} ${cc("pr-core-cpi-yoy")}
        </div>
        <div class="chart-grid">
          ${cc("pr-cpi-pce")} ${cc("pr-core-compare")}
        </div>

        <div class="section-title">Producer & Trade Prices</div>
        <div class="chart-grid">
          ${cc("pr-ppi-yoy")} ${cc("pr-import-export")}
        </div>

        <div class="section-title">PCE Deflator</div>
        <div class="chart-grid">
          ${cc("pr-pce-yoy")} ${cc("pr-core-pce-yoy")}
        </div>`;
    },
    async load(range) {
      renderYoY("pr-cpi-yoy",      "CPI",          "CPI",       C.red,   range);
      renderYoY("pr-core-cpi-yoy", "CORE_CPI",     "Core CPI",  C.amber, range);
      renderMultiLine("pr-cpi-pce", [
        { id:"CPI",  label:"CPI",  color:C.red  },
        { id:"PCE",  label:"PCE",  color:C.blue },
      ], "CPI vs PCE Index Level", range);
      renderMultiLine("pr-core-compare", [
        { id:"CORE_CPI", label:"Core CPI",  color:C.amber  },
        { id:"CORE_PCE", label:"Core PCE",  color:C.purple },
      ], "Core CPI vs Core PCE", range);
      renderYoY("pr-ppi-yoy",      "PPI",           "PPI",        C.green, range);
      renderMultiLine("pr-import-export", [
        { id:"IMPORT_PRICES", label:"Import Prices", color:C.red   },
        { id:"EXPORT_PRICES", label:"Export Prices", color:C.green },
      ], "Import vs Export Prices", range);
      renderYoY("pr-pce-yoy",      "PCE",            "PCE Deflator", C.blue,  range);
      renderYoY("pr-core-pce-yoy", "CORE_PCE",       "Core PCE",     C.purple,range);
    },
  },

  // ── Labor ─────────────────────────────────────────────────────────────────
  labor: {
    title: "Labor Market",
    subtitle: "Employment, wages, claims, JOLTS",
    render(range) {
      return `
        <div class="section-title">Headline Indicators</div>
        <div class="chart-grid">
          ${cc("lb-unemp")} ${cc("lb-payrolls")}
        </div>
        <div class="chart-grid">
          ${cc("lb-partic")} ${cc("lb-emratio")}
        </div>

        <div class="section-title">Claims</div>
        <div class="chart-grid">
          ${cc("lb-icsa")} ${cc("lb-ccsa")}
        </div>

        <div class="section-title">Wages & Hours</div>
        <div class="chart-grid">
          ${cc("lb-wages-yoy")} ${cc("lb-hours")}
        </div>

        <div class="section-title">JOLTS</div>
        <div class="chart-grid thirds">
          ${cc("lb-openings")} ${cc("lb-hires")} ${cc("lb-quits")}
        </div>`;
    },
    async load(range) {
      renderLine("lb-unemp",    "UNEMPLOYMENT_RATE",  "Unemployment Rate",    C.amber,  range, "%");
      renderBar( "lb-payrolls", "NONFARM_PAYROLLS",   "Nonfarm Payrolls MoM", C.green,  range, true);
      renderLine("lb-partic",   "PARTICIPATION_RATE", "Labor Participation",  C.blue,   range, "%");
      renderLine("lb-emratio",  "EMP_POP_RATIO",      "Emp-Pop Ratio",        C.silver, range, "%");
      renderLine("lb-icsa",     "INITIAL_CLAIMS",     "Initial Claims",       C.red,    range, "Thousands");
      renderLine("lb-ccsa",     "CONTINUING_CLAIMS",  "Continuing Claims",    C.purple, range, "Thousands");
      renderYoY( "lb-wages-yoy","AVG_HOURLY_EARNINGS","Avg Hourly Earnings",  C.green,  range);
      renderLine("lb-hours",    "AVG_WEEKLY_HOURS",   "Avg Weekly Hours",     C.amber,  range, "Hours");
      renderLine("lb-openings", "JOLTS_OPENINGS",     "Job Openings",         C.blue,   range, "Thousands");
      renderLine("lb-hires",    "JOLTS_HIRES",        "Hires",                C.green,  range, "Thousands");
      renderLine("lb-quits",    "JOLTS_QUITS",        "Quits",                C.amber,  range, "Thousands");
    },
  },

  // ── Consumer ──────────────────────────────────────────────────────────────
  consumer: {
    title: "Consumer",
    subtitle: "Retail sales, income, saving, credit",
    render(range) {
      return `
        <div class="section-title">Spending</div>
        <div class="chart-grid">
          ${cc("cs-retail-yoy")} ${cc("cs-pce-consumption")}
        </div>

        <div class="section-title">Income & Saving</div>
        <div class="chart-grid">
          ${cc("cs-income")} ${cc("cs-saving")}
        </div>

        <div class="section-title">Credit</div>
        <div class="chart-grid">
          ${cc("cs-credit")} ${cc("cs-disp-income")}
        </div>`;
    },
    async load(range) {
      renderYoY( "cs-retail-yoy",    "RETAIL_SALES",       "Retail Sales",         C.blue,   range);
      renderLine("cs-pce-consumption","PCE_CONSUMPTION",    "PCE Consumption",      C.green,  range, "USD Billions");
      renderLine("cs-income",        "PERSONAL_INCOME",    "Personal Income",      C.amber,  range, "USD Billions");
      renderLine("cs-saving",        "PERSONAL_SAVING_RATE","Personal Saving Rate", C.silver, range, "%");
      renderLine("cs-credit",        "CONSUMER_CREDIT",    "Consumer Credit",      C.red,    range, "USD Billions");
      renderLine("cs-disp-income",   "DISPOSABLE_INCOME",  "Disposable Income",    C.purple, range, "USD Billions");
    },
  },

  // ── Housing ───────────────────────────────────────────────────────────────
  housing: {
    title: "Housing",
    subtitle: "Starts, permits, sales, home prices",
    render(range) {
      return `
        <div class="section-title">Construction Activity</div>
        <div class="chart-grid">
          ${cc("ho-starts")} ${cc("ho-permits")}
        </div>

        <div class="section-title">Sales</div>
        <div class="chart-grid">
          ${cc("ho-new-sales")} ${cc("ho-exist-sales")}
        </div>

        <div class="section-title">Prices & Financing</div>
        <div class="chart-grid">
          ${cc("ho-caseshiller")} ${cc("ho-mortgage")}
        </div>`;
    },
    async load(range) {
      renderLine("ho-starts",      "HOUSING_STARTS",      "Housing Starts",        C.blue,   range, "Thousand Units");
      renderLine("ho-permits",     "BUILDING_PERMITS",    "Building Permits",      C.green,  range, "Thousand Units");
      renderLine("ho-new-sales",   "NEW_HOME_SALES",      "New Home Sales",        C.amber,  range, "Thousands");
      renderLine("ho-exist-sales", "EXISTING_HOME_SALES", "Existing Home Sales",   C.silver, range, "Millions of Units");
      renderYoY( "ho-caseshiller", "CASE_SHILLER",        "Case-Shiller HPI",      C.red,    range);
      renderLine("ho-mortgage",    "MORTGAGE_30Y",        "30Y Mortgage Rate",     C.purple, range, "%");
    },
  },

  // ── Business ──────────────────────────────────────────────────────────────
  business: {
    title: "Business",
    subtitle: "Orders, inventories, factory output",
    render(range) {
      return `
        <div class="section-title">Orders</div>
        <div class="chart-grid">
          ${cc("biz-durable")} ${cc("biz-factory")}
        </div>

        <div class="section-title">Inventories</div>
        <div class="chart-grid">
          ${cc("biz-inv")} ${cc("biz-whl-inv")}
        </div>`;
    },
    async load(range) {
      renderLine("biz-durable",  "DURABLE_GOODS",          "Durable Goods Orders",    C.blue,   range, "USD Billions");
      renderLine("biz-factory",  "FACTORY_ORDERS",         "Factory Orders",          C.green,  range, "USD Billions");
      renderLine("biz-inv",      "INVENTORIES",            "Business Inventories",    C.amber,  range, "USD Billions");
      renderLine("biz-whl-inv",  "WHOLESALE_INVENTORIES",  "Wholesale Inventories",   C.silver, range, "USD Billions");
    },
  },

  // ── Money & Banking ───────────────────────────────────────────────────────
  money: {
    title: "Money & Banking",
    subtitle: "Money supply, Fed balance sheet, bank credit",
    render(range) {
      return `
        <div class="section-title">Money Supply</div>
        <div class="chart-grid">
          ${cc("mn-m1")} ${cc("mn-m2")}
        </div>
        <div class="chart-grid">
          ${cc("mn-m2-yoy")} ${cc("mn-base")}
        </div>

        <div class="section-title">Federal Reserve</div>
        <div class="chart-grid">
          ${cc("mn-fed-bs")} ${cc("mn-bank-credit")}
        </div>`;
    },
    async load(range) {
      renderLineScaled("mn-m1",         "M1",                   "M1 Money Supply",        C.blue,   range, "USD Trillions", 1000);
      renderLineScaled("mn-m2",         "M2",                   "M2 Money Supply",        C.green,  range, "USD Trillions", 1000);
      renderYoY(       "mn-m2-yoy",     "M2",                   "M2",                     C.green,  range);
      renderLineScaled("mn-base",       "MONETARY_BASE",        "Monetary Base",          C.amber,  range, "USD Trillions", 1000);
      renderLineScaled("mn-fed-bs",     "FED_BALANCE_SHEET",    "Fed Balance Sheet",      C.red,    range, "USD Trillions", 1e6);
      renderLineScaled("mn-bank-credit","COMMERCIAL_BANK_CREDIT","Commercial Bank Credit", C.purple, range, "USD Trillions", 1000);
    },
  },

  // ── Rates ─────────────────────────────────────────────────────────────────
  rates: {
    title: "Rates",
    subtitle: "Yield curve, Fed funds, SOFR, spreads",
    render(range) {
      return `
        <div class="section-title">Yield Curve</div>
        <div class="chart-grid single">
          ${cc("rt-yield-curve", "min-height:320px;")}
        </div>

        <div class="section-title">Policy Rates</div>
        <div class="chart-grid">
          ${cc("rt-fedfunds")} ${cc("rt-sofr")}
        </div>

        <div class="section-title">Treasury Yields</div>
        <div class="chart-grid">
          ${cc("rt-short")} ${cc("rt-long")}
        </div>

        <div class="section-title">Spreads</div>
        <div class="chart-grid">
          ${cc("rt-2s10s")} ${cc("rt-credit-spread")}
        </div>`;
    },
    async load(range) {
      renderYieldCurve("rt-yield-curve");
      renderLine("rt-fedfunds", "FED_FUNDS",    "Fed Funds Rate",   C.green, range, "%");
      renderLine("rt-sofr",     "SOFR",         "SOFR",             C.blue,  range, "%");
      renderMultiLine("rt-short", [
        { id:"TBILL_3M",    label:"3M T-Bill", color:C.silver },
        { id:"TBILL_6M",    label:"6M T-Bill", color:C.amber  },
        { id:"TBILL_1Y",    label:"1Y T-Bill", color:C.green  },
        { id:"TREASURY_2Y", label:"2Y",        color:C.blue   },
      ], "Short End", range, "%");
      renderMultiLine("rt-long", [
        { id:"TREASURY_5Y",  label:"5Y",  color:C.amber  },
        { id:"TREASURY_10Y", label:"10Y", color:C.blue   },
        { id:"TREASURY_20Y", label:"20Y", color:C.green  },
        { id:"TREASURY_30Y", label:"30Y", color:C.purple },
      ], "Long End", range, "%");
      renderSpread("rt-2s10s",        "TREASURY_10Y", "TREASURY_2Y",  "10Y - 2Y Spread",    range);
      renderSpread("rt-credit-spread","BAA_YIELD",     "TREASURY_10Y", "BAA - 10Y Spread",   range);
    },
  },

  // ── External ──────────────────────────────────────────────────────────────
  external: {
    title: "External Sector",
    subtitle: "Trade balance, exports, imports, dollar",
    render(range) {
      return `
        <div class="section-title">Trade</div>
        <div class="chart-grid">
          ${cc("ex-balance")} ${cc("ex-exp-imp")}
        </div>

        <div class="section-title">Dollar</div>
        <div class="chart-grid single">
          ${cc("ex-dollar")}
        </div>`;
    },
    async load(range) {
      renderLineScaled("ex-balance", "TRADE_BALANCE", "Trade Balance",     C.blue,  range, "USD Billions", 1000);
      renderMultiLine("ex-exp-imp", [
        { id:"EXPORTS", label:"Exports", color:C.green },
        { id:"IMPORTS", label:"Imports", color:C.red   },
      ], "Exports vs Imports", range, "USD Billions");
      renderLine("ex-dollar",  "DOLLAR_INDEX",  "Dollar Index (DXY)",C.amber, range);
    },
  },

  // ── Recession Indicators ──────────────────────────────────────────────────
  recession: {
    title: "Recession Indicators",
    subtitle: "Leading, coincident & composite signals tracked by major banks",
    render(range) {
      return `
        <div id="rc-signal-board" style="margin-bottom:20px;">
          <div class="loading-placeholder" style="min-height:80px;"><span class="spinner"></span> Scanning indicators...</div>
        </div>

        <div class="section-title">Yield Curve Inversions</div>
        <div class="chart-grid">
          ${cc("rc-2s10s")} ${cc("rc-3m10y")}
        </div>

        <div class="section-title">Labour Market Stress</div>
        <div class="chart-grid">
          ${cc("rc-sahm")} ${cc("rc-claims")}
        </div>

        <div class="section-title">Credit & Financial Stress</div>
        <div class="chart-grid">
          ${cc("rc-credit-spread")} ${cc("rc-hy-spread")}
        </div>

        <div class="section-title">Leading Indicators</div>
        <div class="chart-grid">
          ${cc("rc-indpro")} ${cc("rc-permits")}
        </div>

        <div class="section-title">Consumer & Business Confidence Proxies</div>
        <div class="chart-grid">
          ${cc("rc-saving")} ${cc("rc-realwages")}
        </div>

        <div class="section-title">Money & Credit Growth</div>
        <div class="chart-grid">
          ${cc("rc-m2-yoy")} ${cc("rc-bank-credit")}
        </div>`;
    },
    async load(range) {
      // Render charts first (parallel)
      renderSpread("rc-2s10s",  "TREASURY_10Y", "TREASURY_2Y",  "10Y − 2Y Spread",  range);
      renderSpread("rc-3m10y",  "TREASURY_10Y", "TBILL_3M",     "10Y − 3M Spread",  range);
      renderLine("rc-sahm",   "UNEMPLOYMENT_RATE", "Unemployment Rate (Sahm proxy)", C.amber, range, "%");
      renderMultiLine("rc-claims", [
        { id:"INITIAL_CLAIMS",    label:"Initial Claims",    color:C.red    },
        { id:"CONTINUING_CLAIMS", label:"Continuing Claims", color:C.amber  },
      ], "Jobless Claims", range, "Thousands");
      renderSpread("rc-credit-spread", "BAA_YIELD",  "TREASURY_10Y", "BAA − 10Y Spread",   range);
      renderSpread("rc-hy-spread",     "BAA_YIELD",  "AAA_YIELD",    "BAA − AAA (HY proxy)", range);
      renderYoY("rc-indpro",   "INDUSTRIAL_PRODUCTION", "Industrial Production YoY", C.blue,   range);
      renderYoY("rc-permits",  "BUILDING_PERMITS",       "Building Permits YoY",      C.purple, range);
      renderLine("rc-saving",    "PERSONAL_SAVING_RATE",  "Personal Saving Rate",   C.silver, range, "%");
      renderYoY("rc-realwages",  "AVG_HOURLY_EARNINGS",   "Avg Hourly Earnings YoY", C.green,  range);
      renderYoY("rc-m2-yoy",      "M2",                    "M2 Growth YoY",           C.blue,  range);
      renderYoY("rc-bank-credit", "COMMERCIAL_BANK_CREDIT","Bank Credit Growth YoY",  C.green, range);

      // Signal board — compute after data is available
      renderRecessionSignalBoard("rc-signal-board", range);
    },
  },

  // ── Fed Watch ─────────────────────────────────────────────────────────────
  fedwatch: {
    title: "Fed Watch",
    subtitle: "Policy rates, market-implied expectations, Fed balance sheet",
    render(range) {
      return `
        <div class="section-title">Policy Rate Path</div>
        <div class="chart-grid">
          ${cc("fw-fedfunds")} ${cc("fw-sofr")}
        </div>

        <div class="section-title">Market-Implied Rate Expectations</div>
        ${cc("fw-implied-curve", "min-height:340px; margin-bottom:16px;")}

        <div class="section-title">FOMC Meeting Probabilities</div>
        <div id="fw-prob-strip" style="margin-bottom:16px;"><div class="loading-placeholder"><span class="spinner"></span></div></div>

        <div class="section-title">Fed Balance Sheet (QE/QT)</div>
        <div class="chart-grid">
          ${cc("fw-bs")} ${cc("fw-bs-yoy")}
        </div>

        <div class="section-title">Real Policy Rate</div>
        <div class="chart-grid">
          ${cc("fw-real-rate")} ${cc("fw-fedfunds-cpi")}
        </div>

        <div class="section-title">Fed-Sensitive Spreads</div>
        <div class="chart-grid">
          ${cc("fw-2s10s")} ${cc("fw-mortgage-spread")}
        </div>`;
    },
    async load(range) {
      renderLine("fw-fedfunds", "FED_FUNDS",       "Effective Fed Funds Rate", C.green,  range, "%");
      renderLine("fw-sofr",     "SOFR",            "SOFR",                     C.blue,   range, "%");

      // Implied policy rate curve from SOFR tenors (1M, 3M, 6M, 1Y, 2Y)
      await renderImpliedRateCurve("fw-implied-curve");

      // FOMC probability strip — built from SOFR futures approximation
      await renderFOMCProbStrip("fw-prob-strip");

      renderLineScaled("fw-bs", "FED_BALANCE_SHEET", "Fed Balance Sheet", C.red, range, "USD Trillions", 1e6);
      renderYoY( "fw-bs-yoy",  "FED_BALANCE_SHEET", "Fed Balance Sheet", C.red, range);

      // Real rate = Fed Funds - Core CPI YoY (approximated from levels)
      renderRealRate("fw-real-rate", range);

      renderMultiLine("fw-fedfunds-cpi", [
        { id:"FED_FUNDS", label:"Fed Funds",  color:C.green },
        { id:"CORE_CPI",  label:"Core CPI",   color:C.red   },
      ], "Fed Funds vs Core CPI Level", range, "%");

      renderSpread("fw-2s10s",         "TREASURY_10Y", "TREASURY_2Y",  "10Y − 2Y Spread",       range);
      renderSpread("fw-mortgage-spread","MORTGAGE_30Y", "TREASURY_10Y", "Mortgage − 10Y Spread", range);
    },
  },

  // ── Markets ───────────────────────────────────────────────────────────────
  markets: {
    title: "Markets",
    subtitle: "Equities, volatility, credit yields",
    render(range) {
      return `
        <div class="section-title">Equities & Volatility</div>
        <div class="chart-grid">
          ${cc("mk-sp500")} ${cc("mk-vix")}
        </div>

        <div class="section-title">Credit Markets</div>
        <div class="chart-grid">
          ${cc("mk-credit-yields")} ${cc("mk-credit-spread")}
        </div>

        <div class="section-title">Mortgage</div>
        <div class="chart-grid single">
          ${cc("mk-mortgage")}
        </div>`;
    },
    async load(range) {
      renderLine("mk-sp500",  "SP500", "S&P 500",             C.blue,  range);
      renderLine("mk-vix",    "VIX",   "VIX",                 C.red,   range);
      renderMultiLine("mk-credit-yields", [
        { id:"AAA_YIELD", label:"AAA",  color:C.green },
        { id:"BAA_YIELD", label:"BAA",  color:C.amber },
      ], "Corporate Bond Yields", range, "%");
      renderSpread("mk-credit-spread", "BAA_YIELD", "AAA_YIELD", "BAA - AAA Spread", range);
      renderLine("mk-mortgage","MORTGAGE_30Y","30Y Mortgage Rate",C.purple,range, "%");
    },
  },
  // ── Calendar ──────────────────────────────────────────────────────────────
  calendar: {
    title: "Calendar",
    subtitle: "Upcoming FOMC decisions and key data releases",
    hideRangeSelector: true,
    render(range) {
      return `
        <div id="cal-next" style="margin-bottom:20px;"><div class="loading-placeholder" style="min-height:80px;"><span class="spinner"></span></div></div>
        <div class="section-title">Filter</div>
        <div class="range-btns" id="cal-filters" style="margin-bottom:18px;">
          ${[["all","All"],["fomc","FOMC"],["jobs","Jobs"],["inflation","Prices"],["gdp","GDP"],["pce","PCE"],["trade","Trade"]]
            .map(([id, label]) => `<button class="range-btn${id === "all" ? " active" : ""}" data-filter="${id}" onclick="setCalendarFilter('${id}')">${label}</button>`)
            .join("")}
        </div>
        <div id="cal-list"></div>`;
    },
    async load(range) {
      renderCalendar();
    },
  },
};

// ── Router ────────────────────────────────────────────────────────────────────
let currentPage  = "overview";
let currentRange = "5Y";

function navigate(pageId) {
  currentPage = pageId;
  renderPage();
  // Update sidebar active state
  document.querySelectorAll(".nav-link").forEach(el => {
    el.classList.toggle("active", el.dataset.page === pageId);
  });
}
window.navigate = navigate;

function setRange(range) {
  currentRange = range;
  document.querySelectorAll(".range-btn").forEach(el => {
    el.classList.toggle("active", el.dataset.range === range);
  });
  // Fully reset any existing Plotly charts. Plotly.react preserves a
  // user's manual zoom/pan across data updates unless the plot is purged
  // first — without this, clicking 5Y/10Y/20Y/MAX after zooming in on a
  // chart would keep showing the old (zoomed) window instead of the full
  // new range.
  document.querySelectorAll(".js-plotly-plot").forEach(el => {
    try { Plotly.purge(el); } catch (e) { /* noop */ }
    el._isPlotly = false;
  });
  // Re-load charts only
  const page = PAGES[currentPage];
  if (page) page.load(currentRange);
}
window.setRange = setRange;

function renderPage() {
  const page = PAGES[currentPage];
  if (!page) return;

  const content = document.getElementById("content");
  content.innerHTML = `
    <div class="page-header">
      <div class="page-title">${page.title}</div>
      <div class="page-subtitle">${page.subtitle}</div>
    </div>
    ${page.hideRangeSelector ? "" : `
    <div class="range-btns">
      ${["5Y","10Y","20Y","MAX"].map(r =>
        `<button class="range-btn${r === currentRange ? " active" : ""}" data-range="${r}" onclick="setRange('${r}')">${r}</button>`
      ).join("")}
    </div>`}
    ${page.render(currentRange)}
    <div id="footer" class="footer">
      For informational purposes only
    </div>`;

  page.load(currentRange);
}

// ── Init ──────────────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  // Build sidebar nav
  const nav = document.getElementById("sidebar-nav");
  const sections = [
    { label: "Dashboard",    pages: ["overview", "calendar"] },
    { label: "Analysis",     pages: ["recession","fedwatch"] },
    { label: "Real Economy", pages: ["output","prices","labor","consumer","housing","business"] },
    { label: "Financial",    pages: ["money","rates","external","markets"] },
  ];
  const labels = {
    overview:"Overview", calendar:"Calendar", output:"Output", prices:"Prices", labor:"Labor",
    consumer:"Consumer", housing:"Housing", business:"Business",
    money:"Money & Banking", rates:"Rates", external:"External", markets:"Markets",
    recession:"Recession Indicators", fedwatch:"Fed Watch",
  };
  sections.forEach(sec => {
    nav.insertAdjacentHTML("beforeend", `<div class="nav-section-label">${sec.label}</div>`);
    sec.pages.forEach(pid => {
      nav.insertAdjacentHTML("beforeend", `
        <a class="nav-link${pid === currentPage ? " active" : ""}" data-page="${pid}" onclick="navigate('${pid}')">
          <span class="nav-dot"></span>${labels[pid]}
        </a>`);
    });
  });

  navigate("overview");
});
})();