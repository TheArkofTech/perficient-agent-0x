# E2E Test Infrastructure & Methodology Specification

**Project:** Next.js 16 Advisor Brief Data Ingestion Engine  
**Document Version:** 1.0.0  
**Status:** Approved & Implemented  
**Test Suite Directory:** `tests/e2e/`  
**Execution Command:** `npx tsx tests/e2e/runner.ts`  

---

## 1. Executive Summary & Quality Strategy

The Advisor Brief pipeline ingests live financial quotes from Yahoo Finance and regulatory filings (10-K, 10-Q, 8-K) from SEC EDGAR. Because financial advisors depend on strict data accuracy, zero hallucination, and high availability, the testing harness is designed with a defense-in-depth, 4-tier opaque-box test strategy.

The test infrastructure enforces four fundamental quality principles:
1. **Deterministic Logic Verification:** Algorithmic functions (TOC disambiguation, cross-reference filtering, character budget capping, HTML sanitization, previousClose derivation) are verified against deterministic fixtures reflecting real-world SEC filing quirks.
2. **Live Integration Fidelity:** Live queries against Yahoo Finance and SEC EDGAR verify real-world protocol compliance, HTTP headers (Chrome 124 UA for Yahoo, Fair Access UA for SEC), DNS endpoints, and response parsing.
3. **Graceful Fault Tolerance:** Edge cases, delisted symbols, network mirror failovers, and malformed documents degrade cleanly with structured error objects instead of unhandled promise rejections or exceptions.
4. **Strict Performance & Budget Invariants:** Extracted context must never exceed 60,000 characters (~18,000 tokens), and primary HTML downloads must enforce a 3 MB stream cap.

---

## 2. Test Design Methodologies

The test harness synthesizes four established software quality engineering methodologies:

### 2.1 Category-Partition Methodology
Each feature's input space and execution environment are decomposed into orthogonal categories and partitions:

| Feature / Dimension | Category | Partitions |
|---|---|---|
| **Ticker Input** | Syntax & Structure | Standard uppercase (`AAPL`, `NVDA`), lowercase/mixed (`aapl`, `NvDa`), special dual-class (`BRK-B`), whitespace padded (` AAPL `), empty/whitespace (`""`, `"   "`), excessive length (`TOOLONGTICKER123`), non-existent (`ZZZZ99`) |
| **Market Quote** | Pricing & Series | Regular market hours, off-hours, missing `meta.previousClose` (1y range quirk), sparkline series (>100 daily points), 52-week low/high bounds |
| **CIK Resolution** | Ticker Mapping | Known mega-caps, known growth tech, hyphenated symbols, 10-digit zero padding, memory cache hit vs miss |
| **SEC Submissions** | Form Selection | Annual 10-K, quarterly 10-Q, material 8-K (<60 days), stale 8-K (>60 days), foreign issuers (20-F, 6-K) |
| **Section Extraction** | Heading Semantics | True narrative headings, Table of Contents (TOC) clusters, in-text cross-references, HTML entity variations, missing headings |
| **Budget Limiting** | Character Volume | Sub-budget (<60k chars), exact budget (=60k chars), oversized (>60k chars), empty sections |

### 2.2 Boundary Value Analysis (BVA)
BVA targets transition boundaries where off-by-one errors and truncation regressions occur:
- **Character Budget Caps:**
  - $C = 59,999$ characters (unchanged pass-through)
  - $C = 60,000$ characters (exact ceiling pass-through)
  - $C = 60,001$ characters (trigger progressive reduction)
  - $C = 150,000$ characters (severe stress: cut down to $\le 60,000$)
- **8-K Date Cutoff Threshold:**
  - $T - 59\text{ days}$ (included in active brief)
  - $T - 60\text{ days}$ (boundary condition, included)
  - $T - 61\text{ days}$ (excluded as stale event)
- **Primary Document Download Cap:**
  - $S < 3\text{ MB}$ (full download parsed)
  - $S \ge 3\text{ MB}$ (stream capped at 3,145,728 bytes)
