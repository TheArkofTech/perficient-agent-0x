# Technical Specification — "Advisor Brief" AI Prototype

**Scenario:** Finance — Wealth management firm: help advisors quickly get up to speed on a stock by fetching current quote data and summarizing key information from recent SEC filings.
**Target:** AI Prototype Challenge (Perficient) — 120-min build, 1-slide pitch, 20-min live demo/interview.
**Deployment target:** Vercel (required by stakeholder instruction).
**Date:** 2026-10-05 · **Status:** Draft for review

---

## 0. Problem Statement & Success Criteria

A wealth advisor meeting a client about a public stock needs, in under 60 seconds:

1. **Where the stock stands now** — price, day change, 52-week range, volume.
2. **What the company last told the market** — plain-English synthesis of the most recent 10-K/10-Q/8-K filings: business snapshot, risks, financial narrative, management outlook.

**Success criteria for the prototype:**

- Live demo on a public Vercel URL: enter a ticker (e.g., `AAPL`, `NVDA`, `TSLA`) → structured brief rendered in ≤ 45 s.
- Every factual number in the quote panel is from live data; every claim in the filing summary is grounded in retrieved filing text (no model hallucination from memory).
- Graceful degradation: if any source fails, the UI shows exactly which step failed rather than a blank page.

---

## 1. Solution Architecture

### 1.1 Approach comparison

| Option | Verdict | Rationale |
|---|---|---|
| **A. Next.js 16 app on Vercel (recommended)** | ✅ Chosen | Meets the Vercel deployment requirement; full control over EDGAR HTML → text section extraction; server-side API routes keep the Portkey key secret; streaming-capable; single artifact serves as both prototype and demo interface. |
| B. n8n workflow (pre-provided workspace) | ❌ Rejected | Fastest LLM wiring, but cannot be deployed to Vercel; HTML parsing/section slicing in Code nodes is clumsy; demo depends on external n8n tenancy. |
| C. AI-native tool (Claude Project, Custom GPT, NotebookLM) | ❌ Rejected | No programmatic EDGAR/quote access with freshness guarantees, no Vercel deploy, weak "technical execution" signal for the panel. |
| D. Hybrid: n8n backend + Vercel frontend | ❌ Rejected | Two systems to wire in 120 min for no incremental demo value; n8n webhooks add latency and failure surface. |

### 1.2 Chosen architecture

```
┌────────────────────────── Browser (Next.js UI) ──────────────────────────┐
│  Ticker input form  →  Loading pipeline states  →  "Advisor Brief" page  │
└──────────────┬────────────────────────────────────────────┬──────────────┘
               │ POST /api/brief  { ticker }                │ render JSON + streamed summary
┌──────────────▼─────────────────────────────────────────────┴──────────────┐
│                     Vercel Route Handler (serverless, TS)                  │
│                                                                            │
│  1. resolve   ticker → CIK          (SEC company_tickers.json, cached)     │
│  2. fan-out (Promise.allSettled):                                          │
│     ├─ quote  Yahoo v8 chart JSON   (price, change, 52wk, volume)          │
│     └─ filings EDGAR submissions → locate latest 10-K, 10-Q, 8-K           │
│  3. retrieve  download primary docs from www.sec.gov/Archives (≤3)        │
│  4. extract   HTML → text → section-slice (Item 1/1A/7 from 10-K;          │
│               MD&A + key financials from 10-Q; 8-K body)  ~60K chars cap   │
│  5. synthesize ONE Portkey chat-completion call (claude-sonnet-4.5),       │
│     strict JSON-out advisory brief (blocking render baseline;             │
│     SSE streaming = stretch goal)                                          │
│  6. compose   { quote, filings metadata, brief } → response                │
└────────────────────────────────────────────────────────────────────────────┘
               │ HTTPS (OpenAI-compatible)                  
┌──────────────▼───────────────────────────────────────────┐
│  Portkey gateway  https://portkeygateway.perficient.com/v1
│  Model: @aws-bedrock-use2/us.anthropic.claude-sonnet-4-5-20250929-v1:0
└───────────────────────────────────────────────────────────┘
```

### 1.3 Tech stack

