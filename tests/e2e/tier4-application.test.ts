/**
 * Tier 4: Real-World Application Workloads
 * 
 * Verifies complete, end-to-end data brief assembly for benchmark equities:
 * - Apple Inc. (AAPL) full data brief pipeline
 * - NVIDIA Corp. (NVDA) full data brief pipeline
 * - Financial sanity & range realism cross-checks
 * - SEC regulatory chronology and docUrl auditability
 * - Graceful degradation under partial component failures
 */

import { getMarketQuote } from '../../lib/quote';
import { getSecFilings } from '../../lib/sec';
import {
  assert,
  assertEquals,
  assertFalse,
  assertGreaterThan,
  assertGreaterThanOrEqual,
  assertIncludes,
  assertLessThanOrEqual,
  assertTrue,
  runTestCase,
  TierResult,
} from './types';

export async function runTier4Tests(): Promise<TierResult> {
  const start = Date.now();
  const tests = [];

  // =========================================================================
  // Scenario 1: Complete Data Brief Assembly for Apple Inc. (AAPL)
  // =========================================================================

  tests.push(
    await runTestCase('T4.1.1', 'AAPL Application Scenario: Complete live data brief assembly', async () => {
      const [quoteRes, secRes] = await Promise.all([
        getMarketQuote('AAPL'),
        getSecFilings('AAPL'),
      ]);

      assertTrue(quoteRes.success, 'AAPL quote must succeed');
      assertTrue(secRes.success, 'AAPL SEC filings must succeed');

      if (!quoteRes.success || !secRes.success) return;

      const quote = quoteRes.data;
      const sec = secRes.data;

      // 1. Verify Quote Integrity
      assertEquals(quote.symbol, 'AAPL', 'Symbol must be AAPL');
      assertGreaterThan(quote.price, 0, 'Price must be positive');
      assertGreaterThan(quote.volume, 0, 'Volume must be positive');
      assertGreaterThanOrEqual(quote.sparkline.points.length, 100, 'Must have >= 100 sparkline points');

      // 2. Verify SEC CIK & Metadata
      assertEquals(sec.cik, '0000320193', 'CIK must match Apple 0000320193');
      assertEquals(sec.unpaddedCik, '320193', 'Unpadded CIK must match 320193');
      assertIncludes(sec.companyName.toLowerCase(), 'apple', 'Company name must contain Apple');

      // 3. Verify Key Sections (Business, Risks, MD&A)
      const businessSec = sec.sections.find(
        (s) => s.name.toLowerCase().includes('business') || s.name.includes('Item 1.')
      );
      const riskSec = sec.sections.find(
        (s) => s.name.toLowerCase().includes('risk') || s.name.includes('Item 1A')
      );
      const mdaSec = sec.sections.find(
        (s) => s.name.toLowerCase().includes('md&a') || s.name.includes('Item 7') || s.name.includes('Item 2')
      );

      assertTrue(businessSec !== undefined && businessSec.charCount > 100, 'Business section must be present and substantive');
      assertTrue(riskSec !== undefined && riskSec.charCount > 100, 'Risk section must be present and substantive');
      assertTrue(mdaSec !== undefined && mdaSec.charCount > 100, 'MD&A section must be present and substantive');

      // 4. Verify Hard Budget Cap
      assertLessThanOrEqual(sec.totalChars, 60000, 'Total context characters must be <= 60,000');
      assertLessThanOrEqual(sec.assembledContext.length, 65000, 'Assembled context must be <= 65,000 chars');

      return `AAPL Brief Ready: Price=$${quote.price.toFixed(2)}, ${sec.sections.length} sections, TotalContext=${sec.totalChars} chars`;
    })
  );

  // =========================================================================
  // Scenario 2: Complete Data Brief Assembly for NVIDIA Corp. (NVDA)
  // =========================================================================

  tests.push(
    await runTestCase('T4.1.2', 'NVDA Application Scenario: Complete live data brief assembly', async () => {
      const [quoteRes, secRes] = await Promise.all([
        getMarketQuote('NVDA'),
        getSecFilings('NVDA'),
      ]);

      assertTrue(quoteRes.success, 'NVDA quote must succeed');
      assertTrue(secRes.success, 'NVDA SEC filings must succeed');

      if (!quoteRes.success || !secRes.success) return;

      const quote = quoteRes.data;
      const sec = secRes.data;

      // 1. Verify Quote Integrity
      assertEquals(quote.symbol, 'NVDA', 'Symbol must be NVDA');
      assertGreaterThan(quote.price, 0, 'Price must be positive');
      assertGreaterThan(quote.volume, 0, 'Volume must be positive');
      assertGreaterThanOrEqual(quote.sparkline.points.length, 100, 'Must have >= 100 sparkline points');

      // 2. Verify SEC CIK & Metadata
      assertEquals(sec.cik, '0001045810', 'CIK must match NVDA 0001045810');
      assertEquals(sec.unpaddedCik, '1045810', 'Unpadded CIK must match 1045810');
      assertIncludes(sec.companyName.toLowerCase(), 'nvidia', 'Company name must contain NVIDIA');

      // 3. Verify Key Sections
      const businessSec = sec.sections.find(
        (s) => s.name.toLowerCase().includes('business') || s.name.includes('Item 1.')
      );
      const riskSec = sec.sections.find(
        (s) => s.name.toLowerCase().includes('risk') || s.name.includes('Item 1A')
      );
      const mdaSec = sec.sections.find(
        (s) => s.name.toLowerCase().includes('md&a') || s.name.includes('Item 7') || s.name.includes('Item 2')
      );

      assertTrue(businessSec !== undefined && businessSec.charCount > 100, 'Business section must be present and substantive');
      assertTrue(riskSec !== undefined && riskSec.charCount > 100, 'Risk factors section must be present and substantive');
      assertTrue(mdaSec !== undefined && mdaSec.charCount > 100, 'MD&A section must be present and substantive');

      // 4. Verify Context Cap
      assertLessThanOrEqual(sec.totalChars, 60000, 'Total context characters must be <= 60,000');

      return `NVDA Brief Ready: Price=$${quote.price.toFixed(2)}, ${sec.sections.length} sections, TotalContext=${sec.totalChars} chars`;
    })
  );

  // =========================================================================
  // Scenario 3: Financial Sanity & Cross-Validation
  // =========================================================================

  tests.push(
    await runTestCase('T4.2.1', 'Financial Sanity: Quote metrics bounds and mathematical realism', async () => {
      const res = await getMarketQuote('AAPL');
      assertTrue(res.success, 'Quote fetch must succeed');
      if (!res.success) return;

      const q = res.data;
      // Day range must be within 52w range (with sensible tolerance for new intraday highs/lows)
      assertGreaterThanOrEqual(q.dayRange.high, q.fiftyTwoWeek.low * 0.9, 'Day high must be reasonable vs 52w low');
      assertLessThanOrEqual(q.dayRange.low, q.fiftyTwoWeek.high * 1.1, 'Day low must be reasonable vs 52w high');
      assertGreaterThan(q.volume, 10000, 'AAPL trading volume must be substantial (>10,000)');

      return `Price: $${q.price.toFixed(2)}, Day: $${q.dayRange.low.toFixed(2)}-$${q.dayRange.high.toFixed(2)}, Volume: ${q.volume.toLocaleString()}`;
    })
  );

  // =========================================================================
  // Scenario 4: SEC Regulatory Chronology & URL Accessibility
  // =========================================================================

  tests.push(
    await runTestCase('T4.2.2', 'Regulatory Auditability: SEC filing URLs and accessions conform to EDGAR spec', async () => {
      const secRes = await getSecFilings('AAPL');
      assertTrue(secRes.success, 'SEC filings must succeed');
      if (!secRes.success) return;

      for (const f of secRes.data.filings) {
        // Accession number format: 10 digits - 2 digits - 6 digits
        assertTrue(/^\d{10}-\d{2}-\d{6}$/.test(f.accessionNumber), `Accession number ${f.accessionNumber} must conform to SEC format`);
        // DocUrl must point to sec.gov Archives with unpadded CIK
        assertTrue(f.docUrl.startsWith('https://www.sec.gov/Archives/edgar/data/320193/'), `Doc URL ${f.docUrl} must be auditable sec.gov archive link`);
      }

      return `Verified ${secRes.data.filings.length} filings comply with EDGAR compliance and audit requirements`;
    })
  );

  // =========================================================================
  // Scenario 5: Graceful Pipeline Degradation Under Partial Availability
  // =========================================================================

  tests.push(
    await runTestCase('T4.3.1', 'Graceful Degradation: Independent failure isolation in advisory pipeline', async () => {
      // Simulate advisor entering unknown ticker in UI: pipeline should isolate failure
      const quotePromise = getMarketQuote('ZZZZ99');
      const secPromise = getSecFilings('ZZZZ99');

      const [quoteRes, secRes] = await Promise.all([quotePromise, secPromise]);

      assertFalse(quoteRes.success, 'Quote should fail cleanly');
      assertFalse(secRes.success, 'SEC should fail cleanly');

      // Both should return structured error strings rather than throwing
      if (!quoteRes.success) {
        assertTrue(typeof quoteRes.error === 'string' && quoteRes.error.length > 0, 'Quote error message provided');
      }
      if (!secRes.success) {
        assertTrue(typeof secRes.error === 'string' && secRes.error.length > 0, 'SEC error message provided');
      }

      return 'Pipeline handled simultaneous non-existent ticker gracefully';
    })
  );

  const durationMs = Date.now() - start;
  const passed = tests.filter((t) => t.passed).length;
  const failed = tests.filter((t) => !t.passed).length;

  return {
    tier: 4,
    title: 'Tier 4: Real-World Application Scenarios',
    tests,
    durationMs,
    passed,
    failed,
  };
}