- **Sparkline Continuity:**
  - Daily points length $N \ge 100$

### 2.3 Pairwise Combinatorial Testing
Pairwise combinations test cross-feature interactions and concurrent operations:
- **Concurrent Fan-Out:** Yahoo Finance quote fetch + SEC filing retrieval executed via `Promise.allSettled`.
- **Batch Multi-Ticker Concurrency:** Parallel execution across multiple distinct tickers verifying in-memory cache thread safety and rate-limit friendliness.
- **Heterogeneous Batch Isolation:** Simultaneous processing of valid (`AAPL`) and invalid (`ZZZZ99`) tickers verifying that errors do not cascade or pollute successful results.
- **Combined Section Permutations:** Filings with missing 10-K Items, irregular 10-Q headings, and multiple 8-Ks combined with budget capping.

### 2.4 Real-World Workload Testing
Simulates end-to-end advisor workflow for production benchmark equities:
- **Apple Inc. (`AAPL`):** Mega-cap hardware/services filer with multi-megabyte 10-K, high volume, and tight trading range.
- **NVIDIA Corp. (`NVDA`):** Mega-cap semiconductor filer with rapid revenue growth narrative, recent 8-K material disclosures, and volatility.

---

## 3. 4-Tier Test Architecture

The test suite is structured into four distinct, progressive tiers:

```
tests/e2e/
├── types.ts                     # Test framework types, assertions, and reporter contracts
├── tier1-features.test.ts       # Tier 1: Core Feature Verification (>= 5 cases per feature)
├── tier2-boundary.test.ts       # Tier 2: Boundary & Corner Cases (BVA, failover, cutoffs)
├── tier3-combinations.test.ts   # Tier 3: Pairwise & Concurrent Combinations
├── tier4-application.test.ts    # Tier 4: Real-World Scenarios (End-to-End AAPL & NVDA)
└── runner.ts                    # Standalone executable test runner and structured reporter
```

### Tier 1: Core Feature Verification (`tier1-features.test.ts`)
Validates each individual feature from the `PROJECT.md` Feature Inventory with at least 5 dedicated test cases:
1. **Quote Ingestion (5 tests):**
   - Live quote retrieval for benchmark asset (`AAPL`)
   - Complete quote field populating (price, volume, day range, 52-wk range, timestamp)
   - Sparkline series extraction and integrity (>100 points, positive values)
   - Mathematical consistency ($dayLow \le price \le dayHigh$, $52Low \le price \le 52High$)
   - Previous close derivation fallback (recovering previousClose from sparkline when 1y meta is null)
2. **CIK Resolution & Caching (5 tests):**
   - Primary CIK resolution for `AAPL` (`0000320193`, title `Apple Inc.`)
   - Primary CIK resolution for `NVDA` (`0001045810`, title `NVIDIA CORP`)
   - Case-insensitivity normalization (`aapl`, `NvDa`)
   - In-memory cache hit performance and identity preservation
   - 10-digit zero padding format validation
3. **SEC Submissions Querying (5 tests):**
   - Submissions parsing for `AAPL` (identifies 10-K and 10-Q)
   - Form selection policy (<= 3 documents ceiling)
   - Accession number parsing and un-dashing
   - Document URL construction on `www.sec.gov/Archives` with unpadded CIK
   - 8-K material event detection within coverage window
4. **Section Extraction & Slicing (5 tests):**
   - Cheerio HTML parsing with tag stripping and entity normalization
   - TOC disambiguation heuristic (rejecting TOC item mentions)
   - In-text cross-reference rejection ("refer to Item 1A")
   - True 10-K narrative item slicing (Items 1, 1A, 7)
   - Head-tail fallback sampling when headings drift
5. **Character Budget Capping (5 tests):**
   - Sub-budget context preservation (<60,000 chars unaltered)
   - Hard cap enforcement on oversized content (total $\le 60,000$ chars)
   - Proportional multi-section trimming (preserves narrative balance)
   - Individual section ceiling enforcement (10-K Item 1 $\le 12$k, Item 1A $\le 12$k, Item 7 $\le 15$k, 8-K $\le 6$k)
   - Full context assembly formatting (`assembleContext` header and separators)

