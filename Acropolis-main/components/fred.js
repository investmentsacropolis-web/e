/**
 * components/fred.js — Acropolis FRED data helpers
 *
 * Thin wrappers around the local /fred/* proxy (server.py).
 * Import after shell.js and plotly-utils.js.
 *
 * All functions return Promises and throw on HTTP/network error.
 */

const FRED_BASE = "/fred/series/observations";
const FRED_INFO = "/fred/series";

// Series ID aliases — add new ones here to avoid magic strings elsewhere
const SERIES = {
  GDP:               "GDP",
  REAL_GDP:          "GDPC1",
  GDP_GROWTH:        "A191RL1Q225SBEA",
  UNEMPLOYMENT:      "UNRATE",
  PARTICIPATION:     "CIVPART",
  NONFARM_PAYROLLS:  "PAYEMS",
  CPI:               "CPIAUCSL",
  CORE_CPI:          "CPILFESL",
  PCE:               "PCEPI",
  CORE_PCE:          "PCEPILFE",
  PPI:               "PPIACO",
  FED_FUNDS:         "FEDFUNDS",
  SOFR:              "SOFR",
  TREASURY_2Y:       "DGS2",
  TREASURY_5Y:       "DGS5",
  TREASURY_10Y:      "DGS10",
  TREASURY_30Y:      "DGS30",
  MORTGAGE_30Y:      "MORTGAGE30US",
  SP500:             "SP500",
  VIX:               "VIXCLS",
  AAA_YIELD:         "AAA",
  BAA_YIELD:         "BAA",
  RETAIL_SALES:      "RSXFS",
  CONSUMER_SENTIMENT:"UMCSENT",
  HOUSING_STARTS:    "HOUST",
  NAHB_INDEX:        "NAHBMMI",
  INDUSTRIAL_PROD:   "INDPRO",
  ISM_MANUFACTURING: "MANEMP",
  FED_BALANCE_SHEET: "WALCL",
  M2:                "M2SL",
  YIELD_SPREAD:      "T10Y2Y",
};

/**
 * Fetch observations for a FRED series.
 * @param {string} seriesId   - FRED series ID
 * @param {string} [startDate]- ISO date string, e.g. "2000-01-01"
 * @returns {Promise<{dates: string[], values: number[]}>}
 */
async function fredSeries(seriesId, startDate = "1950-01-01") {
  const params = new URLSearchParams({
    series_id: seriesId,
    observation_start: startDate,
    sort_order: "asc",
  });
  const res = await fetch(`${FRED_BASE}?${params}`);
  if (!res.ok) throw new Error(`FRED ${seriesId}: HTTP ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(`FRED ${seriesId}: ${data.error}`);

  const obs = (data.observations || []).filter(o => o.value !== ".");
  return {
    dates:  obs.map(o => o.date),
    values: obs.map(o => parseFloat(o.value)),
  };
}

/**
 * Fetch metadata for a FRED series (title, units, frequency, etc.).
 * @param {string} seriesId
 * @returns {Promise<Object>}
 */
async function fredMeta(seriesId) {
  const params = new URLSearchParams({ series_id: seriesId });
  const res = await fetch(`${FRED_INFO}?${params}`);
  if (!res.ok) throw new Error(`FRED meta ${seriesId}: HTTP ${res.status}`);
  const data = await res.json();
  return data.seriess?.[0] || {};
}

/**
 * Fetch S&P 500 history via the /yfinance/ proxy (server.py).
 * @param {string} [startDate]
 * @returns {Promise<{dates: string[], values: number[]}>}
 */
async function fetchSP500(startDate = "1950-01-01") {
  const params = new URLSearchParams({ start: startDate });
  const res = await fetch(`/yfinance/?${params}`);
  if (!res.ok) throw new Error(`yfinance SP500: HTTP ${res.status}`);
  return res.json();
}

/**
 * Compute YoY % change on a {dates, values} series.
 * Matches dates approximately (±1 month tolerance) to handle
 * monthly vs quarterly series alignment.
 */
function computeYoY(dates, values) {
  const out = { dates: [], values: [] };
  for (let i = 0; i < dates.length; i++) {
    const targetDate = new Date(dates[i]);
    targetDate.setFullYear(targetDate.getFullYear() - 1);
    const iso = targetDate.toISOString().slice(0, 10);
    // find nearest past index
    let best = -1, bestDiff = Infinity;
    for (let j = 0; j < i; j++) {
      const diff = Math.abs(new Date(dates[j]) - targetDate);
      if (diff < bestDiff && diff < 45 * 86400_000) { bestDiff = diff; best = j; }
    }
    if (best >= 0 && values[best] !== 0) {
      out.dates.push(dates[i]);
      out.values.push(((values[i] - values[best]) / Math.abs(values[best])) * 100);
    }
  }
  return out;
}
