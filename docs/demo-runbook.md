# Demo Runbook — Interview Day

> **Status: pre-implementation plan of record.** For the 20-minute live session (slide + prototype + stakeholder Q&A). Source: [specification §4.3, §5.2](superpowers/specs/2026-10-05-advisor-brief-finance-scenario-design.md).

## T-30 → T-5 pre-flight checklist

- [ ] **T-30** — Portkey smoke test from laptop (deployment.md §"Post-deploy smoke tests" probe 3) — gateway + key + model string alive.
- [ ] **T-20** — Run one full brief for each demo ticker (`AAPL`, `NVDA`) on the deployed URL; note any step-status amber.
- [ ] **T-15** — **Generate the insurance brief**: complete NVDA run, copy the URL with its `#d=` hash, open it in laptop browser tab 2 **and phone browser**. Reload offline-capable (page holds its own data; the hash is the cache).
- [ ] **T-10** — Warm the Vercel function: `curl` the live URL twice.
- [ ] **T-5** — Close noisy apps; browser tab 1 = landing page (ticker field focused), tab 2 = cached brief fallback; slide open in presenter view; phone on airplane-mode-off but face-down (it holds the fallback).

## Demo script (3–4 minutes, 5 beats)

| Beat | Action | Line |
|---|---|---|
| 1. Hook | show landing | "Marcus has a 2 p.m. call about NVDA and has never covered semis." |
| 2. Run | type `NVDA`, hit enter, narrate the step strip | "Resolving its SEC CIK… pulling the latest 10-K, 10-Q, and yesterday's 8-K… Claude is reading the risk factors now." |
| 3. Land | brief renders | point at 52-week range → plain-English summary → **brief the room on the talking points as if Marcus were the client** |
| 4. Receipt | click a filing badge → sec.gov source | "Everything is auditable — each claim links to the filing it came from, and raw numbers never pass through the model." |
| 5. Close | back to slide | "Two hours of an analyst's reading compressed to sixty seconds, with receipts." |

## Fallback ladder (know this cold)

| Symptom | First move | Still broken → |
|---|---|---|
| Live run errors on quote step | keep talking — filings section is the demo | switch to cached brief (tab 2), say so: "earlier run, same data shape" |
| LLM step fails / gateway 4xx | retry once (bad-JSON retry is built in) | cached brief + note live gateway demoed at T-30 |
| SEC 403/5xx | retry (UA env var is the usual suspect) | cached brief; explain the caching design honestly |
| Vercel totally down | phone/laptop cached static page (hash data is client-side) | slide-only walkthrough of architecture; offer repo tour |
| Cold-start jitter on first click | it's just 1–3 s — narrate the warm-up | n/a |

**Honesty rule:** the cached brief is *disclosed* if used ("this is the run from before the session — live generation takes about thirty seconds"). The step-status strip and visible `generatedAt` make fakery impossible by design; leverage that.

## Q&A posture

Lead with tradeoffs you chose (§5.2 of the spec / [decision log](decision-log.md)) rather than apologizing for gaps; the panel grades constraint navigation, not pixel polish. Full prep: [interview-qa.md](interview-qa.md).

## Related

[Deployment](deployment.md) · [Pitch slide](pitch-slide.md) · [Interview Q&A](interview-qa.md)
