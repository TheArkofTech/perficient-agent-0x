# Interview Q&A Prep — Stakeholder Defense

> **Status: prep document.** Expanded from [specification §6](superpowers/specs/2026-10-05-advisor-brief-finance-scenario-design.md). Panel = client stakeholders (wealth firm) + technical evaluators; expect both lenses in 20 minutes.

## Scale & operations

**Q: Where does this break at scale?**
**A:** Three pressure points, all known: (1) SEC rate limits (10 req/s/IP) → queue + CDN-cache the *immutable* filing documents keyed by accession number — a filing never changes, so caching is free correctness; (2) LLM latency → job queue + streaming (contract already reserves `steps[]` telemetry); (3) cost → extracted section text is shareable across the firm — slice once per filing, summarize per advisor request.

**Q: What about after-hours, IPOs, non-US tickers?**
**A:** Quote endpoint returns last-session data with its `regularMarketTime` timestamp — the UI says "as of," never pretends. Foreign issuers fall back to 20-F/6-K, and tickers with no US periodic filings get an honest quote-only brief. Unknown tickers 404 with an explanation.

## Trust, risk & compliance

**Q: Why not just ChatGPT with browsing?**
**A:** Grounding and auditability. This system only reads documents it names and links; every summary section deep-links to the SEC filing; raw numbers never pass through the model at all — the quote panel renders from the upstream JSON. Plus the Portkey gateway gives the firm model control, logging, and cost governance rather than a consumer chat window.

**Q: How do you prevent hallucinated financials?**
**A:** Four layers: numbers bypass the LLM entirely (quote panel is raw JSON); the prompt restricts the model to provided excerpts with an explicit "Not covered in retrieved excerpts" escape; the model produces no recommendations by instruction (compliance posture); and a human can diff any claim against its linked source in one click.

**Q: Would you ship this to advisors as-is?**
**A:** No — as a decision-support brief with sources, yes. It compresses reading; it doesn't replace judgment or supervision. The output framing (neutral, no buy/sell, cited) is deliberately built for a compliance-reviewed workflow.

## Architecture choices

**Q: Why Vercel/Next instead of the n8n workspace you provided?**
**A:** The stakeholder requirement was a Vercel deployable and the differentiating logic is EDGAR HTML section extraction — control over parsing and prompt wiring mattered more than workflow speed. n8n remains a fine orchestration choice for a firm already running it; I'd reuse this pipeline's steps as its nodes.

**Q: Why slice filings instead of just feeding whole 10-Ks to a 1M-token model?**
**A:** Latency, cost, and signal. Section slicing keeps the context ~18 K tokens: ~25 s per brief at cents. Map-reduce over the whole document triples-plus latency and adds orchestration surface with no demo-day benefit — a named tradeoff, revisitable in phase 2 (decision-log ADR-004).

**Q: The Yahoo endpoint is unofficial — is that responsible?**
**A:** For a prototype: it's keyless, verified, and server-side-isolated behind one `Quote` interface with a documented fallback ladder (mirror host → quote-less brief → licensed vendor in production, where procurement buys the data — ADR-003). The architecture absorbs the swap.

## Cost

**Q: What does a brief cost?**
**A:** ≈ 18 K input + ~1.5 K output tokens on Sonnet 4.5 via Bedrock: under $0.30, plus negligible public-API fetches. Caching sliced sections per filing drops repeat cost toward zero.

## The cut list (offer this before they ask)

**Q: What did you sacrifice, and would you do it again?**
**A:** Dropped: streaming render, XBRL figure tables, multi-ticker compare, tests beyond manual happy + three failure paths, Exa (redundant once EDGAR probes passed). Kept: the honest failure UX (step-status strip) and source-linking — those *are* the client value, not polish. Same calls twice: the 120-minute budget bought architecture certainty first (empty app deployed at minute 10), features second.

## Related

[Decision log](decision-log.md) · [Demo runbook](demo-runbook.md) · [Pitch slide](pitch-slide.md)
