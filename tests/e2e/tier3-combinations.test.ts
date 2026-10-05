/**
 * Tier 3: Pairwise Combinations & Concurrency
 * 
 * Verifies cross-feature interactions, asynchronous concurrency, and stress combinations:
 * - Concurrent Quote + SEC retrieval fan-out (matching app/api/brief)
 * - Multi-ticker parallel batch load
 * - Heterogeneous batch isolation (valid + invalid tickers concurrently)
 * - Combinatorial HTML formatting stress (TOC + xref + entities + fallback)
 * - High-pressure multi-section budget capping and assembly
 */

import { getMarketQuote } from '../../lib/quote';
import {
  resolveCik,
  getSecFilings,
  htmlToText,
  extractSectionsFromFiling,
  enforceContextBudget,
  assembleContext,
} from '../../lib/sec';
import { ExtractedSection, FilingMetadata } from '../../types/sec';
import {
  assert,
  assertEquals,
  assertDefined,
  assertFalse,
  assertGreaterThan,
  assertGreaterThanOrEqual,
  assertIncludes,
  assertLessThanOrEqual,
  assertTrue,
  runTestCase,
  TierResult,
} from './types';

export async function runTier3Tests(): Promise<TierResult> {
  const start = Date.now();
  const tests = [];

  // =========================================================================
  // Combination 1: Concurrent Quote + SEC Fan-Out (Matching Route Handler)
  // =========================================================================

  tests.push(
    await runTestCase('T3.1.1', 'Concurrent Fan-Out: Parallel Quote + SEC retrieval for AAPL', async () => {
      const t0 = Date.now();
      const [quoteRes, secRes] = await Promise.all([
        getMarketQuote('AAPL'),
        getSecFilings('AAPL'),
      ]);
      const duration = Date.now() - t0;

      assertTrue(quoteRes.success, 'Quote retrieval must succeed');
      assertTrue(secRes.success, 'SEC retrieval must succeed');

      if (!quoteRes.success || !secRes.success) return;

      assertGreaterThan(quoteRes.data.price, 0, 'Quote price must be > 0');
      assertEquals(secRes.data.ticker, 'AAPL', 'SEC ticker must match AAPL');
      assertGreaterThan(secRes.data.sections.length, 0, 'SEC sections must be non-empty');

      return `Fan-out completed in ${duration}ms (Quote: $${quoteRes.data.price.toFixed(2)}, SEC: ${secRes.data.sections.length} sections)`;
    })
  );

  tests.push(
    await runTestCase('T3.1.2', 'Concurrent Fan-Out: Parallel Quote + SEC retrieval for NVDA', async () => {
      const t0 = Date.now();
      const [quoteRes, secRes] = await Promise.all([
        getMarketQuote('NVDA'),
        getSecFilings('NVDA'),
      ]);
      const duration = Date.now() - t0;

      assertTrue(quoteRes.success, 'Quote retrieval must succeed');
      assertTrue(secRes.success, 'SEC retrieval must succeed');

      if (!quoteRes.success || !secRes.success) return;

      assertGreaterThan(quoteRes.data.price, 0, 'NVDA price must be > 0');
      assertEquals(secRes.data.ticker, 'NVDA', 'SEC ticker must match NVDA');

      return `Fan-out completed in ${duration}ms (Quote: $${quoteRes.data.price.toFixed(2)}, SEC: ${secRes.data.sections.length} sections)`;
    })
  );

  // =========================================================================
  // Combination 2: Multi-Ticker Concurrency Stress
  // =========================================================================

  tests.push(
    await runTestCase('T3.2.1', 'Multi-Ticker Stress: Concurrent quote retrieval for AAPL, NVDA, and KO', async () => {
      const tickers = ['AAPL', 'NVDA', 'KO'];
      const t0 = Date.now();
      const results = await Promise.all(tickers.map((t) => getMarketQuote(t)));
      const duration = Date.now() - t0;

      for (let i = 0; i < tickers.length; i++) {
        const res = results[i];
        assertTrue(res.success, `Quote for ${tickers[i]} must succeed`);
        if (res.success) {
          assertGreaterThan(res.data.price, 0, `${tickers[i]} price must be > 0`);
        }
      }

      return `3 concurrent quotes retrieved in ${duration}ms without rate-limiting`;
    })
  );

  tests.push(
    await runTestCase('T3.2.2', 'Multi-Ticker Stress: Concurrent CIK resolution across 5 tickers', async () => {
      const tickers = ['AAPL', 'NVDA', 'MSFT', 'KO', 'JPM'];
      const results = await Promise.all(tickers.map((t) => resolveCik(t)));

      for (let i = 0; i < tickers.length; i++) {
        const cikInfo = results[i];
        assertTrue(cikInfo !== null, `CIK for ${tickers[i]} must be found`);
        if (cikInfo) {
          assertEquals(cikInfo.cik.length, 10, `${tickers[i]} CIK must be 10 digits`);
        }
      }

      return `5 CIKs resolved concurrently: ${results.map((r) => r?.cik).join(', ')}`;
    })
  );

  // =========================================================================
  // Combination 3: Heterogeneous Batch Isolation (Valid + Invalid Concurrency)
  // =========================================================================

  tests.push(
    await runTestCase('T3.3.1', 'Heterogeneous Isolation: Concurrent quote fetch for AAPL (valid) and ZZZZ99 (invalid)', async () => {
      const [validRes, invalidRes] = await Promise.all([
        getMarketQuote('AAPL'),
        getMarketQuote('ZZZZ99'),
      ]);

      assertTrue(validRes.success, 'Valid ticker AAPL must succeed');
      assertFalse(invalidRes.success, 'Invalid ticker ZZZZ99 must fail');

      if (validRes.success) {
        assertGreaterThan(validRes.data.price, 0, 'AAPL price must be valid');
      }
      if (!invalidRes.success) {
        assertTrue(invalidRes.error.length > 0, 'ZZZZ99 error must be present');
      }

      return 'Valid quote succeeded; invalid quote failed cleanly without cross-contamination';
    })
  );

  tests.push(
    await runTestCase('T3.3.2', 'Heterogeneous Isolation: Concurrent SEC fetch for AAPL (valid) and ZZZZ99 (invalid)', async () => {
      const [validRes, invalidRes] = await Promise.all([
        getSecFilings('AAPL'),
        getSecFilings('ZZZZ99'),
      ]);

      assertTrue(validRes.success, 'Valid ticker AAPL must succeed');
      assertFalse(invalidRes.success, 'Invalid ticker ZZZZ99 must fail');

      if (validRes.success) {
        assertEquals(validRes.data.ticker, 'AAPL', 'Ticker must be AAPL');
      }
      if (!invalidRes.success) {
        assertIncludes(invalidRes.error, 'ZZZZ99', 'Error must name ZZZZ99');
      }

      return 'Valid SEC pipeline succeeded; invalid pipeline failed cleanly';
    })
  );

  // =========================================================================
  // Combination 4: Combinatorial Document Formatting Stress
  // =========================================================================

  tests.push(
    await runTestCase('T3.4.1', 'Combinatorial Slicing: HTML with entities + TOC + cross-refs + whitespace', async () => {
      const complexHtml = `
        <!DOCTYPE html>
        <html>
        <head><title>Form 10-K</title></head>
        <body>
          <!-- Clustered TOC -->
          <div style="font-weight: bold;">INDEX TO FINANCIAL STATEMENTS</div>
          <table border="0">
            <tr><td>Item 1. Business</td><td>12</td></tr>
            <tr><td>Item 1A. Risk Factors</td><td>18</td></tr>
            <tr><td>Item 7. MD&amp;A</td><td>35</td></tr>
          </table>

          <!-- Cross references in preliminary section -->
          <p>
            Please see also Item&#160;1A regarding our risk exposures.
            Further, refer to Item 7 for full financial discussion.
          </p>

          <!-- Narrative Section Item 1 -->
          <h2>Item 1. Business</h2>
          <p>
            The company&rsquo;s core revenue engine combines proprietary enterprise hardware, operating software&#160;&amp;&#160;cloud services.
            Total customer accounts expanded significantly across all global regions during the most recent fiscal period.
            We continue to invest heavily in research and development to maintain our product leadership and expand our digital ecosystem.
          </p>

          <!-- Narrative Section Item 1A -->
          <h2>Item 1A. Risk Factors</h2>
          <p>
            Supply chain constraints and export controls present material operational risks across our overseas distribution networks.
            Our operations depend on sole-source component suppliers, and any prolonged interruption could materially harm our business.
            We are also subject to stringent cybersecurity standards and data protection regulatory frameworks worldwide.
          </p>

          <!-- Narrative Section Item 7 -->
          <h2>Item 7. Management&rsquo;s Discussion and Analysis</h2>
          <p>
            Operating margins improved by 240 basis points year over year driven by higher subscription revenues and operational leverage.
            Cash flows from operating activities reached record levels, supporting continued capital expenditures and return of capital.
            Management anticipates continued demand strength in our core enterprise solutions segment.
          </p>

          <h2>Item 8. Financial Statements</h2>
          <p>Consolidated balance sheets...</p>
        </body>
        </html>
      `;

      const cleanText = htmlToText(complexHtml);
      const meta: FilingMetadata = {
        form: '10-K',
        filingDate: '2026-03-01',
        accessionNumber: '0000000000-26-000001',
        accessionNoDashes: '000000000026000001',
        primaryDocument: 'test10k.htm',
        docUrl: 'https://www.sec.gov/Archives/test.htm',
      };

      const sections = extractSectionsFromFiling(cleanText, meta);
      assertEquals(sections.length, 3, 'Must extract all 3 sections despite TOC and cross references');

      const item1 = sections.find((s) => s.name === 'Item 1. Business');
      const item1A = sections.find((s) => s.name === 'Item 1A. Risk Factors');
      const item7 = sections.find((s) => s.name === 'Item 7. MD&A');

      assertDefined(item1, 'Must find Item 1');
      assertDefined(item1A, 'Must find Item 1A');
      assertDefined(item7, 'Must find Item 7');

      assertIncludes(item1.content, 'core revenue engine', 'Item 1 extracted substantive body');
      assertIncludes(item1A.content, 'Supply chain constraints', 'Item 1A extracted substantive body');
      assertIncludes(item7.content, 'Operating margins improved', 'Item 7 extracted substantive body');

      return 'Successfully navigated TOC, cross-references, and entity encodings';
    })
  );

  // =========================================================================
  // Combination 5: High-Pressure Multi-Section Budget Capping and Assembly
  // =========================================================================

  tests.push(
    await runTestCase('T3.5.1', 'Stress Assembly: 5 large sections totaling 150,000 chars capped and assembled', async () => {
      const oversizedSections: ExtractedSection[] = [
        {
          name: 'Item 1. Business',
          form: '10-K',
          filingDate: '2026-01-01',
          accessionNumber: 'acc-1',
          docUrl: 'url-1',
          content: 'B'.repeat(35000),
          charCount: 35000,
        },
        {
          name: 'Item 1A. Risk Factors',
          form: '10-K',
          filingDate: '2026-01-01',
          accessionNumber: 'acc-1',
          docUrl: 'url-1',
          content: 'R'.repeat(35000),
          charCount: 35000,
        },
        {
          name: 'Item 7. MD&A',
          form: '10-K',
          filingDate: '2026-01-01',
          accessionNumber: 'acc-1',
          docUrl: 'url-1',
          content: 'M'.repeat(35000),
          charCount: 35000,
        },
        {
          name: 'Item 2. MD&A (Quarterly)',
          form: '10-Q',
          filingDate: '2026-02-01',
          accessionNumber: 'acc-2',
          docUrl: 'url-2',
          content: 'Q'.repeat(30000),
          charCount: 30000,
        },
        {
          name: '8-K Event',
          form: '8-K',
          filingDate: '2026-02-15',
          accessionNumber: 'acc-3',
          docUrl: 'url-3',
          content: 'E'.repeat(15000),
          charCount: 15000,
        },
      ];

      // Total input = 150,000 characters
      const budgeted = enforceContextBudget(oversizedSections, 60000);
      const totalBudgeted = budgeted.reduce((sum, s) => sum + s.charCount, 0);
      assertLessThanOrEqual(totalBudgeted, 60000, 'Total characters must be strictly <= 60,000');
      assertGreaterThan(totalBudgeted, 58000, 'Must utilize budget efficiently');

      const assembled = assembleContext('NVDA', 'NVIDIA CORP', budgeted);
      assertIncludes(assembled, 'TICKER: NVDA', 'Must include ticker');
      assertIncludes(assembled, 'COMPANY: NVIDIA CORP', 'Must include company');
      assertEquals(budgeted.length, 5, 'All 5 sections must remain represented');

      for (const s of budgeted) {
        assertGreaterThan(s.charCount, 1000, `Section ${s.name} must retain non-trivial content`);
      }

      return `150,000 chars compressed to ${totalBudgeted} chars while preserving all 5 sections`;
    })
  );

  const durationMs = Date.now() - start;
  const passed = tests.filter((t) => t.passed).length;
  const failed = tests.filter((t) => !t.passed).length;

  return {
    tier: 3,
    title: 'Tier 3: Pairwise Combinations & Concurrency',
    tests,
    durationMs,
    passed,
    failed,
  };
}
