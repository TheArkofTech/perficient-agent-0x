# Milestone 5 Dispatch — LLM Synthesis & Brief UI

> **Ready to ingest:** hand this to the Project Orchestrator to dispatch as a worker (`worker_m5_1`), or execute standalone. Written 2026-10-05 after review found M2/M3's plan terminates *before* the demonstrable prototype: `PROJECT.md` contains no milestone covering LLM synthesis, `/api/brief`, or the brief UI.

**Authoritative references:**
- Spec (source of truth): `docs/superpowers/specs/2026-10-05-advisor-brief-finance-scenario-design.md` §1.2, §3 (steps 5–6), §4.1
- Frozen contract: `docs/api-reference.md` (`BriefResult`, `Quote`, `FilingRef`, `BriefJson`, `StepState`, error shapes)
- Prompt + extraction rules: `docs/prompt-design.md`
- Router rules (binding): `docs/architecture.md` §1.4 R1–R12

**Milestone 5 Objectives**

1. **`lib/types.ts`** — TypeScript interfaces for the frozen contract above. Single owner: M5. (If M2/M3 workers defined local shapes, reconcile here at integration; the contract in `docs/api-reference.md` wins on conflict.)
2. **`lib/llm.ts`** — Portkey synthesis client:
   - Raw `fetch` POST `{PORTKEY_BASE_URL}/chat/completions`, `Authorization: Bearer {PORTKEY_API_KEY}`, body `model: process.env.PORTKEY_MODEL` verbatim; `temperature 0.2`; `AbortSignal.timeout(30_000)`.
   - System prompt **verbatim** from `docs/prompt-design.md` §2; user envelope labels every slice (`=== {form} filed {date} (accession {acc}) — {section} ===`).
   - Failure ladder: attempt 1 → fence-strip/first-`{...}` parse → invalid → attempt 2 with "Return ONLY valid JSON, no prose." → invalid → return `{ brief: null, briefRawText }`. Never throw to the route.
   - **Mock mode for pre-interview testing:** if `PORTKEY_API_KEY` is unset, return a deterministic fixture `BriefJson` built from the *actual* provided excerpts (first sentences per section) and mark `steps[].synthesize` with `status: 'skipped'` + `error: 'no API key — fixture output'`. The UI must visibly show this state. Hardcoding canned results *as if live* is an integrity violation and will be rejected.
3. **`lib/pipeline.ts`** — orchestrator composing M2/M3 modules per spec §3 steps 1–6: resolve → `Promise.allSettled([quote, filingsIndex])` → retrieve → extract → synthesize → assemble `BriefResult` with `steps[]` telemetry (each `{step, status, ms}`) and per-step error capture. Consumes `getQuote` from `lib/quote.ts`, SEC functions from `lib/sec.ts` — **do not modify those files**; adapt via their exports, escalate mismatches to the gate.
4. **`app/api/brief/route.ts`** — `export async function POST(req: Request)`: validate ticker (1–6 letters → else 400 `invalid_ticker`), run pipeline, unknown ticker → 404 `unknown_ticker`, SEC hard-fail → 502 `sec_unavailable`, otherwise 200 `BriefResult` (partial failures are 200 with failed entries in `steps[]`). Node runtime; no `export const config = { runtime: 'edge' }`.
5. **`app/brief/page.tsx`** — server component: `const { ticker } = await searchParams` (v16 async APIs), uppercase, `redirect(\`/brief/${ticker}\`)`. Absorbs the landing form's existing `GET /brief?ticker=…` action — no changes to `app/page.tsx`.
6. **`app/brief/[ticker]/page.tsx`** — `params` as `Promise` awaited (R2); renders client wrapper:
   - On mount: if `location.hash` starts `#d=` → decode base64url+inflate → render instantly with visible `generatedAt` (honest cache).
   - Else: `POST /api/brief`, drive **`StepStatus`** strip live (resolve → quote → filings → retrieve → extract → synthesize, each ✓/✗ + ms + elapsed timer), write result hash back to the URL on success.
7. **Components** (`components/`, all server-renderable, styling matches existing landing page): `QuotePanel` (price, colored change, 52-wk range bar, volume, "as of {marketTime}", inline-SVG sparkline — **no `next/image`**), `FilingCards` (form + date badges → `sourceUrl`), `BriefSections` (snapshot / narrative / risks / outlook / events, each with source link), talking-points highlight card, `DisclaimerBar` ("Synthesized from public SEC filings… Not investment advice.").
8. **Stretch (only if all above verified):** SSE streaming from the route. Baseline blocking render is complete; do not sacrifice hardening for it.

**File Ownership (exclusive, disjoint from M2/M3/M4)**
- M5 owns: `lib/types.ts`, `lib/llm.ts`, `lib/pipeline.ts`, `app/api/**`, `app/brief/**`, `components/**`
- M5 must NOT touch: `lib/sec.ts`, `lib/quote.ts`, `scripts/**`, `package.json` (no new deps — `zlib` is Node built-in), M1 config files

**Dependencies & sequencing**
- Runtime integration requires M2 + M3 gates passed; objectives 2, 5, 6, 7 are codeable against contracts immediately (mock `pipeline` inputs in local testing).
- Safe to run **parallel with M4** (disjoint files); M4's `verify-data.ts` covers ingestion only — M5's acceptance below is the brief-path E2E.

**Acceptance Criteria (evidence required in handoff.md)**
- [ ] `npm run build` — 0 TS errors, no pages/, no webpack config (R1/R11).
- [ ] With live M2+M3 code and keyless mock mode: `curl -X POST localhost:3000/api/brief -d '{"ticker":"AAPL"}'` → 200, valid `BriefResult`, non-empty `filings[]` with `www.sec.gov/Archives` URLs, `steps[]` all present, `synthesize.status: 'skipped'` visibly fixture-marked.
- [ ] With Portkey key (or CI-injected): same call → `brief` fields all non-empty, JSON parse first-attempt, ≤ 45 s total.
- [ ] `ZZZZ99` → clean 404 JSON (no stack trace in response, no uncaught error in server log).
- [ ] Malformed body / `bad;ticker` → 400 `invalid_ticker`.
- [ ] Quote step forced-failing (bad host via env or test seam) → 200 with `quote: null`, filings + brief still render in browser.
- [ ] Browser: `GET /brief?ticker=nvda` → redirect → brief renders with step strip progression; reload via `#d=` hash shows cached brief instantly with visible timestamp; **screenshot(s) attached to handoff**.
- [ ] Every LLM number check: price/52-wk/volume on page byte-identical to raw quote JSON (proves numbers bypass the model).

**Non-regression facts (verified live 2026-10-05 — integration tests must expect them)**
1. Filing host is `www.sec.gov/Archives/edgar/data/{cikUnpadded}/…` — `docs.sec.gov` does not resolve.
2. Yahoo needs modern Chrome `User-Agent` + `Accept` or returns 429; `meta.previousClose` is `null` at `range=1y` (derive from `close[len-2]`).
3. Section slices must exclude TOC clusters and "Refer to Item…" cross-references; decode `&#8217;`/`&#160;` before matching.
4. All sec.gov requests carry `SEC_USER_AGENT` env-var UA.

**MANDATORY INTEGRITY WARNING:** DO NOT CHEAT. No hardcoded test results, no facade implementations, no bypassing the acceptance steps. All live-call evidence must come from real HTTP executions recorded in `handoff.md`.
