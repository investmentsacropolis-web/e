import http.server
import os
import sys
import json
import urllib.request
import urllib.parse
import socketserver

PORT = int(os.environ.get("PORT", 8080))
DIR  = os.path.dirname(os.path.abspath(__file__))

# Read API key from environment first, fall back to secrets.toml for local dev
def load_api_key():
    env_key = os.environ.get("FRED_API_KEY")
    if env_key:
        print(f"API key loaded from environment ({env_key[:8]}...)")
        return env_key

    secrets_path = os.path.join(DIR, "secrets.toml")
    if not os.path.exists(secrets_path):
        print("No FRED_API_KEY env var set and secrets.toml not found.")
        return None
    try:
        if sys.version_info >= (3, 11):
            import tomllib
            with open(secrets_path, "rb") as f:
                cfg = tomllib.load(f)
        else:
            try:
                import tomli as tomllib
            except ImportError:
                print("Install tomli: pip install tomli")
                return None
            with open(secrets_path, "rb") as f:
                cfg = tomllib.load(f)
        key = cfg.get("fred", {}).get("api_key", "")
        if not key or key == "YOUR_FRED_API_KEY_HERE":
            print("Set your FRED API key in secrets.toml or FRED_API_KEY env var")
            return None
        print(f"API key loaded from secrets.toml ({key[:8]}...)")
        return key
    except Exception as e:
        print(f"Could not read secrets.toml: {e}")
        return None


FRED_API_KEY = load_api_key()

# ETF Explorer bundled reference data (lazy-loaded)
_ETF_ASSETS = {}

def _load_etf_assets():
    """Load bundled ETF reference data (sector map, sample holdings/sectors,
    provider product IDs) once and cache in memory."""
    if _ETF_ASSETS:
        return _ETF_ASSETS
    assets_dir = os.path.join(DIR, "etf-explorer", "data")
    names = {
        "symbol_sector_map": "symbol_sector_map.json",
        "sample_holdings":   "sample_holdings.json",
        "sample_sectors":    "sample_sectors.json",
        "provider_maps":     "provider_maps.json",
    }
    for key, fname in names.items():
        path = os.path.join(assets_dir, fname)
        try:
            with open(path) as f:
                _ETF_ASSETS[key] = json.load(f)
        except Exception as e:
            print(f"Could not load ETF asset {fname}: {e}")
            _ETF_ASSETS[key] = {}
    return _ETF_ASSETS


# Request handler
def _fetch_etf_holdings_sectors(t, symbol, assets):
    """
    Shared holdings/sectors resolver used by both the single-ETF endpoint and
    the screener endpoint. Returns (holdings, sectors, used_sample).
    """
    import math

    def _nan(v):
        try:
            if v is None:
                return None
            f = float(v)
            return None if (math.isnan(f) or math.isinf(f)) else f
        except (TypeError, ValueError):
            return None

    sym_sector_map  = assets.get("symbol_sector_map", {})
    sample_holdings = assets.get("sample_holdings", {})
    sample_sectors  = assets.get("sample_sectors", {})

    holdings = []
    sectors = {}
    try:
        fd = t.funds_data
        if fd is not None:
            th = fd.top_holdings
            if th is not None and not th.empty:
                df = th.reset_index()
                df.columns = [str(c).lower() for c in df.columns]
                sym_col  = next((c for c in df.columns if "symbol" in c or "ticker" in c), df.columns[0])
                name_col = next((c for c in df.columns if "name" in c or "holding" in c), None)
                wt_col   = next((c for c in df.columns if "weight" in c or "%" in c), None)
                for _, row in df.iterrows():
                    sym2 = str(row[sym_col]).upper().strip()
                    if not sym2 or sym2 in ("NAN", "N/A", "-"):
                        continue
                    wt = _nan(row[wt_col]) if wt_col else 0.0
                    if wt and wt <= 1.0:
                        wt *= 100
                    holdings.append({
                        "symbol":  sym2,
                        "company": str(row[name_col]).strip() if name_col else sym2,
                        "sector":  sym_sector_map.get(sym2, "Other"),
                        "weight":  round(wt or 0.0, 4),
                    })
            sw = fd.sector_weightings
            if sw is not None and not sw.empty:
                for _, row in sw.iterrows():
                    sec = str(row.iloc[0]).strip()
                    wt = _nan(row.iloc[-1])
                    if wt is None:
                        continue
                    if wt <= 1.0:
                        wt *= 100
                    if sec and wt > 0:
                        sectors[sec] = round(sectors.get(sec, 0) + wt, 4)
    except Exception as e:
        print(f"  ETF funds_data error for {symbol}: {e}")

    used_sample = False
    if len(holdings) < 3 and symbol in sample_holdings:
        holdings = [dict(h) for h in sample_holdings[symbol]]
        used_sample = True
    if (not sectors or len(sectors) <= 1) and symbol in sample_sectors:
        sectors = dict(sample_sectors[symbol])
        used_sample = True

    holdings.sort(key=lambda h: -(h.get("weight") or 0))
    return holdings, sectors, used_sample