| Layer | Choice | Notes |
|---|---|---|
| Framework | **Next.js 16.3.8** (App Router only), TypeScript | `npx create-next-app@latest` — template is App Router + TS + Tailwind by default; no `pages/` dir is generated. Node ≥ 20.9 required (local: v24.18 ✅). Turbopack is the default bundler (dev + build); no custom webpack config. |
| UI | Tailwind CSS + ~6 hand-rolled components | No component library install time; dark, finance-console aesthetic. |
| LLM client | Raw `fetch` to Portkey OpenAI-compatible `/v1/chat/completions` | Avoids SDK surface area; one endpoint, one header set. Fallback: `openai` SDK with `baseURL` override. |
| HTML → text | `rescript`-free approach: `cheerio` (`$(html).text()`) + regex section slicer | Only runtime dep beyond Next. |
| Caching | In-route-handler LRU (module-scope `Map`, 15 min TTL) for `company_tickers.json` and per-ticker results | Prevents SEC rate-limit issues during repeated demo takes. |
| Secrets | Vercel env vars: `PORTKEY_API_KEY`, `PORTKEY_BASE_URL`, `PORTKEY_MODEL`, `SEC_USER_AGENT` | All server-side only; none exposed to browser. (`serverRuntimeConfig`/`publicRuntimeConfig` were removed in v16 — env vars only.) |

### 1.4 Next.js 16 best practices — router-safety rules (locked after framework research, 2026-10-05)

Stakeholder directive: zero issues of the `router.js` class (stale router APIs / Pages-vs-App Router confusion). These rules are binding for implementation:

**Router hygiene**
- **R1 — App Router only.** No `pages/` directory ever exists in the repo. The legacy Pages Router hook `next/router` is forbidden; lint-level discipline: the only router imports allowed are from **`next/navigation`** (`useRouter`, `usePathname`, `useSearchParams`, `useParams`).
- **R2 — Async request APIs are mandatory in 16** (sync access fully removed): dynamic route props are promises — `export default async function Page({ params }: { params: Promise<{ ticker: string }> }) { const { ticker } = await params }`. Same for `cookies()`/`headers()`. Optionally run `npx next typegen` for global `PageProps<'/brief/[ticker]'>` typed helpers.
- **R3 — `useSearchParams()` in a Client Component requires a `<Suspense>` boundary** (the classic CSR-bailout footgun). Design avoids it entirely: results are fetched from `/api/brief` and cached via URL hash; no component reads search params at render.
- **R4 — Route Handlers**: `app/api/brief/route.ts` exports `POST` (async function, Web `Request`/`Response`); no `export const config = { runtime: 'edge' }` — Node runtime on Vercel (needed for cheerio + fetch sizing).
- **R5 — No middleware.** v16 deprecates `middleware.ts` in favor of `proxy.ts` (Node runtime only); we need neither — do not add one.

**Caching & data-fetching posture**
- **R6 — Stay on v16 defaults: all dynamic code executes at request time; `fetch` is uncached by default** (v15 semantics carried forward) — exactly right for live quotes/filings. **Do NOT enable `cacheComponents`/PPR** (opt-in model; would raise uncached-data build errors for zero demo value).
- **R7 — Caching APIs unused:** no `revalidateTag` (v16 requires a `cacheLife` second arg), no `unstable_cache`. Our only cache is a module-scope in-memory `Map` inside the Route Handler (§1.3) — explicit, visible, and demo-safe.
- **R8 — No `next/image` for external content.** v16 tightened image defaults (qualities `[75]`, `minimumCacheTTL` 4 h, local-IP block, `remotePatterns` required). Quote sparkline and all visuals are **inline SVG / CSS** — zero image-optimizer surface.

