import { getMarketQuote } from '../lib/quote';
import { resolveCik, getSecFilings } from '../lib/sec';
import { QuoteData } from '../types/quote';
import { SecFilingsResult } from '../types/sec';

interface TestResult {
  name: string;
  passed: boolean;
  details?: string;
  error?: string;
}

const results: TestResult[] = [];

function record(name: string, passed: boolean, details?: string, error?: string) {
  results.push({ name, passed, details, error });
  const status = passed ? '✅ PASS' : '❌ FAIL';
  const message = details ? ` (${details})` : error ? ` - ${error}` : '';
  console.log(`${status}: ${name}${message}`);
}

async function verifyQuote(ticker: string): Promise<QuoteData | null> {
  console.log(`\n--- Verifying Quote for ${ticker} ---`);
  try {
    const res = await getMarketQuote(ticker);
    if (!res.success) {
      record(`Quote fetch for ${ticker}`, false, undefined, res.error);
      return null;
    }
    const data = res.data;
    record(`Quote fetch for ${ticker}`, true, `price=$${data.price.toFixed(2)}, exchange=${data.exchange}`);

    // Verify fields completeness
    const hasPrice = typeof data.price === 'number' && data.price > 0;
    const hasPrevClose = typeof data.previousClose === 'number' && data.previousClose > 0;
    const hasChangePct = typeof data.changePercent === 'number' && !isNaN(data.changePercent);
    const hasDayRange = data.dayRange.low > 0 && data.dayRange.high >= data.dayRange.low;
    const has52Wk = data.fiftyTwoWeek.low > 0 && data.fiftyTwoWeek.high >= data.fiftyTwoWeek.low;
    const hasVolume = typeof data.volume === 'number' && data.volume > 0;
    const hasMarketTime = !isNaN(Date.parse(data.marketTime));

    record(
      `Quote data completeness for ${ticker}`,
      hasPrice && hasPrevClose && hasChangePct && hasDayRange && has52Wk && hasVolume && hasMarketTime,
      `price=${data.price}, prevClose=${data.previousClose}, changePct=${data.changePercent}%, vol=${data.volume}`
    );

    // Verify sparkline points length > 100
    const sparklineLen = data.sparkline?.points?.length ?? 0;
    record(
      `Sparkline length > 100 for ${ticker}`,
      sparklineLen > 100,
      `${sparklineLen} daily points (closes=${data.sparkline?.close?.length ?? 0})`
    );

    return data;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    record(`Quote exception for ${ticker}`, false, undefined, msg);
    return null;
  }
}

async function verifySec(ticker: string, expectedCik?: string): Promise<SecFilingsResult | null> {
  console.log(`\n--- Verifying SEC Ingestion for ${ticker} ---`);
  try {
    // 1. CIK Resolution
    const cikInfo = await resolveCik(ticker);
    if (!cikInfo) {
      record(`CIK resolution for ${ticker}`, false, undefined, 'CIK not resolved');
      return null;
    }

    const cikCorrect = !expectedCik || cikInfo.cik === expectedCik;
    record(
      `CIK resolution for ${ticker}`,
      cikCorrect,
      `Resolved: CIK=${cikInfo.cik} (${cikInfo.title})`
    );

    // 2. Filings retrieval & section slicing
    const secRes = await getSecFilings(ticker);
    if (!secRes.success) {
      record(`SEC filings ingestion for ${ticker}`, false, undefined, secRes.error);
      return null;
    }

    const data = secRes.data;
    record(
      `SEC filings retrieval for ${ticker}`,
      data.filings.length >= 2,
      `Retrieved ${data.filings.length} filings: ${data.filings.map((f) => f.form).join(', ')}`
    );

    // Verify presence of non-empty core sections: Business, Risks, MD&A
    const businessSection = data.sections.find(
      (s) => s.name.toLowerCase().includes('business') || s.name.includes('Item 1.')
    );
    const riskSection = data.sections.find(
      (s) => s.name.toLowerCase().includes('risk') || s.name.includes('Item 1A')
    );
    const mdaSection = data.sections.find(
      (s) => s.name.toLowerCase().includes('md&a') || s.name.includes('Item 7') || s.name.includes('Item 2')
    );

    record(
      `Extracted Business section for ${ticker}`,
      !!businessSection && businessSection.charCount > 0,
      businessSection ? `${businessSection.charCount} chars (${businessSection.name})` : 'MISSING'
    );

    record(
      `Extracted Risks section for ${ticker}`,
      !!riskSection && riskSection.charCount > 0,
      riskSection ? `${riskSection.charCount} chars (${riskSection.name})` : 'MISSING'
    );

    record(
      `Extracted MD&A section for ${ticker}`,
      !!mdaSection && mdaSection.charCount > 0,
      mdaSection ? `${mdaSection.charCount} chars (${mdaSection.name})` : 'MISSING'
    );

    // Check individual section caps
    let capsRespected = true;
    for (const s of data.sections) {
      if (s.name.includes('Item 1.') && s.charCount > 12000) capsRespected = false;
      if (s.name.includes('Item 1A') && s.charCount > 12000) capsRespected = false;
      if (s.name.includes('Item 4.') && s.charCount > 12000) capsRespected = false;
      if (s.name.includes('Item 3.D') && s.charCount > 12000) capsRespected = false;
      if (s.name.includes('Item 5.') && s.charCount > 15000) capsRespected = false;
      if (s.name.includes('Item 7.') && s.charCount > 15000) capsRespected = false;
      if (s.name.includes('Item 2.') && s.charCount > 12000) capsRespected = false;
      if (s.name.includes('8-K') && s.charCount > 6000) capsRespected = false;
      if (s.name.includes('6-K') && s.charCount > 6000) capsRespected = false;
    }
    record(
      `Individual section caps respected for ${ticker}`,
      capsRespected,
      `All individual section limits honored`
    );

    // Verify strict total context budget <= 60,000 characters for both section text and assembled context
    const totalChars = data.totalChars;
    const assembledLen = data.assembledContext?.length ?? 0;
    record(
      `Total context budget <= 60,000 chars for ${ticker}`,
      totalChars > 0 && totalChars <= 60000 && assembledLen <= 60000,
      `sectionChars: ${totalChars}, assembledLen: ${assembledLen} chars (~${Math.round(totalChars / 3.3)} tokens)`
    );

    return data;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    record(`SEC exception for ${ticker}`, false, undefined, msg);
    return null;
  }
}

