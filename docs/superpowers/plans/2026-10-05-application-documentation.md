# Advisor Brief Application Documentation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Author the full documentation suite (README + docs/ tree, engineering-grade scope) for Advisor Brief from the approved spec, before any application code exists.

**Architecture:** Every document is derived from the single source of truth — `docs/superpowers/specs/2026-10-05-advisor-brief-finance-scenario-design.md` — and each file carries a status banner ("pre-implementation, derived from approved spec") so docs never misrepresent repo state. Root `README.md` is the index.

**Tech Stack:** Markdown only; no tooling, no build steps. Repo already git-initialized with remote `github` → `TheArkofTech/perficient-agent-0x` (private).

**Source-of-truth map (spec section → doc file):**

| File | Responsibility | Derived from spec |
|---|---|---|
| `README.md` | Pitch, feature summary, architecture snapshot, quickstart (build-pending labeled), env table, doc index | §0, §1.2, §4.1, §1.3, App. B |
| `docs/architecture.md` | Approach comparison, component/pipeline design, project layout, Next 16 router-safety rules | §1.1–1.5, §3 |
| `docs/data-sources.md` | EDGAR + Yahoo endpoints, request shapes, selection policy, edge cases, evidence log | §2, App. A |
| `docs/api-reference.md` | `POST /api/brief` contract, `BriefJson` TS schema, error/degradation shapes | §3, §4.1 |
| `docs/prompt-design.md` | Grounding strategy, section slicing, token budget, schema + failure-retry design | §3 steps 4–5, §5.2 #4/#9 |
| `docs/decision-log.md` | ADR-style entries: architecture choice, slicing vs map-reduce, Exa cut, Yahoo-over-keyed APIs, no PPR | §1.1, §2.1, §2.2, §5.2 |
| `docs/deployment.md` | Vercel deploy steps, env vars, Next 16 constraints (Turbopack, Node ≥20.9, no `next lint`), cold-start notes | §1.3–1.4, §5.1, §5.2 #5/#6, App. B |
| `docs/demo-runbook.md` | Interview-day checklist, 4-min demo script, cached-brief insurance, failure playbook | §4.3, §5.2 |
| `docs/pitch-slide.md` | One-slide zone-by-zone content + speaker notes | §4.2 |
| `docs/interview-qa.md` | Stakeholder Q&A defense (scale, compliance, trust, cuts) | §6 |

**Execution rules:**
- No placeholders in the *docs themselves* — but each doc states planned-vs-real status honestly (e.g., "After the build: run `npm run dev`").
- Commit per logical group (README+core / reference / operations) — 3 commits, push at end.
- Verification = link check (`grep` for relative hrefs, confirm targets exist) + status-banner presence.

---

### Task 1: Root README + core docs (architecture, data-sources)

**Files:**
- Create: `README.md`, `docs/architecture.md`, `docs/data-sources.md`

- [x] **Step 1:** Write `README.md` per source map (includes doc index table linking all 9 docs; quickstart marked "⏳ build pending — commands are the plan of record"; env var table; 60-second pitch; demo tickers).
- [x] **Step 2:** Write `docs/architecture.md`: status banner; diagram (ASCII from spec §1.2); stack table; project layout tree; condensed pipeline §3 with per-step budgets; full R1–R12 router rules.
- [x] **Step 3:** Write `docs/data-sources.md`: status banner; all 5 EDGAR probes + Yahoo probe with exact URLs, required headers (`User-Agent` format), sample responses (abridged from verified output), filing-selection policy, edge-case table, evidence log from App. A.
- [x] **Step 4:** Verify: `test -f` each file; no "TBD/TODO" strings: `grep -rn "TBD\|TODO\|fill in" README.md docs/*.md` → expect no matches (status banners must use "pending", not "TBD").
- [x] **Step 5:** Commit `docs: add README, architecture, and data-source documentation`.

### Task 2: Reference docs (api-reference, prompt-design, decision-log)

**Files:**
- Create: `docs/api-reference.md`, `docs/prompt-design.md`, `docs/decision-log.md`

- [x] **Step 1:** `api-reference.md`: endpoint contract (request/response `BriefResult` TS interface incl. `quote`, `filings[]`, `brief`, `generatedAt`, per-step status objects), HTTP error shapes (unknown ticker 404, upstream partial-failure 200-with-failed-step), example `curl` + example JSON body consistent with schema.
- [x] **Step 2:** `prompt-design.md`: system prompt text (verbatim from spec §3 step 5), full `BriefJson` schema, slicing rules table (Item headings + char caps), head-tail fallback algorithm, 60 K-char budget math, retry-on-invalid-JSON flow.
- [x] **Step 3:** `decision-log.md`: 6 ADRs (context → decision → alternatives rejected → revisit-when): Next.js-16-on-Vercel; EDGAR-direct over Exa; Yahoo keyless over keyed vendors; heading-slicing over map-reduce; blocking render over SSE; no PPR/cacheComponents.
- [x] **Step 4:** Verify link/text checks as Task 1 step 4.
- [x] **Step 5:** Commit `docs: add API reference, prompt design, and decision log`.

### Task 3: Operations docs (deployment, runbook, pitch-slide, interview-qa) + push

**Files:**
- Create: `docs/deployment.md`, `docs/demo-runbook.md`, `docs/pitch-slide.md`, `docs/interview-qa.md`

- [x] **Step 1:** `deployment.md`: Vercel project create, env var entry table (exact names from App. B), Node runtime note, build command `npm run build` (Turbopack default), post-deploy smoke curls, cold-start warm-up step.
- [x] **Step 2:** `demo-runbook.md`: T-30/T-15/T-5 pre-flight checklist, 5-beat demo script with narration lines, cached-hash fallback procedure, failure playbook keyed to step-status strip states.
- [x] **Step 3:** `pitch-slide.md`: zone table from spec §4.2 + speaker notes per zone.
- [x] **Step 4:** `interview-qa.md`: expand spec §6 into Q → A pairs (scale, compliance, hallucination controls, why-not-GPT, cost, cut-list).
- [x] **Step 5:** Verify: full link check across all docs; every doc has status banner except README (README carries status line instead).
- [x] **Step 6:** Commit `docs: add deployment guide, demo runbook, pitch slide content, and interview Q&A`; then `git push github main`.

## Acceptance Criteria

- `README.md` + 9 docs files exist; all spec sections represented per source map; zero placeholder strings; all relative links resolve; 3 commits pushed to private repo.
