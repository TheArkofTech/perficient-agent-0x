# Prompt & Extraction Design — Advisor Brief

> **Status: pre-implementation.** Derived from [specification §3 steps 4–5](superpowers/specs/2026-10-05-advisor-brief-finance-scenario-design.md). The naive approach — dumping whole 10-Ks into the model — is the trap this design avoids.

## 1. Section slicing (retrieval-side grounding)

### Pipeline

```
filing HTML → cheerio text (strip tags, collapse whitespace) → heading regex → capped excerpts
```

### Slicing rules

| Document | Sections targeted | Char cap |
|---|---|---|
| 10-K | `Item 1. Business` | 12,000 |
| 10-K | `Item 1A. Risk Factors` | 12,000 |
| 10-K | `Item 7. MD&A` | 15,000 |
| 10-K | `Item 7A. Quantitative Market Risk` | 5,000 |
| 10-Q | `Item 2. MD&A` (+ financial-statements region if heading misses) | 12,000 |
| 8-K | entire body (naturally short) | 6,000 |

- Heading regex must tolerate case shifts, `&nbsp;`, inline-XBRL artifacts (`ITEM&#160;1A`).
- **Fallback (format drift):** if a heading regex misses, sample **first + last 8,000 chars** of the document text — degraded context, never a dead end.
- Input HTML stream-capped at **3 MB** per document before parsing.

### Token budget math

Total assembled context hard cap: **60,000 characters ≈ 18,000 tokens**.

| Concern | Bound |
|---|---|
| Model context (Claude Sonnet 4.5) | comfortable — < 10 % of window |
| Latency | ≈ 20–25 s generation for ~1.5 K tokens out |
| Cost (Bedrock list pricing, indicative) | < $0.30 per brief |
| Retries | worst case 2× that, still trivial |

**Rejected:** map-reduce over ~20 chunks — 2–3 minutes latency, ~5× cost, more orchestration code than a 120-minute prototype can carry.

## 2. Generation prompt

### System prompt (verbatim)

> You are an equity research assistant preparing a briefing for a wealth-management advisor. Use ONLY the provided filing excerpts. Cite nothing you were not given. If a section is missing from the excerpts, say "Not covered in retrieved excerpts". Be factual, terse, neutral in tone — no buy/sell recommendations (compliance).

### User-message envelope

```
TICKER: {ticker}    COMPANY: {company}    AS OF: {generatedAt}

=== 10-K filed {date} (accession {acc}) — Item 1. Business ===
{excerpt}
=== 10-K — Item 1A. Risk Factors ===
{excerpt}
... (each slice labeled with form/date/section for citation)

Return ONLY a JSON object matching this schema:
{ BriefJson schema, field-by-field, with the §3 constraints restated }
```

Every slice is **labeled** so the model can attribute claims, and `sectionsUsed` in the API response records what was actually fed in (audit trail in [API reference](api-reference.md)).

### Output contract (`BriefJson`)

`companySnapshot` · `financialNarrative` · `keyRiskFactors[]` · `managementOutlook` · `recentMaterialEvents[]` · `advisorTalkingPoints[]` · `plainEnglishSummary` — shapes defined in [api-reference.md](api-reference.md).

Parameters: `temperature 0.2`, single user turn + system turn, JSON requested via prompt + fenced-block extraction (`response_format` used only if the Portkey deployment confirms support — raw-JSON tolerance is the baseline).

## 3. Failure ladder (LLM step)

```
attempt 1 → parse (strip code fences, extract first {...})
  invalid → attempt 2, appended instruction "Return ONLY valid JSON, no prose."
  invalid → return brief: null + briefRawText (UI renders raw text in <pre>)
```

The demo never dead-ends: worst case the panel sees model prose, not an error page.

## 4. Anti-hallucination posture

1. **Numbers never pass through the LLM** — quote panel renders from raw JSON (`Quote` object).
2. System prompt restricts the model to provided excerpts; absence is reported as "Not covered in retrieved excerpts" rather than invented.
3. `no buy/sell recommendations` keeps output compliance-safe for a wealth-management audience.
4. Every rendered section links to its filing's sec.gov source document — a human can diff claim vs. source in one click.

## Related

[Data sources](data-sources.md) · [API reference](api-reference.md) · [Decision log](decision-log.md)