class Handler(http.server.SimpleHTTPRequestHandler):

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIR, **kwargs)

    def log_message(self, fmt, *args):
        # Only log proxy requests, not static files
        first = str(args[0]) if args else ""
        if "/fred/" in first:
            print(f"  FRED   {first[:80]}")
        elif "/yfinance/" in first:
            print(f"  YFINANCE {first[:80]}")

    def do_GET(self):
        if self.path.startswith("/fred/"):
            self._proxy_fred()
        elif self.path.startswith("/yfinance/comps"):
            self._serve_yfinance_comps()
        elif self.path.startswith("/yfinance/history"):
            self._serve_yfinance_history()
        elif self.path.startswith("/yfinance/stock"):
            self._serve_yfinance_stock()
        elif self.path.startswith("/yfinance/movers"):
            self._serve_yfinance_movers()
        elif self.path.startswith("/yfinance/etf-screener"):
            self._serve_yfinance_etf_screener()
        elif self.path.startswith("/yfinance/etf"):
            self._serve_yfinance_etf()
        elif self.path.startswith("/yfinance/"):
            self._serve_yfinance_sp500()
        else:
            super().do_GET()

    def _proxy_fred(self):
        """Strip /fred/ prefix, append API key, proxy to FRED, return JSON."""
        if not FRED_API_KEY:
            self._json_error(500, "No FRED API key configured")
            return

        # /fred/series/observations?series_id=GDP&... -> FRED endpoint
        path_after = self.path[len("/fred"):]  # e.g. /series/observations?...
        parsed = urllib.parse.urlparse(path_after)
        params = urllib.parse.parse_qs(parsed.query, keep_blank_values=True)
        # Inject API key and force JSON
        params["api_key"]   = [FRED_API_KEY]
        params["file_type"] = ["json"]
        new_query = urllib.parse.urlencode({k: v[0] for k, v in params.items()})
        fred_url = f"https://api.stlouisfed.org/fred{parsed.path}?{new_query}"

        try:
            req = urllib.request.Request(fred_url, headers={"User-Agent": "AcropolisEcon/1.0"})
            with urllib.request.urlopen(req, timeout=15) as resp:
                body = resp.read()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(body)
        except urllib.error.HTTPError as e:
            body = e.read()
            self._json_error(e.code, f"FRED error {e.code}: {body[:200].decode('utf-8','replace')}")
        except Exception as e:
            self._json_error(500, str(e))

    def _json_ok(self, data):
        body = json.dumps(data, default=str).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def _json_error(self, code, msg):
        body = json.dumps({"error": msg}).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def _serve_yfinance_comps(self):
        """
        Fetch compact fundamentals for a ticker for Comp Analysis.
        GET /yfinance/comps?symbol=AAPL
        Returns a flat JSON dict of key valuation / margin metrics.
        """
        parsed = urllib.parse.urlparse(self.path)
        params = urllib.parse.parse_qs(parsed.query, keep_blank_values=True)
        symbol = params.get("symbol", [""])[0].strip().upper()
        if not symbol:
            self._json_error(400, "Missing symbol parameter")
            return
        try:
            import yfinance as yf
            import math

            def _nan(v):
                try:
                    if v is None:
                        return None
                    f = float(v)
                    return None if (math.isnan(f) or math.isinf(f)) else f
                except (TypeError, ValueError):
                    return None

            def _pct(v):
                n = _nan(v)
                return round(n * 100, 1) if n is not None else None

            t = yf.Ticker(symbol)
            info = t.info or {}

            if not info.get("regularMarketPrice") and not info.get("currentPrice"):
                self._json_error(404, f"Ticker '{symbol}' not found or no data available.")
                return

            mc = info.get("marketCap")
            payload = {
                "ticker":        symbol,
                "name":          info.get("shortName", symbol),
                "sector":        info.get("sector", "—"),
                "industry":      info.get("industry", "—"),
                "price":         _nan(info.get("currentPrice") or info.get("regularMarketPrice")),
                "market_cap":    round(mc / 1e9, 2) if mc else None,
                "pe":            _nan(info.get("trailingPE")),
                "ev_ebitda":     _nan(info.get("enterpriseToEbitda")),
                "ps":            _nan(info.get("priceToSalesTrailing12Months")),
                "pb":            _nan(info.get("priceToBook")),
                "ev_rev":        _nan(info.get("enterpriseToRevenue")),
                "gross_margin":  _pct(info.get("grossMargins")),
                "ebitda_margin": _pct(info.get("ebitdaMargins")),
                "net_margin":    _pct(info.get("profitMargins")),
                "rev_growth":    _pct(info.get("revenueGrowth")),
                "roe":           _pct(info.get("returnOnEquity")),
                "beta":          _nan(info.get("beta")),
                "52w_high":      _nan(info.get("fiftyTwoWeekHigh")),
                "52w_low":       _nan(info.get("fiftyTwoWeekLow")),
                "div_yield":     round(_nan(info.get("dividendYield")) * 100, 2) if info.get("dividendYield") else None,
                "exchange":      info.get("exchange", ""),
                "currency":      info.get("currency", "USD"),
            }
            self._json_ok(payload)
        except ImportError:
            self._json_error(500, "yfinance not installed — run: pip install yfinance")
        except Exception as e:
            self._json_error(500, str(e))

    def _serve_yfinance_history(self):
        """
        Fetch 3-year daily close price history for a ticker.
        GET /yfinance/history?symbol=AAPL
        Returns { dates: [str], values: [float] }
        """
        parsed = urllib.parse.urlparse(self.path)
        params = urllib.parse.parse_qs(parsed.query, keep_blank_values=True)
        symbol = params.get("symbol", [""])[0].strip().upper()
        if not symbol:
            self._json_error(400, "Missing symbol parameter")
            return
        start = params.get("start", ["1970-01-01"])[0]
        try:
            import yfinance as yf
            hist = yf.Ticker(symbol).history(start=start, auto_adjust=True)
            if hist.empty:
                self._json_ok({"dates": [], "values": []})
                return
            dates  = [d.strftime("%Y-%m-%d") for d in hist.index]
            values = [round(float(v), 4) for v in hist["Close"]]
            self._json_ok({"dates": dates, "values": values})
        except ImportError:
            self._json_error(500, "yfinance not installed")
        except Exception as e:
            self._json_error(500, str(e))

    def _serve_yfinance_sp500(self):
        """Fetch S&P 500 history via yfinance and return JSON {dates, values}."""
        parsed = urllib.parse.urlparse(self.path)
        params = urllib.parse.parse_qs(parsed.query, keep_blank_values=True)
        start  = params.get("start", ["1950-01-01"])[0]
        try:
            import yfinance as yf
            ticker = yf.Ticker("^GSPC")
            hist = ticker.history(start=start, auto_adjust=True)
            dates  = [d.strftime("%Y-%m-%d") for d in hist.index]
            values = [round(float(v), 2) for v in hist["Close"]]
            self._json_ok({"dates": dates, "values": values})
        except ImportError:
            self._json_error(500, "yfinance not installed — run: pip install yfinance")
        except Exception as e:
            self._json_error(500, str(e))

    def _serve_yfinance_stock(self):
        """
        Fetch full equity data for a ticker and return structured JSON.
        Called by equity.js: /yfinance/stock?symbol=AAPL
        """
        parsed = urllib.parse.urlparse(self.path)
        params = urllib.parse.parse_qs(parsed.query, keep_blank_values=True)
        symbol = params.get("symbol", [""])[0].strip().upper()
        if not symbol:
            self._json_error(400, "Missing symbol parameter")
            return
        try:
            import yfinance as yf
            import math

            t = yf.Ticker(symbol)
            info = t.info or {}

            # Validate — yfinance returns a minimal dict for invalid tickers
            if not info.get("regularMarketPrice") and not info.get("currentPrice") \
                    and not info.get("longName") and not info.get("shortName"):
                self._json_error(404, f"Ticker '{symbol}' not found or no data available.")
                return

            def _nan(v):
                """Convert NaN/inf to None for JSON serialisation."""
                try:
                    if v is None:
                        return None
                    f = float(v)
                    return None if (math.isnan(f) or math.isinf(f)) else f
                except (TypeError, ValueError):
                    return None

            def _df_to_obj(df, max_cols=10):
                """
                Serialise a pandas DataFrame (rows = line items, cols = dates)
                into {years:[str], "<row>":[val,...], ...}.
                Most-recent columns first in yfinance; we flip to oldest-first.
                """
                if df is None or df.empty:
                    return {"years": []}
                # Keep at most max_cols columns
                cols = list(df.columns)[-max_cols:]
                df = df[cols]
                # Flip to chronological order (oldest left)
                df = df[df.columns[::-1]]
                out = {}
                out["years"] = [
                    str(c.year) if hasattr(c, "year") else str(c)[:10]
                    for c in df.columns
                ]
                for idx in df.index:
                    vals = [_nan(df.loc[idx, c]) for c in df.columns]
                    out[str(idx)] = vals
                return out

            def _quarterly_df_to_obj(df, max_cols=8):
                """Like _df_to_obj but uses YYYY-MM-DD as the period label."""
                if df is None or df.empty:
                    return {"years": []}
                cols = list(df.columns)[-max_cols:]
                df = df[cols]
                df = df[df.columns[::-1]]
                out = {}
                out["years"] = [
                    c.strftime("%Y-%m-%d") if hasattr(c, "strftime") else str(c)[:10]
                    for c in df.columns
                ]
                for idx in df.index:
                    vals = [_nan(df.loc[idx, c]) for c in df.columns]
                    out[str(idx)] = vals
                return out

            # Financial statements
            income   = _df_to_obj(t.financials)
            balance  = _df_to_obj(t.balance_sheet)
            cashflow = _df_to_obj(t.cashflow)

            income_q   = _quarterly_df_to_obj(t.quarterly_financials)
            balance_q  = _quarterly_df_to_obj(t.quarterly_balance_sheet)
            cashflow_q = _quarterly_df_to_obj(t.quarterly_cashflow)

            # Price history
            try:
                ph = t.history(period="max", auto_adjust=True)
                price_history = {
                    "dates":  [d.strftime("%Y-%m-%d") for d in ph.index],
                    "values": [round(float(v), 4) for v in ph["Close"]],
                }
            except Exception:
                price_history = {"dates": [], "values": []}

            # News
            try:
                news = t.news or []
            except Exception:
                news = []

            # Analyst price targets
            try:
                apt_raw = t.analyst_price_targets
                if isinstance(apt_raw, dict):
                    analyst_price_targets = {
                        k: _nan(v) for k, v in apt_raw.items()
                    }
                else:
                    analyst_price_targets = None
            except Exception:
                analyst_price_targets = None

            # Earnings estimates
            try:
                ee_df = t.earnings_estimate
                if ee_df is not None and not ee_df.empty:
                    earnings_estimate = [
                        {
                            "period":           str(idx),
                            "avg":              _nan(row_data.get("avg")),
                            "low":              _nan(row_data.get("low")),
                            "high":             _nan(row_data.get("high")),
                            "numberOfAnalysts": _nan(row_data.get("numberOfAnalysts")),
                        }
                        for idx, row_data in ee_df.iterrows()
                    ]
                else:
                    earnings_estimate = []
            except Exception:
                earnings_estimate = []

            # Revenue estimates
            try:
                re_df = t.revenue_estimate
                if re_df is not None and not re_df.empty:
                    revenue_estimate = [
                        {
                            "period":           str(idx),
                            "avg":              _nan(row_data.get("avg")),
                            "low":              _nan(row_data.get("low")),
                            "high":             _nan(row_data.get("high")),
                            "numberOfAnalysts": _nan(row_data.get("numberOfAnalysts")),
                        }
                        for idx, row_data in re_df.iterrows()
                    ]
                else:
                    revenue_estimate = []
            except Exception:
                revenue_estimate = []

            # Analyst recommendations
            try:
                recs_df = t.recommendations
                if recs_df is not None and not recs_df.empty:
                    recommendations = [
                        {
                            "period":     str(idx)[:10],
                            "strongBuy":  int(row_data.get("strongBuy",  0) or 0),
                            "buy":        int(row_data.get("buy",        0) or 0),
                            "hold":       int(row_data.get("hold",       0) or 0),
                            "sell":       int(row_data.get("sell",       0) or 0),
                            "strongSell": int(row_data.get("strongSell", 0) or 0),
                        }
                        for idx, row_data in recs_df.head(8).iterrows()
                    ]
                else:
                    recommendations = []
            except Exception:
                recommendations = []

            # Dividends (annual aggregate)
            try:
                divs = t.dividends
                if divs is not None and not divs.empty:
                    # Aggregate by year
                    div_by_year = {}
                    for ts, val in divs.items():
                        yr = str(ts.year) if hasattr(ts, "year") else str(ts)[:4]
                        div_by_year[yr] = div_by_year.get(yr, 0.0) + float(val)
                    sorted_years = sorted(div_by_year.keys())
                    dividends = {
                        "years":  sorted_years,
                        "values": [round(div_by_year[y], 4) for y in sorted_years],
                    }
                else:
                    dividends = {"years": [], "values": []}
            except Exception:
                dividends = {"years": [], "values": []}

            # Sanitise info dict (remove non-JSON-serialisable values)
            safe_info = {}
            for k, v in info.items():
                if isinstance(v, (str, bool, type(None))):
                    safe_info[k] = v
                elif isinstance(v, (int, float)):
                    safe_info[k] = _nan(v) if isinstance(v, float) else v
                else:
                    try:
                        safe_info[k] = _nan(float(v))
                    except (TypeError, ValueError):
                        pass  # skip unparseable fields

            payload = {
                "info":                  safe_info,
                "income":                income,
                "balance":               balance,
                "cashflow":              cashflow,
                "income_q":              income_q,
                "balance_q":             balance_q,
                "cashflow_q":            cashflow_q,
                "price_history":         price_history,
                "news":                  news,
                "analyst_price_targets": analyst_price_targets,
                "earnings_estimate":     earnings_estimate,
                "revenue_estimate":      revenue_estimate,
                "recommendations":       recommendations,
                "dividends":             dividends,
            }
            self._json_ok(payload)

        except ImportError:
            self._json_error(500, "yfinance not installed — run: pip install yfinance")
        except Exception as e:
            self._json_error(500, str(e))

    def _serve_yfinance_movers(self):
        """
        Return day gainers, losers, and most-active from Yahoo Finance screener.
        Called by equity.js: /yfinance/movers
        Response: {gainers:[...], losers:[...], active:[...]}
        """
        try:
            import math

            def _nan(v):
                try:
                    f = float(v)
                    return None if (math.isnan(f) or math.isinf(f)) else f
                except (TypeError, ValueError):
                    return None

            headers = {
                "User-Agent": "Mozilla/5.0 (compatible; AcropolisEcon/1.0)",
                "Accept": "application/json",
            }

            def _scrape(screen_id):
                url = (
                    "https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved"
                    f"?formatted=false&scrIds={screen_id}&count=5"
                )
                req = urllib.request.Request(url, headers=headers)
                with urllib.request.urlopen(req, timeout=8) as r:
                    data = json.loads(r.read())
                rows = (
                    data.get("finance", {})
                        .get("result", [{}])[0]
                        .get("quotes", [])
                )
                out = []
                for q in rows[:5]:
                    out.append({
                        "symbol":  q.get("symbol", ""),
                        "name":    q.get("shortName") or q.get("longName") or q.get("symbol", ""),
                        "price":   _nan(q.get("regularMarketPrice")),
                        "change":  _nan(q.get("regularMarketChangePercent")),
                        "mkt_cap": _nan(q.get("marketCap")),
                    })
                return out

            payload = {
                "gainers": _scrape("day_gainers"),
                "losers":  _scrape("day_losers"),
                "active":  _scrape("most_actives"),
            }
            self._json_ok(payload)

        except Exception as e:
            self._json_error(500, str(e))

    def _serve_yfinance_etf(self):
        """
        Fetch ETF metadata, price, history, holdings, and sector weights.
        GET /yfinance/etf?symbol=VOO&period=1Y
        Called by etf-explorer/etf_explorer.js
        """
        import math

        parsed = urllib.parse.urlparse(self.path)
        params = urllib.parse.parse_qs(parsed.query, keep_blank_values=True)
        symbol = params.get("symbol", [""])[0].strip().upper()
        period = params.get("period", ["1Y"])[0].strip().upper()
        if not symbol:
            self._json_error(400, "Missing symbol parameter")
            return

        PERIOD_MAP = {
            "1M": ("1mo", "1d"), "6M": ("6mo", "1d"), "1Y": ("1y", "1d"),
            "3Y": ("3y", "1wk"), "5Y": ("5y", "1wk"), "MAX": ("max", "1mo"),
        }
        yf_period, interval = PERIOD_MAP.get(period, ("1y", "1d"))

        def _nan(v):
            try:
                if v is None:
                    return None
                f = float(v)
                return None if (math.isnan(f) or math.isinf(f)) else f
            except (TypeError, ValueError):
                return None

        def _fmt_aum(v):
            v = _nan(v)
            if v is None:
                return None
            if v >= 1e12: return f"${v/1e12:.2f}T"
            if v >= 1e9:  return f"${v/1e9:.2f}B"
            if v >= 1e6:  return f"${v/1e6:.2f}M"
            return f"${v:,.0f}"

        assets = _load_etf_assets()

        try:
            import yfinance as yf

            t = yf.Ticker(symbol)
            info = t.info or {}

            if not info.get("regularMarketPrice") and not info.get("navPrice") \
                    and not info.get("longName") and not info.get("shortName"):
                self._json_error(404, f"Ticker '{symbol}' not found or no data available.")
                return

            price = _nan(info.get("regularMarketPrice") or info.get("navPrice")
                          or info.get("previousClose")) or 0.0
            prev_close = _nan(info.get("regularMarketPreviousClose") or info.get("previousClose")) or price
            change_amt = round(price - prev_close, 4) if prev_close else 0.0
            change_pct = round(change_amt / prev_close * 100, 4) if prev_close else 0.0

            div_yield = _nan(info.get("yield") or info.get("dividendYield")) or 0.0
            if div_yield and div_yield > 1:
                div_yield = div_yield / 100

            meta = {
                "ticker":         symbol,
                "name":           info.get("longName") or info.get("shortName") or symbol,
                "exchange":       info.get("exchange", "—"),
                "category":       info.get("category", "ETF"),
                "expense_ratio":  round((_nan(info.get("annualReportExpenseRatio")) or 0) * 100, 4),
                "aum":            _nan(info.get("totalAssets")),
                "aum_fmt":        _fmt_aum(info.get("totalAssets")),
                "nav":            _nan(info.get("navPrice")),
                "total_holdings": info.get("totalHoldings") or 0,
                "dividend_yield": round(div_yield * 100, 2),
            }
            price_payload = {
                "price": round(price, 4), "prev_close": round(prev_close, 4),
                "change_amt": change_amt, "change_pct": change_pct,
                "volume": info.get("regularMarketVolume") or info.get("volume") or 0,
            }

            # Price history
            try:
                hist = t.history(period=yf_period, interval=interval)
                history = {
                    "dates":  [d.strftime("%Y-%m-%d") for d in hist.index],
                    "values": [round(float(v), 4) for v in hist["Close"]],
                }
            except Exception:
                history = {"dates": [], "values": []}

            # Holdings + sectors (yfinance funds_data, sample-data fallback)
            holdings, sectors, used_sample = _fetch_etf_holdings_sectors(t, symbol, assets)

            payload = {
                "meta":        meta,
                "price":       price_payload,
                "history":     history,
                "holdings":    holdings,
                "sectors":     sectors,
                "used_sample": used_sample,
            }
            self._json_ok(payload)

        except ImportError:
            self._json_error(500, "yfinance not installed — run: pip install yfinance")
        except Exception as e:
            self._json_error(500, str(e))

    def _serve_yfinance_etf_screener(self):
        """
        Batch-fetch holdings for multiple ETFs in one call, for the Screener tab.
        GET /yfinance/etf-screener?symbols=VOO,QQQ,SCHD
        Returns { "VOO": [...holdings], "QQQ": [...], ... }
        """
        parsed = urllib.parse.urlparse(self.path)
        params = urllib.parse.parse_qs(parsed.query, keep_blank_values=True)
        symbols_raw = params.get("symbols", [""])[0]
        symbols = [s.strip().upper() for s in symbols_raw.split(",") if s.strip()][:10]
        if not symbols:
            self._json_error(400, "Missing symbols parameter")
            return

        assets = _load_etf_assets()
        result = {}
        try:
            import yfinance as yf
            for sym in symbols:
                try:
                    t = yf.Ticker(sym)
                    holdings, _sectors, _used = _fetch_etf_holdings_sectors(t, sym, assets)
                    result[sym] = holdings
                except Exception as e:
                    print(f"  Screener fetch error for {sym}: {e}")
                    result[sym] = []
            self._json_ok({"holdings": result})
        except ImportError:
            self._json_error(500, "yfinance not installed — run: pip install yfinance")
        except Exception as e:
            self._json_error(500, str(e))

    def end_headers(self):
        # Add CORS headers to all responses
        self.send_header("Access-Control-Allow-Origin", "*")
        super().end_headers()


# Start
if __name__ == "__main__":
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("0.0.0.0", PORT), Handler) as httpd:
        print(f"Serving at http://0.0.0.0:{PORT}")
        print("Ctrl+C to stop.\n")
        httpd.serve_forever()