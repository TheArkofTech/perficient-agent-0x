# Deployment — Vercel

> **Status: pre-implementation guide.** Commands become real when the app scaffold exists. Derived from [specification §5.1–§5.2, Appendix B](superpowers/specs/2026-10-05-advisor-brief-finance-scenario-design.md).

## Runtime facts (Next.js 16.3.8, verified 2026-10-05)

| Constraint | Value |
|---|---|
| Node.js | ≥ 20.9 required (Vercel default and local v24.18 both fine) |
| TypeScript | ≥ 5.1 |
| Bundler | **Turbopack by default** (dev + build); do not add a webpack config — it hard-fails the build |
| Linting | `next lint` **removed** — don't add it to build scripts; `next build` does not lint |
| Function runtime | Node.js (Route Handlers must not set `edge`) |
| Function duration | worst-case brief ≈ 45 s — inside Vercel Hobby's 60 s limit; Pro is non-issue |

## Environment variables

Set in Vercel dashboard (Project → Settings → Environment Variables) and locally in `.env.local` (template: [`.env.example`](../.env.example)).

| Variable | Value | Notes |
|---|---|---|
| `PORTKEY_BASE_URL` | `https://portkeygateway.perficient.com/v1` | from challenge brief |
| `PORTKEY_MODEL` | `@aws-bedrock-use2/us.anthropic.claude-sonnet-4-5-20250929-v1:0` | passed verbatim in request body `model`; **if the gateway rejects it, fixing this env var is the whole remedy** — ask organizers to remap the gateway model |
| `PORTKEY_API_KEY` | issued at interview start | server-side only; never `NEXT_PUBLIC_`-prefixed |
| `SEC_USER_AGENT` | `AdvisorBriefPrototype <contact@example.com>` | required by SEC fair-access on every sec.gov fetch |

## First deploy (build Block 0 — empty skeleton on purpose)

```bash
npx create-next-app@latest advisor-brief        # TS + Tailwind + App Router defaults
cd advisor-brief && npm i cheerio
vercel link && vercel                            # deploy untouched skeleton → get public URL early
vercel env add PORTKEY_API_KEY production
vercel env add PORTKEY_BASE_URL production
vercel env add PORTKEY_MODEL production
vercel env add SEC_USER_AGENT production
```

Rationale: deploying the skeleton in minute 0–10 removes all platform surprises (project linking, env-var plumbing, build pipeline) before any feature code exists — the rest of the window is spent on logic, not infra firefighting.

Alternative: push this repo and import it at vercel.com/new (framework auto-detected as Next.js; set the same four env vars; keep default build settings — Turbopack is the default).

## Post-deploy smoke tests

```bash
# 1. App up
curl -sI https://<project>.vercel.app | head -1                # expect 200

# 2. Pipeline contract (after /api/brief exists)
curl -s -X POST https://<project>.vercel.app/api/brief \
     -H 'content-type: application/json' -d '{"ticker":"AAPL"}' | head -c 400

# 3. LLM path independent of SEC flakiness (run at build Block 0 from laptop)
curl -s $PORTKEY_BASE_URL/chat/completions -H "Authorization: Bearer $PORTKEY_API_KEY" \
     -H 'content-type: application/json' \
     -d '{"model":"'"$PORTKEY_MODEL"'","messages":[{"role":"user","content":"say hi"}],"max_tokens":20}'
```

## Cold-start & demo-window care

- Vercel free tier cold starts add ~1–3 s — irrelevant to correctness; warm the function (`curl` the URL twice) **immediately before** the interview.
- The 15-min in-memory cache lives per warm function instance; it's a rate-pressure reliever, not a guarantee — the runbook's cached-hash fallback is the real insurance.

## Related

[Demo runbook](demo-runbook.md) · [Data sources](data-sources.md) · [Architecture](architecture.md)
