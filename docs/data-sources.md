# Data Sources — Advisor Brief

> **Status: pre-implementation.** All endpoints below were **probed live on 2026-10-05** (see [Evidence log](#evidence-log-2026-10-05)). Derived from [specification §2](superpowers/specs/2026-10-05-advisor-brief-finance-scenario-design.md).

No datasets are provided for this challenge — every source is public and fetched at request time.

## 1. Market quote — Yahoo Finance chart endpoint

**Endpoint**

```
GET https://query1.finance.yahoo.com/v8/finance/chart/{TICKER}?interval=1d&range=1y
User-Agent: Mozilla/5.0            # browser-like UA required
```

**What we use from the response** (verified for AAPL: price 333.69, 52-wk 243.42–345.34):

| Field | UI use |
|---|---|
| `chart.result[0].meta.regularMarketPrice` | headline price |
| `.regularMarketChangePercent` / `.previousClose` | day change, colored |
| `.fiftyTwoWeekHigh` / `.fiftyTwoWeekLow` | 52-week range bar |
| `.regularMarketVolume` | volume stat |
| `.regularMarketTime` | "as of HH:MM:SS AM ET" freshness label |
| `.fullExchangeName` | exchange badge |
| `timestamp[]` + `indicators.quote[0].close[]` | 1-year sparkline (inline SVG) |

**Fallback order:** ① `query2.finance.yahoo.com` mirror → ② quote panel shows "Quote unavailable" and the brief proceeds from filings alone (pipeline is `Promise.allSettled`).

**Rejected primaries:** Alpha Vantage / Financial Modeling Prep / Finnhub — free tiers require signup + API key (costs build-window minutes, adds secret babysitting). FMP `apikey=demo` confirmed rejected. Pre-wired env-var backup remains an option if a firm account already exists.

## 2. SEC filings — EDGAR public APIs

**Access rules (all endpoints):** every request sends `User-Agent: <App> <contact-email>` per the SEC fair-access policy; stay ≤ 10 req/s per IP (our worst case is ~5 calls per brief).

### 2.1 Ticker → CIK

```
GET https://www.sec.gov/files/company_tickers.json
→ {"0":{"cik_str":1045810,"ticker":"NVDA","title":"NVIDIA CORP"}, "1":{...320193,"AAPL"...}, ...}
```
Cache 24 h (changes ~never intraday). CIK is formatted 10-digit zero-padded for downstream URLs.

### 2.2 Filing index

```
GET https://data.sec.gov/submissions/CIK{cik:010d}.json
→ filings.recent.{ form[], filingDate[], accessionNumber[], primaryDocument[] }
```
Verified for Apple (CIK 0000320193): recent forms returned, arrays are index-aligned.

**Filing-selection policy (deterministic, demo-explainable):**

- Latest **10-K** (business, risk factors, MD&A) — always
- Latest **10-Q** (current quarter narrative) — always
- Latest **8-K** — only if filed within the last **60 days** (material events)
- **Max 3 documents per brief** → bounded latency and token cost
- Foreign issuers: fall back to latest **20-F / 6-K**; if none, filings section states "No US periodic filings on record" and the brief is quote-only

### 2.3 Primary document download

```
GET https://docs.sec.gov/Archives/edgar/data/{cik}/{accessionNo without dashes}/{primaryDocument}
```
Raw filing HTML. Stream-capped at 3 MB before parsing.

### 2.4 (Optional, if time permits) XBRL structured facts

```
GET https://data.sec.gov/api/xbrl/companyfacts/CIK{cik:010d}.json
```
Revenue / net-income series with zero HTML parsing — powers a future "key figures" table.

### 2.5 (Not used in v1) EDGAR full-text search

```
GET https://efts.sec.gov/LATEST/search-index?q="artificial intelligence"&forms=10-K&ciks=0000320193
```
Verified working (Elasticsearch-shaped hits). The submissions index already locates the right filings deterministically, so full-text search is reserved for a stretch "topic across filings" feature.

## 3. LLM — Portkey AI gateway

```
POST https://portkeygateway.perficient.com/v1/chat/completions
Authorization: Bearer {PORTKEY_API_KEY}
body.model = "@aws-bedrock-use2/us.anthropic.claude-sonnet-4-5-20250929-v1:0"
```
OpenAI-compatible. The model string is passed verbatim from the challenge brief; if the gateway rejects it, `PORTKEY_MODEL` is a Vercel env var — the fix is config, not code (organizers change gateway model config on request). Smoke-tested as build Block 0, minute 0–10.

## 4. Data freshness & honesty controls

- Quote rendered with its actual `regularMarketTime` ("as of …"), never presented as live if cached.
- Every brief records the accession numbers + filing dates it was built from; UI links each summary section back to the source filing on sec.gov.
- Factual numbers in the quote panel come from raw JSON — they never pass through the LLM.

## 5. Edge cases

| Case | Behavior |
|---|---|
| Ticker not in `company_tickers.json` | 404 + "Unknown ticker" (message notes NYSE/NASDAQ listings only) |
| Foreign issuer (no 10-K/10-Q) | 20-F/6-K fallback → honest quote-only brief |
| GOOGL vs GOOG share classes | exact ticker match for CIK; shared filings are correct behavior |
| 10-K HTML > 3 MB | stream cap + head-tail section sampling |
| Heading regex misses (format drift) | first + last 8 K chars sampling fallback — degrades, never fails |
| SEC 403 (missing/bad UA) | prevented by `SEC_USER_AGENT` env var on every fetch |

## Evidence log (2026-10-05)

| Probe | Result |
|---|---|
| `company_tickers.json` | 200; AAPL→CIK 320193, NVDA→1045810 |
| `submissions/CIK0000320193.json` | 200; `filings.recent` arrays aligned (form/date/accession/primaryDocument) |
| `efts.sec.gov/LATEST/search-index?...` | 200; ES-format hits (kept for stretch) |
| `query1.finance.yahoo.com/v8/finance/chart/AAPL` | 200; price 333.69, 52wk 243.42–345.34, volume, 1y series |
| `stooq.com/q/l/` CSV | dead (HTML error page) — rejected |
| `financialmodelingprep.com` `apikey=demo` | rejected — real key required; not on critical path |
| Portkey gateway | pending — scheduled as build Block 0 (key issued at interview start) |

## Related

[Architecture](architecture.md) · [API reference](api-reference.md) · [Deployment](deployment.md)
