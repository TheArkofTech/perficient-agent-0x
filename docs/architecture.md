# Architecture — Advisor Brief

> **Status: pre-implementation.** Derived from the [approved specification §1](superpowers/specs/2026-10-05-advisor-brief-finance-scenario-design.md). Framework facts verified against Next.js 16.3.8 (npm registry) and the official v16 upgrade guide on 2026-10-05.

## System overview

```
┌────────────────────────── Browser (Next.js UI) ──────────────────────────┐
│  Ticker input form  →  Loading pipeline states  →  "Advisor Brief" page  │
└──────────────┬────────────────────────────────────────────┬──────────────┘
               │ POST /api/brief  { ticker }                │ render JSON
┌──────────────▼─────────────────────────────────────────────┴──────────────┐
│                     Vercel Route Handler (serverless, Node.js, TS)         │
│                                                                            │
│  1. resolve   ticker → CIK          (SEC company_tickers.json, cached)     │
│  2. fan-out (Promise.allSettled):                                          │
│     ├─ quote  Yahoo v8 chart JSON   (price, change, 52wk, volume)          │
│     └─ filings EDGAR submissions → locate latest 10-K, 10-Q, 8-K           │
│  3. retrieve  download primary docs from www.sec.gov/Archives (≤3)        │
│  4. extract   HTML → text → section-slice (Item 1/1A/7 from 10-K;          │
│               MD&A from 10-Q; 8-K body)  ~60K chars cap                    │
│  5. synthesize ONE Portkey chat-completion call (claude-sonnet-4.5),       │
│     strict JSON-out advisory brief (blocking render baseline;              │
│     SSE streaming = stretch goal)                                          │
│  6. compose   { quote, filings metadata, brief } → response                │
└────────────────────────────────────────────────────────────────────────────┘
               │ HTTPS (OpenAI-compatible)
┌──────────────▼───────────────────────────────────────────┐
│  Portkey gateway  https://portkeygateway.perficient.com/v1
│  Model: @aws-bedrock-use2/us.anthropic.claude-sonnet-4-5-20250929-v1:0
└───────────────────────────────────────────────────────────┘
```

## Approach selection

| Option | Verdict | Rationale |
|---|---|---|
| Next.js 16 app on Vercel | ✅ Chosen | Only approach satisfying the Vercel mandate with full control over EDGAR HTML parsing and secret-safe server-side LLM calls |
| n8n workflow | ❌ Rejected | No Vercel deploy; clumsy HTML section control |
| AI-native tool (Claude Project, etc.) | ❌ Rejected | No programmatic EDGAR/quote access; fails deploy requirement |
| Hybrid n8n + Vercel | ❌ Rejected | Two systems for zero incremental demo value |

## Tech stack

| Layer | Choice | Notes |
|---|---|---|
| Framework | **Next.js 16.3.8**, App Router only, TypeScript | Node ≥ 20.9 (dev machine: v24.18 ✅); Turbopack default bundler; no custom webpack |
| UI | Tailwind CSS + ~6 hand-rolled components | Dark finance-console aesthetic; inline SVG visuals only (no `next/image` externals) |
| LLM client | Raw `fetch` → Portkey OpenAI-compatible `/v1/chat/completions` | Fallback: `openai` SDK with `baseURL` override |
| HTML → text | `cheerio` + regex section slicer | The only runtime dependency beyond Next |
| Caching | Module-scope `Map` in the Route Handler, 15-min TTL | For ticker→CIK map and per-ticker results; prevents SEC rate-limit pressure during repeated demo takes |

## Project layout

```
advisor-brief/
  app/
    page.tsx                 # landing: ticker input + example tickers
    brief/[ticker]/page.tsx  # result page (calls API route, renders brief)
    api/brief/route.ts       # orchestrator (steps 1–6)
    layout.tsx, globals.css
  lib/
    sec.ts                   # CIK resolve, filings listing, doc download, text extract
    quote.ts                 # Yahoo chart fetch + normalize
    llm.ts                   # Portkey call, prompt templates, JSON schema validation
    pipeline.ts              # orchestration, allSettled aggregation, typed results
  components/
    TickerForm, QuotePanel, FilingCards, BriefSections, StepStatus, DisclaimerBar
```

## Pipeline step budgets

| Step | Budget | Failure behavior |
|---|---|---|
| 1. Resolve ticker → CIK | ≤ 1 s | 404 "Unknown ticker", short-circuit |
| 2. Fan-out quote + filings index | ≤ 6 s | `allSettled` — each side degrades independently |
| 3. Retrieve ≤ 3 filing docs | ≤ 8 s (parallel, 10 s timeout each) | Missing doc → fewer excerpts, brief still runs |
| 4. Extract & slice text | ≤ 3 s | Heading-regex miss → head-tail sampling fallback |
| 5. Synthesize (1 LLM call) | ≤ 25 s | Invalid JSON → 1 retry → raw text render |
| 6. Compose & render | ≤ 1 s | Step-status strip shows exactly what failed |

## Next.js 16 router-safety rules (binding, R1–R12)

**Router hygiene**
- **R1 — App Router only.** No `pages/` directory. `next/router` imports are forbidden; router access is via `next/navigation` only (`useRouter`, `usePathname`, `useSearchParams`, `useParams`).
- **R2 — Async request APIs.** Sync `params`/`searchParams`/`cookies()`/`headers()` access is fully removed in v16: `const { ticker } = await params` in `app/brief/[ticker]/page.tsx`. `npx next typegen` may be used for global `PageProps<'/brief/[ticker]'>` typed helpers.
- **R3 — No unguarded `useSearchParams()`.** A Client Component reading search params needs a `<Suspense>` boundary; the design avoids the pattern entirely (results come from `POST /api/brief`; cache state lives in the URL *hash*, which Next never sees server-side).
- **R4 — Route Handlers on Node runtime.** `app/api/brief/route.ts` exports `POST` (async, Web `Request`/`Response`); no `runtime: 'edge'` config (cheerio + large doc fetches need Node).
- **R5 — No middleware / proxy.ts.** v16 renames `middleware.ts` → `proxy.ts` (Node-only); the app needs neither — do not add one.

**Caching & data posture**
- **R6 — v16 defaults:** everything dynamic executes at request time and `fetch` is uncached by default — correct for live data. **Do not enable `cacheComponents`/PPR.**
- **R7 — No Next caching APIs.** No `revalidateTag` (v16 requires a `cacheLife` second arg), no `unstable_cache`; only the explicit in-memory `Map` cache.
- **R8 — No `next/image` for external content** (v16 tightened defaults: `qualities [75]`, 4 h `minimumCacheTTL`, local-IP block, `remotePatterns`). All visuals are inline SVG/CSS.

**Tooling**
- **R9 — `next lint` no longer exists** (removed in v16; `next build` doesn't lint). Lint via `npx eslint .` (flat config) if at all.
- **R10 — React 19.2** with the stock template; ticker form is a standard `onSubmit` Client Component (Server Actions valid but unnecessary on this timeline).
- **R11 — Turbopack:** config at top-level `turbopack` (not `experimental`); a stray webpack config hard-fails the build — keep none; dev/build use separate output dirs.
- **R12 — Clean-install discipline:** `npx create-next-app@latest advisor-brief` + exactly one dependency (`cheerio`); deploy the empty skeleton before writing features.

## Related

[Data sources](data-sources.md) · [API reference](api-reference.md) · [Prompt design](prompt-design.md) · [Decision log](decision-log.md)