**Tooling traps**
- **R9 — `next lint` no longer exists** (removed in 16; `next build` doesn't lint). Use `npx eslint .` directly if needed; ESLint uses flat config by default. Never put `next lint` in the build-block plan.
- **R10 — React 19.2** ships with the template: server/client component split per the layout in §1.5; forms via standard `onSubmit` client component (no need for Server Actions on this timeline; both are valid v16 patterns).
- **R11 — Turbopack specifics:** config lives at top-level `turbopack` (not `experimental`); dev and build use separate output dirs (can run concurrently); a stray webpack config would hard-fail the build — we have none.
- **R12 — Clean-install discipline:** scaffold with `npx create-next-app@latest advisor-brief` (TypeScript/Tailwind/App Router defaults), add exactly one dependency (`cheerio`), then deploy the empty skeleton in Block 0 before writing features.

### 1.5 Project layout

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

---

## 2. Data Strategy

No datasets are provided; all sources below were **verified live on 2026-10-05** with plain `curl`.

### 2.1 Market quote — Yahoo Finance chart endpoint (primary)

- **Endpoint:** `GET https://query1.finance.yahoo.com/v8/finance/chart/{TICKER}?interval=1d&range=1y`
- **Verified:** keyless, returns `meta.regularMarketPrice` (333.69), `regularMarketChangePercent`, `fiftyTwoWeekHigh/Low`, `regularMarketVolume`, exchange name, plus 1y daily series (free sparkline data).
- **Quirk (verified):** in `range=1y` responses `meta.previousClose` is `null` (`chartPreviousClose` = price one year ago) — derive previous close from `close[len-2]` of the daily series, else compute `price / (1 + changePct/100)`.
- **Must:** send a **modern browser `User-Agent` + `Accept` header** — Yahoo's ATS edge answers `429 "Edge: Too Many Requests"` to bare/curl-style agents (verified: `curl/8.7.1` → 429; Chrome/124 UA → 200 on both query1 and query2).
- **Server-side only** — no CORS concern since the Vercel function fetches it.
- **Fallbacks (in order):**
  1. `query2.finance.yahoo.com` mirror host.
  2. Render quote panel with `meta`-only fields; if totally failed, show "Quote unavailable" card + continue with filings (pipeline is `allSettled`, quote failure ≠ brief failure).
  - *Deliberately not chosen as primary:* Alpha Vantage / FMP / Finnhub (free tiers need signup + key → wastes 10+ min of the build window and adds a second secret to babysit; keep as pre-wired optional env-var backup if an account already exists).

### 2.2 SEC filings — EDGAR public APIs (primary, per stakeholder preference)

EDGAR is fully sufficient; **Exa is not required.** Exa (`exa.ai` search API) is scoped as an *optional stretch* enrichment for "what's in the news about this filing" only if build finishes with ≥ 20 min slack and an Exa key is on hand. It is never on the critical path.

All EDGAR calls **must** send `User-Agent: <App> <contact-email>` (SEC fair-access rule; ≤ 10 req/s per IP — we stay far below with ≤ 5 calls per brief).

| # | Purpose | Endpoint (verified working) |
|---|---|---|
| 1 | Ticker → CIK | `GET https://www.sec.gov/files/company_tickers.json` — e.g. `{"cik_str":320193,"ticker":"AAPL","title":"Apple Inc."}`. Cache 24 h (changes ~never intraday). |
| 2 | Filing index | `GET https://data.sec.gov/submissions/CIK{10-digit-padded}.json` — `filings.recent.{form,filingDate,accessionNumber,primaryDocument}` arrays. Verified: returns Apple's filings incl. recent forms. |
| 3 | Primary doc | `GET https://www.sec.gov/Archives/edgar/data/{cikUnpadded}/{accessionNoNoDashes}/{primaryDocument}` — the actual 10-K/10-Q/8-K HTML. **Not `docs.sec.gov` — that host does not resolve (verified 2026-10-05); path CIK is unpadded (`320193`), padded form 301-redirects.** Verified: Apple 10-K, 1.52 MB HTML. |
| 4 | (Optional) structured facts | `GET https://data.sec.gov/api/xbrl/companyfacts/CIK{...}.json` — XBRL revenue/net-income series for a "key figures" table without any parsing. Use only if time permits. |
| 5 | (Not used in v1) full-text search | `GET https://efts.sec.gov/LATEST/search-index?q=...&forms=10-K&ciks=...` — verified working, but the submissions index already gives us the right filings deterministically. Reserve for an "ask about a topic across filings" stretch feature. |

**Filing selection policy (deterministic, explainable in the demo):**

- Latest **10-K** (annual: business, risk factors, MD&A) and latest **10-Q** (current quarter) always.
- Latest **8-K** if filed within the last 60 days (material events).
- Maximum 3 documents per brief → bounded latency and token cost.

**Edge cases handled:**

- Ticker not in `company_tickers.json` → 404 with "Unknown ticker" message (suggest NYSE/NASDAQ listed only).
- Foreign issuer (no 10-K/10-Q) → fall back to latest **20-F/6-K**; if none, filings section shows "No US periodic filings on record" and the brief is quote-only.
- Multi-ticker share classes (GOOGL/GOOG) → match exact ticker string; CIK is shared, which is fine.
- Very large 10-K HTML (measured 1.5–2 MB) → stream-cap at 3 MB before cheerio parse.

### 2.3 Data freshness & honesty controls

- Quote `meta.regularMarketTime` is rendered ("as of 10:02:34 AM ET") so the panel never presents stale data as live.
- Each brief records the accession numbers + filing dates it was built from; the UI links every summary section back to the source filing on sec.gov (auditable — a point of emphasis for wealth-management clients under compliance scrutiny).

---

## 3. Core Functionality — Pipeline Specification

`POST /api/brief { ticker }` → typed `BriefResult`. Steps below; wall-clock budget per step in parentheses.

### Step 1 — Resolve (≤ 1 s)
Load `company_tickers.json` (memory-cached), uppercase input ticker, look up 10-digit zero-padded CIK. Failure → short-circuit with clear error.

### Step 2 — Fan-out fetch (≤ 6 s)
`Promise.allSettled([quote, filingsIndex])`:

- **Quote** per §2.1 → normalize to `{ price, changePct, prevClose, dayRange, fiftyTwoWeek:{low,high}, volume, marketTime, exchange, sparkline: number[] }`.
- **Filings index** per §2.2 → filter `recent.form` for `10-K`, `10-Q`, `8-K` (+ `20-F`, `6-K` fallback), take newest of each within coverage window, build doc URLs.

### Step 3 — Retrieve documents (≤ 8 s, parallel)
Download ≤ 3 primary documents concurrently (fetch with 10 s `AbortSignal.timeout` each).

### Step 4 — Extract & slice text (≤ 3 s) — *the differentiator*
Naive "dump the whole 10-K into the model" is the trap; this is the pragmatic design:

1. `cheerio` → strip tags, collapse whitespace → plain text (10-K text ≈ 150–400 K chars).
2. **Section slicer** (regex on Item headings, case/nbsp tolerant). **Must exclude false positives (verified on AAPL & NVDA 10-Ks):** table-of-contents clusters (heading followed immediately by other Items / page numbers) and in-text cross-references (preceded by “Refer to …” / “read in conjunction with …”); decode HTML entities (`&#8217;` apostrophes, `&#160;` nbsp) before matching — raw-text searches miss them. True narrative header is picked by requiring body-style continuation text.
   - 10-K: `Item 1. Business` (cap 12 K chars), `Item 1A. Risk Factors` (cap 12 K), `Item 7. MD&A` (cap 15 K), `Item 7A. Market Risk` (cap 5 K).
   - 10-Q: `Item 2. MD&A` (cap 12 K) + first-page financial statements region if slice misses.
   - 8-K: whole body (naturally short, cap 6 K).
3. If a heading regex misses (formatting drift), fallback = head-tail sampling (first + last 8 K chars) so the brief degrades but never fails.
4. Total assembled context hard cap: **60 K chars (~18 K tokens)** — comfortably inside Sonnet 4.5 limits, keeps latency ≤ ~25 s and cost < $0.30/brief on Bedrock pricing.

### Step 5 — Synthesize (≤ 25 s, one LLM call)
Portkey chat completion, `temperature 0.2`, `response_format` prompt-enforced strict JSON:

```
POST {PORTKEY_BASE_URL}/v1/chat/completions
Authorization: Bearer {PORTKEY_API_KEY}
X-Portkey-Model: (model string passed verbatim in body `model` field)
```

**System prompt (abridged):**
> You are an equity research assistant preparing a briefing for a wealth-management advisor. Use ONLY the provided filing excerpts. Cite nothing you were not given. If a section is missing from the excerpts, say "Not covered in retrieved excerpts". Be factual, terse, neutral in tone — no buy/sell recommendations (compliance).

**Output schema (`BriefJson`):**

```ts
{
  companySnapshot: string,        // what they do, segments, size — 3–4 bullets
  financialNarrative: string,     // revenue/margin trends, drivers, from MD&A
  keyRiskFactors: string[],       // top 4–5 risks, each one sentence
  managementOutlook: string,      // guidance/strategic priorities, flagged if absent
  recentMaterialEvents: string[], // from 8-K; empty array if none used
  advisorTalkingPoints: string[], // 3 neutral discussion points for a client convo
  plainEnglishSummary: string     // 5-sentence ELI5 for rapid onboarding
}
```

**Robustness:** parse with a JSON extractor tolerant of code fences; on invalid JSON → one retry with "return ONLY valid JSON" nudge; on second failure → render raw model text in a `<pre>` (demo never dead-ends). Streaming (SSE) of the response is a stretch goal; blocking render with step-status UI is the baseline.

### Step 6 — Compose & render
API returns `{ quote, filings: [{form, date, accessionUrl}], brief: BriefJson, generatedAt }`. UI renders the Advisor Brief (§4.1). Persist the full JSON blob in a URL-safe hash on the brief page (`#d=...`) so the demo can reload a cached result instantly if the live path hiccups — an honest, visible cache, not a fake.

---

## 4. Prototype Deliverables

### 4.1 Interface (working prototype)

Single-page app, two screens, finance-console look (dark bg, monospace numbers):

**Screen 1 — Landing**
- Title: **Advisor Brief** — "Get up to speed on any stock in 60 seconds."
- Ticker input (auto-uppercase) + chips: `AAPL` `NVDA` `JPM` `KO` (pre-tested tickers with known-good filing shapes; **avoid meme/OTC tickers in the live demo**).
- One line: "Live data: Yahoo quote + latest SEC 10-K/10-Q/8-K via EDGAR · AI: Claude Sonnet 4.5 via Portkey."

**Screen 2 — Brief** (top→bottom)
1. **Header**: Company name · ticker · exchange · filing coverage badges (10-K Mar 2026, 10-Q Aug 2026, 8-K Sep 2026 → deep-links to sec.gov).
2. **Quote panel**: big price, day change colored, 52-wk range bar, volume, "as of" timestamp, 1y sparkline (free from the chart `meta`+series).
3. **Plain-English summary** card (the "60-second" payoff, rendered first).
4. **Section grid**: Snapshot / Financial narrative / Top risks / Management outlook / Recent 8-K events.
5. **Advisor talking points** — highlighted card (this is the scenario-specific UX that beats a generic summarizer).
6. **Step-status strip** (resolve→fetch→extract→summarize, ✓/✗ each) — turns failure modes into visible engineering credibility.
7. **Disclaimer bar**: "Synthesized from public SEC filings for research assistance only. Not investment advice." — signals compliance awareness to a wealth-management audience.

**During generation:** progressive step statuses (not a spinner) with elapsed timer — makes the 30-s latency legible as "three filings + an LLM read them."

### 4.2 The one slide (pitch deck content)

**Title:** *Advisor Brief — from ticker to client-ready in 60 seconds*
**Audience framing:** the panel = client stakeholders.

| Zone | Content |
|---|---|
| Top-left: **Problem** | "Advisors burn 30–60 min per stock across quote screens and 200-page filings. Onboarding calls can't wait." (one line, one stat) |
| Top-right: **Solution** | Screenshot of the brief page + "Enter ticker → live quote + AI brief distilled from the company's own SEC filings." |
| Middle: **How it works** (5-node horizontal flow) | Ticker → **EDGAR** (10-K/10-Q/8-K) + **Live quote** → **Smart section extraction** → **Claude Sonnet 4.5 via Portkey** → **Advisor Brief**. Tag each node: *public data · no proprietary feeds · LLM gateway controlled*. |
| Bottom-left: **Why it's trustworthy** (client-language bullets) | Grounded only in retrieved filings · every claim links to the SEC source document · timestamps on all data · no buy/sell advice, compliance-safe output. |
| Bottom-right: **Path to production** | Phase 2: multi-ticker comparison, XBRL figure tables, topic search across filings (EDGAR full-text API), per-firm document upload (own 10-K library), Portkey → logging/guardrails/cost controls. "Prototype built and deployed in 2 hours — production is a hardening exercise, not a rethink." |
| Footer strip | Tech badges: Next.js · Vercel · Portkey · Anthropic Claude Sonnet 4.5 · SEC EDGAR API. |

Design constraint: ≤ 40 words of body copy beyond the diagram; the live demo carries the detail.

### 4.3 Demo script (3–4 minutes)

1. Hook: "Marcus has a 2 p.m. call about NVDA and has never covered semis."
2. Type `NVDA` live → narrate the step strip ("resolving CIK… pulling the latest 10-K, 10-Q, and yesterday's 8-K… Claude is reading the risk factors now").
3. Land on the brief → point at 52-wk range, then plain-English summary, then **talk to the talking points as if briefing Marcus**.
4. Click one filing badge → sec.gov source → "everything is auditable."
5. Close: "two hours of an analyst's reading compressed to sixty seconds, with receipts."
- **Pre-run one cached brief 15 min before the interview** (own laptop + phone both hold the page) — insurance against cold-start or upstream flakiness, disclosed in the step-status strip if ever used.

---

## 5. Constraints & Tradeoffs (120-minute build window)

### 5.1 Timeboxed build plan

| Block | Min | Deliverable | Exit check |
|---|---|---|---|
| 0. Smoke tests | 0–10 | `npx create-next-app@latest` (Next 16.3.8, App Router defaults) + deploy **empty** app to Vercel; curl Portkey from laptop with provided key + exact model string | "Hello" from claude-sonnet-4.5 through gateway; Vercel URL exists |
| 1. Data lib | 10–40 | `sec.ts` + `quote.ts` working against AAPL via a debug endpoint | JSON in terminal, CIK/10-K/10-Q/8-K located |
| 2. Extract+LLM | 40–70 | `cheerio` slicing + Portkey summary call producing valid `BriefJson` | One ticker end-to-end in `/api/brief` response |
| 3. UI | 70–100 | Two screens, all sections rendered, step-status strip, disclaimer | Fresh browser demo of NVDA passes |
| 4. Hardening | 100–115 | Error paths (bad ticker, Yahoo down, malformed JSON retry), caching, final deploy | Deliberately break each dependency → UI degrades legibly |
| 5. Rehearsal | 115–120 | Slide built, demo run twice, cached fallback prepared | Slide ≤ 40 words body copy |

### 5.2 Known limitations → pragmatic calls

| # | Limitation | Tradeoff decision |
|---|---|---|
| 1 | End-to-end latency ~30–45 s (SEC downloads + LLM read) | Embrace it: show step statuses + use it as narration, rather than fake speed. Cache demo tickers for instant re-runs. |
| 2 | Yahoo chart endpoint is unofficial; could 429/403 mid-demo | Server-side fetch + `query2` fallback + quote-independent brief (filings section still wins the demo). Pre-test tickers 15 min before. |
| 3 | SEC HTML formats drift across filers (inline-XBRL, weird headings) | Section slicer with head-tail fallback sampling — degrades to "good-enough context" instead of failing; cap 3 MB per doc to bound parse time. |
| 4 | Full 10-Ks blow past a comfortable single-call context | **Chose:** heading-based slicing to ~18 K tokens (fast, cheap, explainable). **Rejected:** map-reduce over 20 chunks (2–3 min latency, 5× cost, more code than a demo needs). |
| 5 | Model string `@aws-bedrock-use2/...` is gateway-specific; exact Portkey routing semantics unverified | Block 0 smoke test with the verbatim string from the brief; if the gateway rejects it, request the alias from organizers immediately (their docs say config changes on request) and pin `PORTKEY_MODEL` env var so the fix is config, not code. |
| 6 | Vercel cold starts (~1–3 s) + function duration limits | Non-issue at ~45 s worst case (limit is 60 s hobby / much higher pro); warm the function right before the interview. |
| 7 | No SEC-edgar MCP/SDK time-savings assumed | Plain `fetch` against the four verified endpoints — zero dependency risk; cheerio is the only added package. |
| 8 | Foreign issuers, missing recent filings, CIK gaps | Defined fallback policy (§2.2) + honest "no periodic filings" state; steer demo tickers to large US filers. |
| 9 | Hallucinated figures in summary | Prompt grounding ("ONLY provided excerpts") + quote panel rendered from raw JSON (never LLM-generated numbers) + per-section source links. |
| 10 | Exa as alternative retrieval | **Cut** — EDGAR verified sufficient; Exa needs another key and adds a dependency without scenario-specific value. Revisit only with ≥ 20 min slack, behind a feature flag. |

### 5.3 Explicitly out of scope (YAGNI list)

Chat/multi-turn Q&A · authentication/user accounts · more than 3 filings per ticker · XBRL figure tables (unless block 4 finishes early) · streaming tokens to UI · historical brief comparison · mobile-first layout (desktop demo) · unit-test suite (prototype bar: manual happy path + three failure paths).

---

## 6. Interview Defense Prep (anticipated stakeholder questions)

- **"Where does this break at scale?"** — SEC rate limits (per-IP 10/s) → queue + edge caching of docs (immutable per accession number, cheap CDN win); LLM latency → job queue + streaming; cost → cache extracted sections per filing (shared across advisors at the firm).
- **"Why not just GPT with browsing?"** — grounding + auditability: every claim traceable to a specific filing/excerpt; no browsing-shaped hallucination; gateway-controlled model, prompts, and logging via Portkey.
- **"Compliance?"** — output is neutral synthesis of the company's own disclosures, links to primary sources, explicit not-investment-advice framing; figures never pass through the LLM.
- **"What did you cut, and would you?"** — cite §5.2 tradeoffs (slicing vs. map-reduce, 3-filing cap, Exa cut) — this is the graded competency; lead with it rather than apologizing for it.

---

## Appendix A — Verified evidence log (2026-10-05)

| Probe | Result |
|---|---|
| `company_tickers.json` | 200; AAPL→CIK 320193, NVDA→1045810 |
| `submissions/CIK0000320193.json` | 200; `filings.recent` with form/date/accession/primaryDocument |
| `efts.sec.gov/LATEST/search-index?q=...&forms=10-K&ciks=0000320193` | 200; Elasticsearch-format hits (kept for stretch) |
| `query1.finance.yahoo.com/v8/finance/chart/AAPL` | 200; price 333.69, 52wk 243.42–345.34, volume, 1y series |
| Stooq CSV | dead (HTML error page) — rejected |
| FMP `apikey=demo` | rejected — keys required; not on critical path |
| *Re-verified 2026-10-05 (after teamwork-agent survey contradicted draft):* |
| `docs.sec.gov` DNS | **does not resolve** (curl exit 6) — host corrected to `www.sec.gov` in §1.2/§2.2 |
| `www.sec.gov/Archives/edgar/data/320193/…/aapl-20250927.htm` | 200, 1,520,319 bytes; padded CIK → 301 to unpadded |
| Yahoo bare UA vs Chrome/124 UA | 429 vs 200 — browser UA + Accept required (§2.1) |
| Section-slice false positives | AAPL TOC matches `Item 1. Business` at idx 19,354 before body at 22,903; NVDA `Item 1A` ×8 (TOC + cross-refs) — filter rules added to §3 step 4 |

## Appendix B — Environment variables

```
PORTKEY_BASE_URL=https://portkeygateway.perficient.com/v1
PORTKEY_MODEL=@aws-bedrock-use2/us.anthropic.claude-sonnet-4-5-20250929-v1:0
PORTKEY_API_KEY=<provided at interview start>
SEC_USER_AGENT=AdvisorBriefPrototype demo contact@example.com
```

## Appendix C — Framework research evidence (2026-10-05)

| Fact | Source |
|---|---|
| Latest Next.js = **16.3.8**; engines `node >= 20.9.0`; peers react `^19.0.0` | npm registry (`registry.npmjs.org/next/latest`) |
| Sync `params`/`searchParams`/`cookies()`/`headers()` access **removed** in 16 (async required); codemod `next-async-request-api`; `next typegen` helpers | Official v16 upgrade guide (`nextjs.org/docs/app/guides/upgrading/version-16`) |
| `middleware` deprecated → `proxy.ts` (Node runtime only); edge unsupported in proxy | Official v16 upgrade guide |
| Turbopack default for dev+build; custom webpack config fails build unless `--webpack`; top-level `turbopack` config; separate dev/build output dirs | Official v16 upgrade guide + Next.js 16 blog |
| `next lint` removed; AMP, runtime configs, `experimental.dynamicIO`/`useCache` removed; `revalidateTag` 2-arg; image default tightening | Official v16 upgrade guide (Removals / Behavior Changes tables) |
| Cache Components (`cacheComponents`) is opt-in PPR model; **default = everything at request time** | Next.js 16 blog (`nextjs.org/blog/next-16`) |
| `create-next-app@latest` template: App Router by default, TypeScript-first, Tailwind, ESLint (flat config) | Next.js 16 blog |
| Local machine: Node v24.18.0, npm 11.16.0 — meets ≥ 20.9 requirement | `node -v` / `npm -v` |
