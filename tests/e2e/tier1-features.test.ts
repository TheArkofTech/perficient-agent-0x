/**
 * Tier 1: Core Feature Verification
 * 
 * Verifies core functionality for the 5 key features in PROJECT.md Feature Inventory:
 * 1. Market Quote Ingestion Engine (lib/quote.ts)
 * 2. SEC CIK Resolution & Cache (lib/sec.ts)
 * 3. SEC Submissions Querying (lib/sec.ts)
 * 4. SEC Section Slicing Engine (lib/sec.ts)
 * 5. SEC Character Budget Limiting (lib/sec.ts)
 * 
 * Target: >= 5 test cases per feature (25 tests total).
 */

import { getMarketQuote } from '../../lib/quote';
import {
  resolveCik,
  getRecentFilingsMetadata,
  htmlToText,
  findSectionSlice,
  extractSectionsFromFiling,
  createHeadTailFallback,
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

export async function runTier1Tests(): Promise<TierResult> {
  const start = Date.now();
  const tests = [];

  // =========================================================================
  // Feature 1: Market Quote Ingestion Engine (lib/quote.ts)
  // =========================================================================

  tests.push(
    await runTestCase('T1.1.1', 'Quote Ingestion: Live AAPL quote retrieval and success status', async () => {
      const res = await getMarketQuote('AAPL');
      assertTrue(res.success, `Expected quote fetch to succeed: ${res.success ? '' : res.error}`);
      if (!res.success) return;
      assertGreaterThan(res.data.price, 0, 'Price must be positive');
      assertEquals(res.data.symbol, 'AAPL', 'Symbol must match AAPL');
      return `Price: $${res.data.price.toFixed(2)}, Exchange: ${res.data.exchange}`;
    })
  );

  tests.push(
    await runTestCase('T1.1.2', 'Quote Ingestion: Complete quote fields populating and structure', async () => {
      const res = await getMarketQuote('AAPL');
      assertTrue(res.success, 'Quote fetch should succeed');
      if (!res.success) return;
      const data = res.data;
      assertDefined(data.dayRange, 'dayRange must be defined');
      assertDefined(data.fiftyTwoWeek, 'fiftyTwoWeek must be defined');
      assertGreaterThan(data.volume, 0, 'Volume must be positive');
      assertGreaterThan(data.timestamp, 1700000000, 'Timestamp must be a modern epoch');
      assertTrue(!isNaN(Date.parse(data.marketTime)), 'marketTime must be valid ISO date string');
      assertTrue(typeof data.exchange === 'string' && data.exchange.length > 0, 'exchange must be non-empty');
      return `Volume: ${data.volume}, MarketTime: ${data.marketTime}`;
    })
  );

  tests.push(
    await runTestCase('T1.1.3', 'Quote Ingestion: 1-year sparkline series continuity and data integrity', async () => {
      const res = await getMarketQuote('AAPL');
      assertTrue(res.success, 'Quote fetch should succeed');
      if (!res.success) return;
      const spark = res.data.sparkline;
      assertDefined(spark, 'Sparkline data must be present');
      assertGreaterThanOrEqual(spark.points.length, 100, 'Must have at least 100 daily points for 1y series');
      assertEquals(spark.points.length, spark.close.length, 'Points and closes lengths must match');
      assertEquals(spark.points.length, spark.t.length, 'Points and timestamps lengths must match');
      // Validate first and last point
      assertGreaterThan(spark.points[0].close, 0, 'First sparkline close must be positive');
      assertGreaterThan(spark.points[spark.points.length - 1].close, 0, 'Last sparkline close must be positive');
      return `Total points: ${spark.points.length}`;
    })
  );

  tests.push(
    await runTestCase('T1.1.4', 'Quote Ingestion: Mathematical consistency of pricing and ranges', async () => {
      const res = await getMarketQuote('AAPL');
      assertTrue(res.success, 'Quote fetch should succeed');
      if (!res.success) return;
      const data = res.data;
      assertLessThanOrEqual(data.dayRange.low, data.dayRange.high, 'dayRange.low must be <= dayRange.high');
      assertLessThanOrEqual(data.fiftyTwoWeek.low, data.fiftyTwoWeek.high, 'fiftyTwoWeek.low must be <= fiftyTwoWeek.high');
      // Price should roughly sit within or adjacent to 52w range (with small threshold for intra-day breaks)
      assertGreaterThanOrEqual(data.price, data.fiftyTwoWeek.low * 0.9, 'Price should not be drastically below 52w low');
      assertLessThanOrEqual(data.price, data.fiftyTwoWeek.high * 1.1, 'Price should not be drastically above 52w high');
      return `Day: ${data.dayRange.low}-${data.dayRange.high}, 52W: ${data.fiftyTwoWeek.low}-${data.fiftyTwoWeek.high}`;
    })
  );

  tests.push(
    await runTestCase('T1.1.5', 'Quote Ingestion: Previous close derivation fallback from sparkline / changePct', async () => {
      const res = await getMarketQuote('AAPL');
      assertTrue(res.success, 'Quote fetch should succeed');
      if (!res.success) return;
      const data = res.data;
      assertGreaterThan(data.previousClose, 0, 'previousClose must be derived and positive');
      // Verify changePercent is mathematically aligned with price and previousClose: ((price - prevClose)/prevClose)*100
      const expectedChangePct = ((data.price - data.previousClose) / data.previousClose) * 100;
      const diff = Math.abs(expectedChangePct - data.changePercent);
      assertLessThanOrEqual(diff, 0.5, `changePercent ${data.changePercent}% must align with price & previousClose (${expectedChangePct.toFixed(3)}%)`);
      return `Derived prevClose: $${data.previousClose.toFixed(2)}, Change: ${data.changePercent}%`;
    })
  );

  // =========================================================================
  // Feature 2: SEC CIK Resolution & Cache (lib/sec.ts)
  // =========================================================================

  tests.push(
    await runTestCase('T1.2.1', 'CIK Resolution: Primary mega-cap resolution for AAPL', async () => {
      const cikInfo = await resolveCik('AAPL');
      assertDefined(cikInfo, 'AAPL must resolve');
      assertEquals(cikInfo.cik, '0000320193', 'AAPL zero-padded CIK must be 0000320193');
      assertEquals(cikInfo.unpaddedCik, '320193', 'AAPL unpadded CIK must be 320193');
      assertIncludes(cikInfo.title.toLowerCase(), 'apple', 'Title must contain Apple');
      return `Resolved: CIK ${cikInfo.cik} (${cikInfo.title})`;
    })
  );

  tests.push(
    await runTestCase('T1.2.2', 'CIK Resolution: Semiconductor benchmark resolution for NVDA', async () => {
      const cikInfo = await resolveCik('NVDA');
      assertDefined(cikInfo, 'NVDA must resolve');
      assertEquals(cikInfo.cik, '0001045810', 'NVDA zero-padded CIK must be 0001045810');
      assertEquals(cikInfo.unpaddedCik, '1045810', 'NVDA unpadded CIK must be 1045810');
      assertIncludes(cikInfo.title.toLowerCase(), 'nvidia', 'Title must contain NVIDIA');
      return `Resolved: CIK ${cikInfo.cik} (${cikInfo.title})`;
    })
  );

  tests.push(
    await runTestCase('T1.2.3', 'CIK Resolution: Case insensitivity normalization (aapl, NvDa)', async () => {
      const lower = await resolveCik('aapl');
      const mixed = await resolveCik('NvDa');
      assertDefined(lower, 'lowercase aapl must resolve');
      assertDefined(mixed, 'mixed case NvDa must resolve');
      assertEquals(lower.cik, '0000320193', 'lowercase aapl CIK matches');
      assertEquals(mixed.cik, '0001045810', 'mixed case NvDa CIK matches');
      return 'Successfully normalized lower & mixed-case input';
    })
  );

  tests.push(
    await runTestCase('T1.2.4', 'CIK Resolution: In-memory cache hit performance and identity preservation', async () => {
      const t0 = Date.now();
      const hit1 = await resolveCik('AAPL');
      const hit2 = await resolveCik('AAPL');
      const duration = Date.now() - t0;
      assertDefined(hit1, 'Cached entry 1 must exist');
      assertDefined(hit2, 'Cached entry 2 must exist');
      assertEquals(hit1.cik, hit2.cik, 'Cached CIK values must match');
      assertLessThanOrEqual(duration, 50, `Subsequent cache lookups must complete quickly (<50ms, took ${duration}ms)`);
      return `Memory cache hit completed in ${duration}ms`;
    })
  );

  tests.push(
    await runTestCase('T1.2.5', 'CIK Resolution: Strict 10-digit zero-padded format invariant', async () => {
      const cikInfo = await resolveCik('AAPL');
      assertDefined(cikInfo, 'CIK must resolve');
      assertEquals(cikInfo.cik.length, 10, 'Padded CIK must be exactly 10 characters long');
      assertTrue(/^\d{10}$/.test(cikInfo.cik), 'Padded CIK must contain only numeric digits');
      assertEquals(cikInfo.cik, cikInfo.unpaddedCik.padStart(10, '0'), 'Padded CIK must equal unpadded padded with 0s');
      return `Verified 10-digit invariant: ${cikInfo.cik}`;
    })
  );

  // =========================================================================
  // Feature 3: SEC Submissions Querying (lib/sec.ts)
  // =========================================================================

  tests.push(
    await runTestCase('T1.3.1', 'Submissions Query: Discovers 10-K and 10-Q metadata for AAPL', async () => {
      const filings = await getRecentFilingsMetadata('0000320193', '320193');
      assertGreaterThanOrEqual(filings.length, 2, 'Must locate at least 2 filings for AAPL');
      const forms = filings.map((f) => f.form);
      assertTrue(forms.includes('10-K'), 'Filings must include 10-K');
      assertTrue(forms.includes('10-Q'), 'Filings must include 10-Q');
      return `Discovered forms: ${forms.join(', ')}`;
    })
  );

  tests.push(
    await runTestCase('T1.3.2', 'Submissions Query: Enforces <= 3 documents ceiling policy', async () => {
      const filings = await getRecentFilingsMetadata('0001045810', '1045810');
      assertLessThanOrEqual(filings.length, 3, 'Filings selected must never exceed 3 documents');
      assertGreaterThanOrEqual(filings.length, 1, 'Filings selected must contain at least 1 document');
      return `Selected ${filings.length} filings for NVDA (ceiling: 3)`;
    })
  );

  tests.push(
    await runTestCase('T1.3.3', 'Submissions Query: Accession number format and dash-stripping integrity', async () => {
      const filings = await getRecentFilingsMetadata('0000320193', '320193');
      const first = filings[0];
      assertDefined(first, 'At least one filing must exist');
      assertTrue(first.accessionNumber.includes('-'), 'accessionNumber must contain hyphens');
      assertFalse(first.accessionNoDashes.includes('-'), 'accessionNoDashes must NOT contain hyphens');
      assertEquals(
        first.accessionNoDashes,
        first.accessionNumber.replace(/-/g, ''),
        'accessionNoDashes must equal accessionNumber without dashes'
      );
      return `Accession: ${first.accessionNumber} -> ${first.accessionNoDashes}`;
    })
  );

  tests.push(
    await runTestCase('T1.3.4', 'Submissions Query: Primary document URL generation on www.sec.gov/Archives', async () => {
      const filings = await getRecentFilingsMetadata('0000320193', '320193');
      const first = filings[0];
      assertDefined(first, 'At least one filing must exist');
      assertTrue(first.docUrl.startsWith('https://www.sec.gov/Archives/edgar/data/320193/'), 'Must use www.sec.gov Archives with unpadded CIK');
      assertTrue(first.docUrl.includes(first.accessionNoDashes), 'docUrl must contain accessionNoDashes');
      assertTrue(first.docUrl.endsWith(first.primaryDocument), 'docUrl must end with primaryDocument name');
      return `Constructed URL: ${first.docUrl}`;
    })
  );

  tests.push(
    await runTestCase('T1.3.5', 'Submissions Query: Discovers recent filings with valid ISO filing dates', async () => {
      const filings = await getRecentFilingsMetadata('0000320193', '320193');
      for (const f of filings) {
        assertTrue(/^\d{4}-\d{2}-\d{2}$/.test(f.filingDate), `Filing date ${f.filingDate} must be in YYYY-MM-DD format`);
        const parsed = Date.parse(f.filingDate);
        assertTrue(!isNaN(parsed), `Date ${f.filingDate} must parse cleanly`);
      }
      return `Verified ${filings.length} filing date formats`;
    })
  );

  // =========================================================================
  // Feature 4: SEC Section Extraction & Slicing Engine (lib/sec.ts)
  // =========================================================================

  tests.push(
    await runTestCase('T1.4.1', 'Section Extraction: Cheerio HTML parsing, script stripping, and entity decoding', async () => {
      const dirtyHtml = `
        <html>
          <head><script>alert('test');</script><style>body { color: red; }</style></head>
          <body>
            <h1>Item 1. Business</h1>
            <p>Apple Inc.&rsquo;s operations include iPhone&#160;&amp;&#160;Services.</p>
          </body>
        </html>
      `;
      const text = htmlToText(dirtyHtml);
      assertFalse(text.includes('alert'), 'Must strip script tags');
      assertFalse(text.includes('color: red'), 'Must strip style tags');
      assertIncludes(text, "Apple Inc.'s", 'Must decode &rsquo; to apostrophe');
      assertIncludes(text, 'iPhone & Services', 'Must decode &#160; and &amp;');
      return `Parsed text: "${text}"`;
    })
  );

  tests.push(
    await runTestCase('T1.4.2', 'Section Extraction: TOC disambiguation heuristic rejects table of contents', async () => {
      const htmlWithTocAndBody = `
        <html><body>
          <!-- Table of contents cluster -->
          <div>TABLE OF CONTENTS</div>
          <div>Item 1. Business 15</div>
          <div>Item 1A. Risk Factors 22</div>
          <div>Item 7. Management Discussion 45</div>
          <p>Some intermediate content preceding the formal annual report disclosures...</p>
          <!-- Actual Narrative -->
          <h2>Item 1. Business</h2>
          <p>
            The company designs, manufactures, and markets smartphones, personal computers, tablets, wearables,
            and accessories, and sells a variety of related services. In addition, the company facilitates third-party
            digital content through its stores. The company distributes its products through retail channels, direct sales,
            and third-party cellular network carriers worldwide.
          </p>
          <h2>Item 1A. Risk Factors</h2>
          <p>
            Our business operations face global macroeconomic headwinds, intense technology competition,
            and supply chain disruptions in key semiconductor manufacturing facilities overseas.
          </p>
        </body></html>
      `;
      const text = htmlToText(htmlWithTocAndBody);
      const meta: FilingMetadata = {
        form: '10-K',
        filingDate: '2026-01-15',
        accessionNumber: '0000320193-26-000001',
        accessionNoDashes: '000032019326000001',
        primaryDocument: 'test.htm',
        docUrl: 'https://www.sec.gov/Archives/test.htm',
      };
      const sections = extractSectionsFromFiling(text, meta);
      const business = sections.find((s) => s.name === 'Item 1. Business');
      assertDefined(business, 'Must extract Item 1. Business');
      assertIncludes(business.content, 'The company designs, manufactures, and markets smartphones', 'Must extract body narrative, not TOC');
      return `Extracted substantive narrative: "${business.content.slice(0, 80)}..."`;
    })
  );

  tests.push(
    await runTestCase('T1.4.3', 'Section Extraction: Cross-reference filtering rejects "refer to Item 1A"', async () => {
      const textWithXref = `
        Overview of Company
        For more detailed information, please refer to Item 1A of this report regarding regulatory exposure.
        Further, see also Item 1 for business descriptions.
        
        Item 1A. Risk Factors
        The company is subject to complex and evolving international laws, regulations, and standards across multiple
        jurisdictions that affect its global supply chains and digital operations. Compliance with these laws involves
        significant operational resources and risks of substantial penalties in the event of non-compliance.
        
        Item 1B. Unresolved Staff Comments
        None.
      `;
      const slice = findSectionSlice(
        textWithXref,
        /\bitem\s+1a\b[.\s\-:]+(?:risk\s+factors\b)?/gi,
        /\bitem\s+(?:1b|2)\b/gi,
        12000
      );
      assertDefined(slice, 'Must find true narrative slice');
      assertIncludes(slice, 'The company is subject to complex and evolving international laws', 'Must slice true narrative, skipping cross-reference');
      assertFalse(slice.includes('please refer to Item 1A'), 'Slice must NOT start at cross-reference');
      return `Extracted without cross-ref: "${slice.slice(0, 70)}..."`;
    })
  );

  tests.push(
    await runTestCase('T1.4.4', 'Section Extraction: Complete 10-K section extraction (Items 1, 1A, 7)', async () => {
      const synthetic10K = `
        Item 1. Business
        We are a leading developer of graphics processing units and accelerated computing platforms designed for deep learning,
        scientific computing, enterprise analytics, and immersive gaming experiences across global hyperscale data centers.
        Our platforms combine specialized silicon architecture with comprehensive software stacks.
        
        Item 1A. Risk Factors
        Failure to meet demand or disruptions in our supply chain could materially impact revenues and operational results.
        We depend on advanced foundry partners for all semiconductor wafer fabrication, packaging, and testing services.
        
        Item 7. Management's Discussion and Analysis of Financial Condition and Results of Operations
        Revenue grew 122% year-over-year driven by compute and networking platform adoption in data centers.
        Operating income expanded significantly as demand for accelerated artificial intelligence infrastructure reached record levels.
        
        Item 8. Financial Statements
        Balance sheets and consolidated statements of operations...
      `;
      const meta: FilingMetadata = {
        form: '10-K',
        filingDate: '2026-02-20',
        accessionNumber: '0001045810-26-000002',
        accessionNoDashes: '000104581026000002',
        primaryDocument: 'nvda-10k.htm',
        docUrl: 'https://www.sec.gov/Archives/nvda-10k.htm',
      };
      const sections = extractSectionsFromFiling(synthetic10K, meta);
      assertEquals(sections.length, 3, 'Must extract exactly 3 target sections (1, 1A, 7)');
      assertDefined(sections.find((s) => s.name === 'Item 1. Business'), 'Must have Item 1');
      assertDefined(sections.find((s) => s.name === 'Item 1A. Risk Factors'), 'Must have Item 1A');
      assertDefined(sections.find((s) => s.name === 'Item 7. MD&A'), 'Must have Item 7');
      return `Extracted ${sections.length} core sections`;
    })
  );

  tests.push(
    await runTestCase('T1.4.5', 'Section Extraction: Head-tail fallback sampling when headings are missing', async () => {
      const unstructuredText = 'A'.repeat(5000) + 'MIDDLE_OMITTED_SECTION' + 'Z'.repeat(5000);
      const fallback = createHeadTailFallback(unstructuredText, 4000);
      assertLessThanOrEqual(fallback.length, 4100, 'Fallback sample length must be bounded around target');
      assertTrue(fallback.startsWith('AAAA'), 'Fallback must preserve head');
      assertTrue(fallback.endsWith('ZZZZ'), 'Fallback must preserve tail');
      assertIncludes(fallback, '[... document omitted ...]', 'Fallback must indicate omission gap');
      return `Fallback generated: ${fallback.length} characters with omission marker`;
    })
  );

  // =========================================================================
  // Feature 5: SEC Character Budget Limiting (lib/sec.ts)
  // =========================================================================

  tests.push(
    await runTestCase('T1.5.1', 'Budget Limiting: Context under budget is preserved unmodified', async () => {
      const mockSections: ExtractedSection[] = [
        {
          name: 'Item 1. Business',
          form: '10-K',
          filingDate: '2026-01-01',
          accessionNumber: 'acc-1',
          docUrl: 'url-1',
          content: 'X'.repeat(5000),
          charCount: 5000,
        },
        {
          name: 'Item 1A. Risk Factors',
          form: '10-K',
          filingDate: '2026-01-01',
          accessionNumber: 'acc-1',
          docUrl: 'url-1',
          content: 'Y'.repeat(4000),
          charCount: 4000,
        },
      ];
      const budgeted = enforceContextBudget(mockSections, 60000);
      const totalChars = budgeted.reduce((sum, s) => sum + s.charCount, 0);
      assertEquals(totalChars, 9000, 'Total characters must remain exactly 9000');
      assertEquals(budgeted[0].content.length, 5000, 'Section 1 content should not be altered');
      assertEquals(budgeted[1].content.length, 4000, 'Section 2 content should not be altered');
      return 'Sub-budget context preserved exactly';
    })
  );

  tests.push(
    await runTestCase('T1.5.2', 'Budget Limiting: Oversized context is strictly bounded to <= 60,000 chars', async () => {
      const mockSections: ExtractedSection[] = [
        {
          name: 'Item 1. Business',
          form: '10-K',
          filingDate: '2026-01-01',
          accessionNumber: 'acc-1',
          docUrl: 'url-1',
          content: 'A'.repeat(30000),
          charCount: 30000,
        },
        {
          name: 'Item 1A. Risk Factors',
          form: '10-K',
          filingDate: '2026-01-01',
          accessionNumber: 'acc-1',
          docUrl: 'url-1',
          content: 'B'.repeat(30000),
          charCount: 30000,
        },
        {
          name: 'Item 7. MD&A',
          form: '10-K',
          filingDate: '2026-01-01',
          accessionNumber: 'acc-1',
          docUrl: 'url-1',
          content: 'C'.repeat(30000),
          charCount: 30000,
        },
      ];
      // Total input is 90,000 characters
      const budgeted = enforceContextBudget(mockSections, 60000);
      const totalChars = budgeted.reduce((sum, s) => sum + s.charCount, 0);
      assertLessThanOrEqual(totalChars, 60000, 'Total characters must be <= 60,000');
      assertGreaterThan(totalChars, 58000, 'Budget trimmer should retain maximum permitted context');
      return `Reduced from 90,000 to ${totalChars} chars`;
    })
  );

  tests.push(
    await runTestCase('T1.5.3', 'Budget Limiting: Progressive trimming preserves narrative balance across sections', async () => {
      const mockSections: ExtractedSection[] = [
        {
          name: 'Item 1. Business',
          form: '10-K',
          filingDate: '2026-01-01',
          accessionNumber: 'acc-1',
          docUrl: 'url-1',
          content: 'A'.repeat(40000),
          charCount: 40000,
        },
        {
          name: 'Item 1A. Risk Factors',
          form: '10-K',
          filingDate: '2026-01-01',
          accessionNumber: 'acc-1',
          docUrl: 'url-1',
          content: 'B'.repeat(30000),
          charCount: 30000,
        },
        {
          name: '8-K Event',
          form: '8-K',
          filingDate: '2026-01-01',
          accessionNumber: 'acc-2',
          docUrl: 'url-2',
          content: 'C'.repeat(5000),
          charCount: 5000,
        },
      ];
      const budgeted = enforceContextBudget(mockSections, 60000);
      // Small section (8-K) should not be cut to zero; large sections should take the cuts
      assertGreaterThan(budgeted[0].charCount, 15000, 'Section 1 must still have substantive content');
      assertGreaterThan(budgeted[1].charCount, 15000, 'Section 2 must still have substantive content');
      assertEquals(budgeted[2].charCount, 5000, 'Small 8-K section should be preserved without degradation');
      return `Balanced: Sec1=${budgeted[0].charCount}, Sec2=${budgeted[1].charCount}, Sec3=${budgeted[2].charCount}`;
    })
  );

  tests.push(
    await runTestCase('T1.5.4', 'Budget Limiting: Individual section limits are respected during extraction', async () => {
      // Create giant sections > individual caps
      const text = `
        Item 1. Business
        ${'B'.repeat(25000)}
        
        Item 1A. Risk Factors
        ${'R'.repeat(25000)}
        
        Item 7. MD&A
        ${'M'.repeat(30000)}
      `;
      const meta: FilingMetadata = {
        form: '10-K',
        filingDate: '2026-01-01',
        accessionNumber: 'acc-1',
        accessionNoDashes: 'acc1',
        primaryDocument: 'doc.htm',
        docUrl: 'http://sec.gov',
      };
      const sections = extractSectionsFromFiling(text, meta);
      const bSec = sections.find((s) => s.name === 'Item 1. Business');
      const rSec = sections.find((s) => s.name === 'Item 1A. Risk Factors');
      const mSec = sections.find((s) => s.name === 'Item 7. MD&A');
      assertDefined(bSec, 'Item 1 must exist');
      assertDefined(rSec, 'Item 1A must exist');
      assertDefined(mSec, 'Item 7 must exist');
      assertLessThanOrEqual(bSec.charCount, 12000, 'Item 1 must be capped <= 12,000 chars');
      assertLessThanOrEqual(rSec.charCount, 12000, 'Item 1A must be capped <= 12,000 chars');
      assertLessThanOrEqual(mSec.charCount, 15000, 'Item 7 must be capped <= 15,000 chars');
      return `Item1=${bSec.charCount}/12k, Item1A=${rSec.charCount}/12k, Item7=${mSec.charCount}/15k`;
    })
  );

  tests.push(
    await runTestCase('T1.5.5', 'Budget Limiting: assembleContext produces formatted LLM prompt block', async () => {
      const mockSections: ExtractedSection[] = [
        {
          name: 'Item 1. Business',
          form: '10-K',
          filingDate: '2025-10-30',
          accessionNumber: '0000320193-25-000079',
          docUrl: 'url',
          content: 'Apple designs modern electronics.',
          charCount: 34,
        },
      ];
      const context = assembleContext('AAPL', 'Apple Inc.', mockSections);
      assertIncludes(context, 'TICKER: AAPL', 'Must include ticker in header');
      assertIncludes(context, 'COMPANY: Apple Inc.', 'Must include company name in header');
      assertIncludes(context, '=== 10-K (filed 2025-10-30, accession 0000320193-25-000079) — Item 1. Business ===', 'Must include section banner');
      assertIncludes(context, 'Apple designs modern electronics.', 'Must include section content');
      return `Assembled context length: ${context.length} chars`;
    })
  );

  const durationMs = Date.now() - start;
  const passed = tests.filter((t) => t.passed).length;
  const failed = tests.filter((t) => !t.passed).length;

  return {
    tier: 1,
    title: 'Tier 1: Core Feature Verification',
    tests,
    durationMs,
    passed,
    failed,
  };
}
