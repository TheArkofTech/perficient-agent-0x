# Parallel Dispatch Map — Advisor Brief

> Companion to [Milestone 5 dispatch](2026-10-05-milestone-5-llm-ui-dispatch.md). Verified against worktree state and orchestration files 2026-10-05.

## Immediate gate actions (no worker needed)

1. **Close M1 now** — its exit criterion (`npm run build` clean, Turbopack, 0 TS errors) was **independently verified externally** on 2026-10-05; no need to burn a re-verification cycle. Worker's remaining duty is only the handoff note + committing the scaffold.
2. **Commit the scaffold** — `app/`, `package.json`, configs are still untracked; parallel workers writing on top of uncommitted state risks silent clobber conflicts at gate time.
3. **Add `.agents/` to `.gitignore`** — orchestration state must never enter feature diffs or `git add -A`.

## File-ownership matrix (the parallelization invariant)

| Path | M1 | M2 | M3 | M4 | M5 |
|---|---|---|---|---|---|
| `package.json`, tsconfig, next.config, `app/page.tsx`, `app/layout.tsx` | ✅ owner | — | — | — | — (read-only) |
| `lib/quote.ts` | — | ✅ owner | — | reads | reads via pipeline |
| `lib/sec.ts` | — | — | ✅ owner | reads | reads via pipeline |
| `scripts/verify-data.ts` | — | — | — | ✅ owner | — |
| `lib/types.ts`, `lib/llm.ts`, `lib/pipeline.ts` | — | *(may import)* | *(may import)* | — | ✅ owner |
| `app/api/**`, `app/brief/**`, `components/**` | — | — | — | — | ✅ owner |

**Rule: no two active milestones write the same path.** Disjoint ownership is what makes the schedule below safe, not just convenient.

## Concurrency schedule

```
now ──────────────┬──────────────────────┬────────────────────┐
                  │ M2  lib/quote.ts     │                    │
   (M1 closed) ───┤ M3  lib/sec.ts       ├──── M4  verify ────┤
                  │     (parallel:       │         ∥          ├──── INTEGRATION
                  │      disjoint files) │   M5  llm+UI       │      gate
                  └──────────────────────┤  (starts NOW with  │      + E2E
                                         │   mocked inputs)   │
```

- **Wave 1 (running now):** M2 ∥ M3 ∥ **M5 early objectives** (2, 5, 6, 7 — LLM client, redirect page, brief page shell, components). M5's early work codes against the frozen contract in `docs/api-reference.md`, not against M2/M3 internals, so it needs nothing from them yet.
- **Wave 2:** M4 (needs M2+M3 exports) ∥ M5 integration (pipeline wiring to real `lib/sec.ts` / `lib/quote.ts` — needs M2+M3 gates passed).
- **Final gate:** full E2E incl. M5 acceptance list + the four non-regression facts; Portkey live-key check happens the moment the interview key is available.

## Interface contract = the parallelization enabler

All parallel-safe coupling goes through two frozen artifacts — never through another worker's code:
- `docs/api-reference.md` — response/error schemas (`BriefResult`, `Quote`, `FilingRef`, `BriefJson`, `StepState`)
- `docs/prompt-design.md` — slicing rules, caps, prompt envelope

If any worker finds a contract conflict: escalate at gate, contract doc wins, spec arbitrates.

## Risk register for the parallel run

| Risk | Mitigation already in dispatches |
|---|---|
| M2/M3/M5 each define their own TS types → integration drift | Single owner of `lib/types.ts` (M5); M2/M3 keep local types only until gate reconciliation |
| Workers mutate shared scaffold to "help" | Explicit "must NOT touch" lists in M4/M5 dispatches |
| Mock mode mistaken for live output | M5 integrity rule: fixture output must mark `synthesize.status: 'skipped'` visibly; auditors can diff UI vs. gateway logs |
| Untracked-state collisions | Immediate action 2 (commit scaffold before wave 1 deepens) |