async function verifyInvalidTicker(invalidTicker = 'ZZZZ99') {
  console.log(`\n--- Verifying Negative Handling for Invalid Ticker (${invalidTicker}) ---`);

  // 1. Quote negative handling
  try {
    const quoteRes = await getMarketQuote(invalidTicker);
    record(
      `Graceful quote error handling for ${invalidTicker}`,
      quoteRes.success === false && typeof quoteRes.error === 'string' && quoteRes.error.length > 0,
      `Returned success=false with error: "${!quoteRes.success ? quoteRes.error : ''}"`
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    record(`Graceful quote error handling for ${invalidTicker}`, false, undefined, `Threw uncaught exception: ${msg}`);
  }

  // 2. SEC CIK negative handling
  try {
    const cik = await resolveCik(invalidTicker);
    record(
      `Graceful CIK resolution failure for ${invalidTicker}`,
      cik === null,
      `Returned null as expected`
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    record(`Graceful CIK resolution failure for ${invalidTicker}`, false, undefined, `Threw exception: ${msg}`);
  }

  // 3. SEC filings negative handling
  try {
    const secRes = await getSecFilings(invalidTicker);
    record(
      `Graceful SEC pipeline error for ${invalidTicker}`,
      secRes.success === false && typeof secRes.error === 'string' && secRes.error.length > 0,
      `Returned success=false with error: "${!secRes.success ? secRes.error : ''}"`
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    record(`Graceful SEC pipeline error for ${invalidTicker}`, false, undefined, `Threw exception: ${msg}`);
  }
}

async function main() {
  console.log('====================================================');
  console.log(' Advisor Brief: Live Financial Data Verification');
  console.log('====================================================');

  const startTime = Date.now();

  // Test AAPL
  await verifyQuote('AAPL');
  await verifySec('AAPL', '0000320193');

  // Test NVDA
  await verifyQuote('NVDA');
  await verifySec('NVDA', '0001045810');

  // Test BRK.B (Share-class dot ticker normalization)
  await verifyQuote('BRK.B');
  await verifySec('BRK.B', '0001067983');

  // Test TSM (Foreign private issuer Form 20-F / 6-K)
  await verifyQuote('TSM');
  await verifySec('TSM', '0001046179');

  // Test Invalid Ticker
  await verifyInvalidTicker('ZZZZ99');

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log('\n====================================================');
  console.log(' Verification Summary');
  console.log('====================================================');

  const passedCount = results.filter((r) => r.passed).length;
  const failedCount = results.filter((r) => !r.passed).length;

  console.log(`Total Checks: ${results.length}`);
  console.log(`Passed:       ${passedCount}`);
  console.log(`Failed:       ${failedCount}`);
  console.log(`Elapsed Time: ${totalTime}s`);

  if (failedCount > 0) {
    console.error('\n❌ Verification Failed! Some checks did not pass.');
    process.exit(1);
  } else {
    console.log('\n🎉 All live data verification checks PASSED successfully!');
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('Fatal verification runner error:', err);
  process.exit(1);
});
