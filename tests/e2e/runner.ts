#!/usr/bin/env node
/**
 * Standalone E2E Test Suite Runner
 * 
 * Executes all 4 test tiers:
 * - Tier 1: Core Feature Verification (>= 5 cases per feature)
 * - Tier 2: Boundary Value Analysis & Edge Cases
 * - Tier 3: Pairwise Combinations & Concurrency
 * - Tier 4: Real-World Workload Scenarios (AAPL & NVDA)
 * 
 * Usage:
 *   npx tsx tests/e2e/runner.ts
 */

import { runTier1Tests } from './tier1-features.test';
import { runTier2Tests } from './tier2-boundary.test';
import { runTier3Tests } from './tier3-combinations.test';
import { runTier4Tests } from './tier4-application.test';
import { TestRunnerSummary, TierResult } from './types';

// ANSI terminal color codes
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const GRAY = '\x1b[90m';

function printHeader(title: string) {
  console.log(`\n${BOLD}${CYAN}======================================================================${RESET}`);
  console.log(`${BOLD}${CYAN}  ${title}${RESET}`);
  console.log(`${BOLD}${CYAN}======================================================================${RESET}\n`);
}

function printTierHeader(tierResult: TierResult) {
  console.log(`\n${BOLD}${YELLOW}--- [Tier ${tierResult.tier}] ${tierResult.title} ---${RESET}`);
}

function printTestResult(test: { id: string; name: string; passed: boolean; durationMs: number; details?: string; error?: string }) {
  const status = test.passed ? `${GREEN}✅ PASS${RESET}` : `${RED}❌ FAIL${RESET}`;
  const duration = `${GRAY}(${test.durationMs}ms)${RESET}`;
  const detail = test.details ? ` ${GRAY}- ${test.details}${RESET}` : '';
  const error = test.error ? `\n     ${RED}Error: ${test.error}${RESET}` : '';
  console.log(`  ${status} ${BOLD}${test.id}${RESET}: ${test.name} ${duration}${detail}${error}`);
}

async function main() {
  const overallStart = Date.now();
  printHeader('Advisor Brief: E2E Test Harness Runner (Tiers 1–4)');
  console.log(`Target: Next.js 16 Advisor Brief Data Ingestion Engine`);
  console.log(`Timestamp: ${new Date().toISOString()}`);
  console.log(`Runtime: Node.js ${process.version}\n`);

  const tiers: TierResult[] = [];

  // Run Tier 1
  console.log(`Running Tier 1 (Core Features)...`);
  const t1 = await runTier1Tests();
  printTierHeader(t1);
  t1.tests.forEach(printTestResult);
  tiers.push(t1);

  // Run Tier 2
  console.log(`\nRunning Tier 2 (Boundary & Corner Cases)...`);
  const t2 = await runTier2Tests();
  printTierHeader(t2);
  t2.tests.forEach(printTestResult);
  tiers.push(t2);

  // Run Tier 3
  console.log(`\nRunning Tier 3 (Pairwise & Concurrency)...`);
  const t3 = await runTier3Tests();
  printTierHeader(t3);
  t3.tests.forEach(printTestResult);
  tiers.push(t3);

  // Run Tier 4
  console.log(`\nRunning Tier 4 (Real-World Scenarios)...`);
  const t4 = await runTier4Tests();
  printTierHeader(t4);
  t4.tests.forEach(printTestResult);
  tiers.push(t4);

  const overallDuration = Date.now() - overallStart;
  const totalTests = tiers.reduce((sum, t) => sum + t.tests.length, 0);
  const totalPassed = tiers.reduce((sum, t) => sum + t.passed, 0);
  const totalFailed = tiers.reduce((sum, t) => sum + t.failed, 0);
  const allSuccess = totalFailed === 0;

  printHeader('E2E Test Execution Summary');
  console.log(`${BOLD}Tier Breakdown:${RESET}`);
  for (const t of tiers) {
    const icon = t.failed === 0 ? `${GREEN}✓${RESET}` : `${RED}✗${RESET}`;
    const pct = ((t.passed / t.tests.length) * 100).toFixed(0);
    console.log(`  ${icon} Tier ${t.tier}: ${t.title.padEnd(45)} ${t.passed}/${t.tests.length} passed (${pct}%) in ${(t.durationMs / 1000).toFixed(2)}s`);
  }

  console.log(`\n${BOLD}Overall Results:${RESET}`);
  console.log(`  Total Test Cases: ${BOLD}${totalTests}${RESET}`);
  console.log(`  Passed:           ${GREEN}${BOLD}${totalPassed}${RESET}`);
  console.log(`  Failed:           ${totalFailed > 0 ? RED : GREEN}${BOLD}${totalFailed}${RESET}`);
  console.log(`  Execution Time:   ${(overallDuration / 1000).toFixed(2)}s\n`);

  if (allSuccess) {
    console.log(`${BOLD}${GREEN}🎉 ALL E2E TESTS PASSED SUCCESSFULLY (Exit Code 0)${RESET}\n`);
    process.exit(0);
  } else {
    console.log(`${BOLD}${RED}❌ E2E TEST SUITE HAS ${totalFailed} FAILURE(S) (Exit Code 1)${RESET}\n`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(`\n${RED}Fatal runner error:${RESET}`, err);
  process.exit(1);
});
