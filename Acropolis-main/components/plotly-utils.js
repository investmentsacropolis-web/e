/**
 * components/plotly-utils.js — Acropolis shared chart helpers
 *
 * Provides the colour palette, NBER recession shapes, and the base
 * Plotly layout factory used across all Acropolis pages.
 *
 * Depends on: Plotly.js (must be loaded before this script)
 *
 * Usage:
 *   <script src="https://cdnjs.cloudflare.com/ajax/libs/plotly.js/2.32.0/plotly.min.js"></script>
 *   <script src="../components/plotly-utils.js"></script>
 */

// ── Colour palette ────────────────────────────────────────────────────────────
const C = {
  blue:    "#6B9EC4",
  green:   "#6BAF8A",
  red:     "#C47060",
  silver:  "#C8C8C8",
  amber:   "#C4A84A",
  purple:  "#9B80C4",
  bg:      "#2A2A2A",
  surface: "#363636",
  grid:    "#3E3E3E",
  tick:    "#C0C0C0",
  title:   "#E8E8E8",
  hover:   "#F2F2F2",
  zero:    "#FFFFFF",
};

const PALETTE = [C.blue, C.green, C.red, C.amber, C.purple, C.silver];

// ── NBER Recession bands ──────────────────────────────────────────────────────
const NBER_RECESSIONS = [
  ["1960-04-01", "1961-02-01"],
  ["1969-12-01", "1970-11-01"],
  ["1973-11-01", "1975-03-01"],
  ["1980-01-01", "1980-07-01"],
  ["1981-07-01", "1982-11-01"],
  ["1990-07-01", "1991-03-01"],
  ["2001-03-01", "2001-11-01"],
  ["2007-12-01", "2009-06-01"],
  ["2020-02-01", "2020-04-01"],
];

/**
 * Returns Plotly shape objects for NBER recession bands.
 * @param {string} [xMin] - ISO date string
 * @param {string} [xMax] - ISO date string
 */
function recessionShapes(xMin, xMax) {
  return NBER_RECESSIONS
    .filter(([s, e]) => (!xMax || s <= xMax) && (!xMin || e >= xMin))
    .flatMap(([s, e]) => [
      {
        type: "rect", xref: "x", yref: "paper",
        x0: s, x1: e, y0: 0, y1: 1,
        fillcolor: "rgba(196,168,74,0.13)",
        line: { width: 0 },
        layer: "below",
      },
      {
        type: "line", xref: "x", yref: "paper",
        x0: s, x1: s, y0: 0, y1: 1,
        line: { color: "rgba(196,168,74,0.35)", width: 1, dash: "dot" },
        layer: "below",
      },
    ]);
}

/**
 * Merges recession shapes into an existing Plotly layout object.
 */
function withRecessions(layoutObj, dates) {
  const xMin = dates && dates.length ? dates[0] : undefined;
  const xMax = dates && dates.length ? dates[dates.length - 1] : undefined;
  const existing = layoutObj.shapes || [];
  return { ...layoutObj, shapes: [...recessionShapes(xMin, xMax), ...existing] };
}

/**
 * Returns the base Plotly layout config for any Acropolis chart.
 * @param {string} title
 * @param {string} [yLabel]
 * @param {Object} [overrides]   - merged onto the returned layout
 */
function baseLayout(title = "", yLabel = "", overrides = {}) {
  return {
    title: {
      text: title,
      font: { family: "monospace", size: 12, color: C.title },
      x: 0.01, xanchor: "left",
    },
    paper_bgcolor: C.surface,
    plot_bgcolor:  C.surface,
    font: { family: "monospace", color: C.tick, size: 11 },
    margin: { t: 36, r: 18, b: 40, l: 52 },
    xaxis: {
      gridcolor: C.grid,
      linecolor: C.grid,
      tickfont:  { size: 10, color: C.tick },
      showgrid:  true,
    },
    yaxis: {
      gridcolor: C.grid,
      linecolor: C.grid,
      tickfont:  { size: 10, color: C.tick },
      title: { text: yLabel, font: { size: 10, color: C.tick } },
      showgrid:  true,
      zeroline:  true,
      zerolinecolor: "rgba(255,255,255,0.15)",
      zerolinewidth: 1,
    },
    legend: {
      bgcolor: "rgba(0,0,0,0)",
      font: { size: 10, color: C.tick },
    },
    hovermode: "x unified",
    hoverlabel: {
      bgcolor: "#1A1A1A",
      bordercolor: "#555",
      font: { family: "monospace", size: 11 },
    },
    ...overrides,
  };
}

/**
 * Clips a paired [dates, values] series to the last N years.
 * @param {string[]} dates
 * @param {number[]} values
 * @param {string}   range  - "5Y" | "10Y" | "20Y" | "MAX"
 * @returns {{ dates: string[], values: number[] }}
 */
function clipToRange(dates, values, range) {
  if (range === "MAX" || !dates.length) return { dates, values };
  const years = parseInt(range, 10);
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - years);
  const iso = cutoff.toISOString().slice(0, 10);
  const idx = dates.findIndex(d => d >= iso);
  if (idx <= 0) return { dates, values };
  return { dates: dates.slice(idx), values: values.slice(idx) };
}

/**
 * Renders a "no data" placeholder inside a chart container.
 * @param {string} containerId
 * @param {string} [msg]
 */
function showChartError(containerId, msg = "No data") {
  const el = document.getElementById(containerId);
  if (el) el.innerHTML = `<div class="loading-placeholder" style="color:#C47060;">${msg}</div>`;
}