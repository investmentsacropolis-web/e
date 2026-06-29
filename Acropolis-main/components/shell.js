/**
 * components/shell.js — Acropolis shared shell
 *
 * Injects the topbar and sidebar into any page. Import this script in any
 * Acropolis HTML page *before* your page-specific script. It will:
 *   1. Render the topbar with the correct "current" link highlighted.
 *   2. Leave the sidebar nav (#sidebar-nav) untouched — each page script
 *      populates it directly on DOMContentLoaded.
 *
 * Usage in any page:
 *   <script src="../components/shell.js"></script>
 *
 * To mark a topbar link as "current", set a data attribute on <body>:
 *   <body data-page="equity-research">
 *
 * Valid page values: equity-research, dcf, options, economy
 */

(function () {

  // ── Topbar links ─────────────────────────────────────────────────────────────
  const TOPBAR_LINKS = [
    { id: "home",            label: "Home",            href: "/" },
    { id: "equity-research", label: "Equity Research", href: "/equity-research/" },
    { id: "economy",       label: "Economy",         href: "/economy/" },
    { id: "portfolio-backtester", label: "Portfolio Backtester", href: "/portfolio-backtester/" },
    { id: "etf-explorer",    label: "ETF Explorer",    href: "/etf-explorer/" },
    { id: "dcf",             label: "DCF",             href: "/dcf/" },
    { id: "comps",           label: "Comps",           href: "/comps/" },
    { id: "fixed-income",    label: "Fixed Income",    href: "/fixed-income/" },
    { id: "options",         label: "Options",         href: "/options/" },
  ];

  const currentPage = document.body.dataset.page || "";

  // ── Build topbar ──────────────────────────────────────────────────────────────
  function buildTopbar() {
    const topbar = document.getElementById("topbar");
    if (!topbar) return;

    const linksHTML = TOPBAR_LINKS.map(({ id, label, href }) => {
      const isCurrent = id === currentPage;
      return isCurrent
        ? `<span class="topbar-link current">${label}</span>`
        : `<a href="${href}" class="topbar-link">${label}</a>`;
    }).join("");

    const right = topbar.querySelector(".topbar-right");
    const rightHTML = right ? right.outerHTML : `<div class="topbar-right"></div>`;

    topbar.innerHTML = `
      <nav class="topbar-links">
        <span class="topbar-wordmark">Acropolis</span>
        ${linksHTML}
      </nav>
      ${rightHTML}
    `;
  }

  // ── Run on DOM ready ──────────────────────────────────────────────────────────
  function init() {
    buildTopbar();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

})();