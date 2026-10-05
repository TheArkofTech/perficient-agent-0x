# API Reference — Advisor Brief

> **Status: pre-implementation contract.** This is the schema the build must implement, derived from [specification §3](superpowers/specs/2026-10-05-advisor-brief-finance-scenario-design.md).

## `POST /api/brief`

The single orchestrator endpoint (Vercel Node-runtime Route Handler, `app/api/brief/route.ts`).

### Request

```json
{ "ticker": "NVDA" }
```

- `ticker` — 1–6 chars, uppercased server-side. Invalid/unknown → 400/404 below.

### Response `200` — `BriefResult`

```ts
interface BriefResult {
  ticker: string
  company: { name: string; cik: string }
  quote: Quote | null                    // null only if quote source failed
  filings: FilingRef[]                   // 0–3 entries actually used
  brief: BriefJson | null                // null only if LLM failed twice
  briefRawText?: string                  // emergency render if model output invalid JSON
  steps: StepState[]                     // pipeline telemetry for the status strip
  generatedAt: string                    // ISO 8601
}

interface Quote {
  symbol: string
  price: number
  changePercent: number
  previousClose: number
  dayRange: { low: number; high: number }
  fiftyTwoWeek: { low: number; high: number }
  volume: number
  marketTime: string                     // ISO 8601 — quote "as of"
  exchange: string
  sparkline: { t: number[]; close: number[] }   // 1y daily closes
}

interface FilingRef {
  form: '10-K' | '10-Q' | '8-K' | '20-F' | '6-K'
  filingDate: string                     // YYYY-MM-DD
  accessionNumber: string                // e.g. "0000320193-25-000079"
  sourceUrl: string                      // deep link to docs.sec.gov archive
  sectionsUsed: string[]                 // e.g. ["Item 1A", "Item 7"] — audit trail
}

interface StepState {
  step: 'resolve' | 'quote' | 'filingsIndex' | 'retrieve' | 'extract' | 'synthesize'
  status: 'ok' | 'failed' | 'skipped'
  ms: number
  error?: string                         // short, user-legible message
}

interface BriefJson {
  companySnapshot: string        // what they do, segments, size — 3–4 bullets
  financialNarrative: string     // revenue/margin trends, drivers, from MD&A
  keyRiskFactors: string[]       // top 4–5 risks, one sentence each
  managementOutlook: string      // guidance/priorities; "Not covered…" if absent
  recentMaterialEvents: string[] // from 8-K; [] if none used
  advisorTalkingPoints: string[] // 3 neutral client-conversation points
  plainEnglishSummary: string    // 5-sentence ELI5
}
```

### Error responses

| Situation | HTTP | Body |
|---|---|---|
| Unknown ticker | `404` | `{ "error": "unknown_ticker", "message": "NVDA2 not found among SEC-registered tickers (NYSE/NASDAQ listings only)." }` |
| Malformed input | `400` | `{ "error": "invalid_ticker", "message": "Ticker must be 1–6 letters." }` |
| CIK resolve / filings index hard-fail | `502` | `{ "error": "sec_unavailable", "message": "…" }` |
| Partial failure (quote down, or LLM failed) | `200` | Normal shape with `quote: null` / `brief: null` + failed entry in `steps[]` — **UI renders the success portions and the step-status strip shows what failed.** |

Design rule: pipeline uses `Promise.allSettled` — no single upstream failure ever blank-pages the brief.

## UI data flow

1. Landing (`app/page.tsx`) → `TickerForm` (Client Component) → `POST /api/brief`.
2. Result rendered on `app/brief/[ticker]/page.tsx`; full `BriefResult` JSON is also stored in the URL **hash** (`#d=<base64url(zlib(json))>`) so a finished brief can be reloaded instantly as a demo fallback — honest cache (visible generatedAt), never fake live data.
3. During generation the UI shows step statuses (`steps[]` streamed client-side as each resolves, or rendered on completion — baseline is completion render).

## Example (abridged `200` for `AAPL`)

```json
{
  "ticker": "AAPL",
  "company": { "name": "Apple Inc.", "cik": "0000320193" },
  "quote": {
    "price": 333.69, "changePercent": 1.02, "previousClose": 330.31,
    "fiftyTwoWeek": { "low": 243.42, "high": 345.34 },
    "exchange": "NasdaqGS", "marketTime": "2026-10-02T20:00:01Z"
  },
  "filings": [
    { "form": "10-K", "filingDate": "2025-10-31", "accessionNumber": "0000320193-25-000079",
      "sourceUrl": "https://docs.sec.gov/Archives/edgar/data/320193/000032019325000079/aapl-20250927.htm",
      "sectionsUsed": ["Item 1", "Item 1A", "Item 7", "Item 7A"] },
    { "form": "10-Q", "filingDate": "2026-08-01", "accessionNumber": "0000320193-26-000042",
      "sourceUrl": "https://docs.sec.gov/Archives/edgar/data/320193/…", "sectionsUsed": ["Item 2"] }
  ],
  "brief": { "plainEnglishSummary": "…", "keyRiskFactors": ["…"], "advisorTalkingPoints": ["…"] },
  "steps": [
    { "step": "resolve", "status": "ok", "ms": 140 },
    { "step": "quote", "status": "ok", "ms": 890 },
    { "step": "synthesize", "status": "ok", "ms": 21400 }
  ],
  "generatedAt": "2026-10-05T14:22:05Z"
}
```

## Related

[Architecture](architecture.md) · [Prompt design](prompt-design.md) · [Data sources](data-sources.md)
