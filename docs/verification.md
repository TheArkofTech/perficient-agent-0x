# Verification — 2026-10-05

The application is local-first: WebLLM in a dedicated browser worker selects bounded actions, Vercel Workflow executes finance tools, and PostgreSQL stores owner-scoped snapshots, retained evidence, ordered events and accepted-turn receipts. Portkey is optional and is not required for the local inference path. Clerk was removed at the user's request; HTTP-only HMAC-signed guest sessions protect each browser's history.

## Verification Receipt
- Target: complete automated suite
- Command: `npm test`
- Exit Code: `0`
- Results: 25 passed, 0 failed
- Coverage: citation and exact-quote validation; action schemas; guest cookie tampering/expiry; SEC section boundaries/quarterly risk/TOC; streaming bounds; live-source parsing; PostgreSQL submission idempotency/owner checks; frozen browser turns; accepted-action replay; cancellation/expiry fences; model/tool budgets; complete local context limit.

- Target: types and production artifact
- Commands: `npm run typecheck`, `npm run build`
- Exit Code: `0` for both
- Output: Next.js routes and 27 steps/3 workflows compiled.

- Target: real public finance sources
- Command: `npm run verify:data`
- Exit Code: `0`
- Results: live AAPL/NVDA quotes, latest annual/quarterly filings, substantive sections and keyword evidence search.

- Target: real local Workflow runtime and PostgreSQL
- Results: AAPL quote/filings/evidence/validated cited completion; completed result survives GET reload; duplicate action acknowledgement does not consume another turn; cancelled NVDA rejects late action with 409.
- Scope: this protocol test submitted deterministic actions; it does not establish model quality.

## Review and observed fixes
Agy implemented the interface. A fresh read-only review-agent and Ponytail pass found and corrected full-prompt overflow, descriptive section filter mismatches, and recovery from local inference errors. Actual Chrome qualification loaded Qwen3-1.7B; disabled thinking emits an empty `<think>` prefix, now removed before strict JSON/schema parsing. Nonempty reasoning prefixes remain invalid. Workflow directives must occupy standalone lines for the installed compiler's discovery pass.

## Material limits
WebLLM requires WebGPU and a first model download of roughly 1 GB; an open browser executes local model turns. Reload reconstructs the frozen turn, but model loading is explicit. Extraction is bounded and exposes omitted coverage; 8-K/6-K exhibits are not fetched. Yahoo quotes are unofficial and display source timestamps/delay. Reference validation proves retained-source provenance, not claim entailment. No Portkey key has been supplied; cloud synthesis is unverified and hidden from the keyless interface.
