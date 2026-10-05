# Decision Log — Advisor Brief

> **Status:** decisions taken during specification (2026-10-05), recorded ADR-style. Source: [specification §1.1, §2, §5.2](superpowers/specs/2026-10-05-advisor-brief-finance-scenario-design.md).

Format: **Context → Decision → Alternatives rejected → Revisit when.**

---

### ADR-001 — Next.js 16 on Vercel as the whole stack

- **Context:** Stakeholder mandate to deploy on Vercel; challenge constraints: Portkey gateway (OpenAI-compatible), 120-minute build, live-demo interface of any shape.
- **Decision:** Single Next.js 16.3 app (App Router, TypeScript, Tailwind) — UI + serverless Route Handlers in one artifact, deployed to Vercel.
- **Rejected:** n8n (no Vercel deploy, weak HTML control) · AI-native tools (no programmatic data access, fails deploy mandate) · hybrid n8n-backend + Vercel-frontend (two systems, no demo value).
- **Revisit when:** a non-Vercel hosting constraint appears (then the app still runs anywhere `next start` runs).

### ADR-002 — Direct EDGAR APIs over Exa retrieval

- **Context:** Stakeholder guidance preferred EDGAR; Exa was offered as an alternative. Challenge provides no datasets.
- **Decision:** Four EDGAR endpoints used directly (ticker map, submissions index, Archives docs, plus XBRL/full-text search held in reserve). All verified live 2026-10-05. Exa cut entirely from v1.
- **Rejected:** Exa-based filing search (extra API key, extra dependency, no scenario advantage once EDGAR probes passed).
- **Revisit when:** product needs cross-filing *topic* search at scale (EDGAR full-text search API, already probed, is still the first call — not Exa).

### ADR-003 — Keyless Yahoo chart endpoint for quotes

- **Context:** Need real-time quote without consuming build minutes on vendor signup; demo must not depend on a second key issued mid-interview.
- **Decision:** `query1.finance.yahoo.com/v8/finance/chart` fetched server-side (verified: price/52wk/volume/1y series), `query2` mirror fallback, quote-independent brief if both fail.
- **Rejected:** Alpha Vantage/FMP/Finnhub free tiers (key + signup required — `apikey=demo` confirmed rejected; Stooq confirmed dead) — kept as pre-wired env-var backups only.
- **Revisit when:** production needs licensed data (exchange-fed vendor contract is a procurement decision, not an architectural one — the `Quote` interface won't change).

### ADR-004 — Heading-based section slicing over map-reduce summarization

- **Context:** 10-Ks run 150–400 K chars as text; the model could swallow them, but latency/cost/code budget is 120 minutes.
- **Decision:** cheerio text extraction + regex slicing to Item 1/1A/7/7A (10-K) and Item 2 (10-Q), 60 K-char cap ≈ 18 K tokens, head-tail sampling fallback. One LLM call, ~25 s.
- **Rejected:** map-reduce over ~20 chunks (2–3 min latency, 5× cost, extra orchestration code) · whole-document single-shot (needless tokens, slower, dilutes signal).
- **Revisit when:** accuracy reviews show slicing misses material info (then per-section summaries behind the same API contract).

### ADR-005 — Blocking render over SSE streaming

- **Context:** Vercel supports streaming Route Handlers; a streamed answer is nicer but complicates the JSON contract and client state.
- **Decision:** Baseline is a blocking call with a live step-status strip narrating the pipeline; SSE token streaming is a named stretch goal only if Block 3 finishes early.
- **Rejected:** streaming-first (partial-JSON parsing, retry semantics on stream error — all risk, little demo payoff against step-status narration).
- **Revisit when:** the product targets advisors waiting > 60 s regularly (multi-filing comparison).

### ADR-006 — Stay on Next.js 16 defaults: no PPR / Cache Components / edge

- **Context:** v16 introduces opt-in `cacheComponents` (PPR model), `proxy.ts` (replacing middleware), edge-capable functions — each adds conceptual surface.
- **Decision:** Node runtime, request-time dynamic execution defaults, in-memory `Map` cache for demo-window rate protection. No middleware, no PPR, no Next caching APIs, no `next/image` externals (rules R4–R8 in [architecture](architecture.md#nextjs-16-router-safety-rules-binding-r1r12)).
- **Rejected:** enabling Cache Components (build errors for uncached data outside Suspense, zero prototype value) · edge runtime (breaks cheerio-era doc handling for negligible latency gain).
- **Revisit when:** production needs per-firm doc libraries or multi-user caches — at which point CDN-caching of immutable accession-numbered documents is the first real win.

## Related

[Architecture](architecture.md) · [Prompt design](prompt-design.md) · [Specification §5](superpowers/specs/2026-10-05-advisor-brief-finance-scenario-design.md)
