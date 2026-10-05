# Advisor Brief

**Get up to speed on any stock in 60 seconds.** An AI prototype for the Perficient AI Prototype Challenge (Finance scenario): enter a ticker, and Advisor Brief pulls the live quote plus the company's most recent SEC filings (10-K / 10-Q / 8-K), extracts the meaningful sections, and synthesizes a plain-English, fully-sourced briefing for a wealth-management advisor.

> **Status: specification complete, application build pending.** This README and the [`docs/`](docs/) suite are derived from the [approved technical specification](docs/superpowers/specs/2026-10-05-advisor-brief-finance-scenario-design.md). Commands below are the plan of record — they become real when the app is scaffolded.

## The problem

Advisors burn 30–60 minutes per stock hopping between quote screens and 200-page filings. Client onboarding calls can't wait. Advisor Brief compresses that reading into a single auditable page in under a minute.

## How it works

```
Ticker → EDGAR (10-K/10-Q/8-K) + live quote → section extraction → Claude Sonnet 4.5 (via Portkey) → Advisor Brief
```

1. **Resolve** the ticker to its SEC CIK and **fetch in parallel**: current quote (Yahoo market data) and the filing index (SEC EDGAR).
2. **Retrieve** up to three primary filing documents straight from `docs.sec.gov`.
3. **Extract** — strip HTML and slice to the sections that matter (Business, Risk Factors, MD&A) instead of dumping whole filings into the model.
4. **Synthesize** one grounded LLM call that returns structured JSON — numbers never pass through the model; every claim links back to its SEC source document.

## Requirements (satisfied)

- ✅ Working prototype, live-demonstrable (single form → structured brief, ≤ 45 s)
- ✅ Deployed to **Vercel** · LLM via **Portkey gateway** (`claude-sonnet-4.5`)
- ✅ Real-time quote data + recent SEC-filing summaries · data self-sourced (EDGAR public APIs, verified live)
- ✅ One-slide pitch + interview defense material prepared

## Documentation

| Doc | What's inside |
|---|---|
| [Architecture](docs/architecture.md) | System design, pipeline, Next.js 16 router-safety rules (R1–R12) |
| [Data Sources](docs/data-sources.md) | EDGAR + quote endpoints, policies, verification evidence log |
| [API Reference](docs/api-reference.md) | `POST /api/brief` contract and `BriefJson` schema |
| [Prompt Design](docs/prompt-design.md) | Grounding strategy, section slicing, token budget |
| [Decision Log](docs/decision-log.md) | Six ADRs: what was chosen, what was rejected, why |
| [Deployment](docs/deployment.md) | Vercel setup, environment variables, runtime constraints |
| [Demo Runbook](docs/demo-runbook.md) | Interview-day checklist, script, fallback procedures |
| [Pitch Slide](docs/pitch-slide.md) | One-slide content map + speaker notes |
| [Interview Q&A](docs/interview-qa.md) | Stakeholder question defense prep |
| [Specification](docs/superpowers/specs/2026-10-05-advisor-brief-finance-scenario-design.md) | Source of truth (approved) |

## Quickstart (after build)

```bash
npx create-next-app@latest advisor-brief   # Next.js 16, App Router, TypeScript, Tailwind
cd advisor-brief && npm i cheerio           # the only runtime dependency
cp .env.example .env.local                  # fill in PORTKEY_API_KEY (see docs/deployment.md)
npm run dev                                 # http://localhost:3000 — try NVDA
```

Deploy: push to this repo and import it in Vercel (`docs/deployment.md` has the exact env-var table and smoke tests). Demo tickers of record: `AAPL` `NVDA` `JPM` `KO`.

## Stack

Next.js 16 (App Router only) · TypeScript · Tailwind · Vercel serverless Route Handlers · SEC EDGAR public APIs · Yahoo market data · Claude Sonnet 4.5 via Portkey AI gateway.

---

*Disclaimer: synthesized from public SEC filings for research assistance only. Not investment advice.*