### Tier 2: Boundary & Corner Cases (`tier2-boundary.test.ts`)
Probes extremes, edge conditions, and error recovery:
1. **Invalid Ticker Handling:** Negative test with `ZZZZ99` (returns clean structured error, zero uncaught exceptions).
2. **Malformed Inputs:** Empty strings (`""`), whitespace-only (`"   "`), overlong symbols.
3. **Dual-Class & Hyphenated Symbols:** Normalization and handling of dual-class tickers (`BRK-B`).
4. **8-K 60-Day Cutoff Threshold:** Exact boundary verification on 59-day vs 61-day filing dates.
5. **Exact Character Budget Boundaries:** Slicing at 59,999, 60,000, and 60,001 characters.
6. **Yahoo Finance Mirror Failover:** Resiliency when primary host is unavailable and query2 mirror is queried.
7. **Document Download 3 MB Stream Ceiling:** Verification that documents larger than 3 MB are truncated to exactly 3 MB.

### Tier 3: Pairwise Combinations & Concurrency (`tier3-combinations.test.ts`)
Evaluates multi-threaded asynchronous interactions and permutations:
1. **Concurrent Quote & SEC Fan-Out:** Single-ticker parallel retrieval matching `app/api/brief` flow.
2. **Multi-Ticker Parallel Load:** Concurrently processing `AAPL`, `NVDA`, and `MSFT` to test rate limit adherence and cache safety.
3. **Heterogeneous Batch Isolation:** Concurrently processing valid and invalid tickers (`AAPL` and `ZZZZ99`) without cross-contamination.
4. **Combinatorial HTML Parsing Quirks:** Synthetic filings combining uppercase headings, encoded non-breaking spaces, missing sections, and TOC tables.
5. **End-to-End Stress Assembly:** Multi-filing package assembly with maximum character pressure.

### Tier 4: Real-World Scenarios (`tier4-application.test.ts`)
Simulates the complete financial brief synthesis workload:
1. **Real-World Scenario: Apple Inc. (`AAPL`):**
   - Full pipeline execution: CIK $\rightarrow$ Submissions $\rightarrow$ Download $\rightarrow$ Slicing $\rightarrow$ Quote $\rightarrow$ Assembly
   - Verification of non-empty Business (Item 1), Risk Factors (Item 1A), and MD&A sections
   - Context budget $\le 60,000$ characters
2. **Real-World Scenario: NVIDIA Corp. (`NVDA`):**
   - Full pipeline execution including recent 8-K integration
   - Verification of substantive narrative context for semiconductor analysis
   - Context budget $\le 60,000$ characters
3. **Data Integrity & Financial Sanity:**
   - Quote price consistency against 52-week extremes
   - Filing chronological ordering verification
   - Compliance with SEC user-agent policies
4. **Graceful Pipeline Degradation:**
   - Isolated partial failure resilience (quote success when filings missing, or filings success when quote unavailable).

---

## 4. Test Runner & Reporting Specification

The test runner `tests/e2e/runner.ts` is a zero-dependency, standalone TypeScript harness:
- **Execution:** `npx tsx tests/e2e/runner.ts`
- **Output:** Structured terminal output detailing every tier, test case, assertion, duration, and pass/fail summary.
- **Exit Code:**
  - `0`: All tests passed.
  - `1`: One or more tests failed.
- **Machine-Readable Summary:** Outputs total test count, passed count, failed count, and execution time in seconds.

---

## 5. Maintenance & Quality Control Checklist

- [x] Zero external test dependencies required (runs natively with `tsx`).
- [x] Tests adhere strictly to interface contracts in `PROJECT.md` and `types/`.
- [x] Opaque-box testing: tests invoke public APIs without mocking internal implementation details unless simulating network edge conditions.
- [x] Compliant User-Agent headers used on all network probes.
- [x] Verified clean execution on macOS / Node 24.
