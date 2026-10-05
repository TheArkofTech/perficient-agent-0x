# Pitch Slide — Content & Speaker Notes

> **Status: content locked, layout to be produced in any tool (Figma/GSlides/PPTX) in ~10 min.** Source: [specification §4.2](superpowers/specs/2026-10-05-advisor-brief-finance-scenario-design.md). Design constraint: ≤ 40 words of body copy beyond the diagram — the demo carries the detail.

**Title:** *Advisor Brief — from ticker to client-ready in 60 seconds*

## Zone map

| Zone | On-slide content | Speaker note |
|---|---|---|
| Top-left — **Problem** | "Advisors burn 30–60 min per stock across quote screens and 200-page filings." | Frame Marcus (the persona) in one sentence; time pressure, not laziness. |
| Top-right — **Solution** | Screenshot of the rendered brief + "Enter ticker → live quote + AI brief distilled from the company's own SEC filings." | Freeze on this while running the live demo beat 3. |
| Middle — **How it works** (5-node flow) | `Ticker → [EDGAR 10-K/10-Q/8-K] + [Live quote] → [Smart section extraction] → [Claude Sonnet 4.5 · Portkey] → [Advisor Brief]` — node tags: *public data · no proprietary feeds · gateway-controlled AI* | Walk left→right in one breath; tap "section extraction": "we read the risk factors, not the cover page." |
| Bottom-left — **Why it's trustworthy** | Grounded only in retrieved filings · every claim links to the SEC source · timestamps on all data · no buy/sell advice | Compliance is the wealth-management buying criterion; say the word "auditable." |
| Bottom-right — **Path to production** | Phase 2: multi-ticker comparison · XBRL figure tables · topic search across filings · per-firm document library · Portkey logging/guardrails/cost controls. Close line: "Prototype built and deployed in 2 hours — production is a hardening exercise, not a rethink." | Never oversell; each phase-2 item already has a probed API behind it (data-sources.md §2.4–2.5). |
| Footer strip | Next.js · Vercel · Portkey · Anthropic Claude Sonnet 4.5 · SEC EDGAR API | — |

## Build checklist

- [ ] Export the brief screenshot at the T-20 pre-flight run (real data, not mock).
- [ ] One accent color on the flow's "extraction" node — it's the clever bit.
- [ ] Word-count the body copy ≤ 40; cut adjectives, keep nouns and numbers.
- [ ] Presenter notes live here; the slide itself stays sparse.

## Related

[Demo runbook](demo-runbook.md) · [Interview Q&A](interview-qa.md)
