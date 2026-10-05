/**
 * E2E Test Suite Framework Types & Assertion Utilities
 */

export interface TestCaseResult {
  id: string;
  name: string;
  passed: boolean;
  durationMs: number;
  error?: string;
  details?: string;
}

export interface TierResult {
  tier: number;
  title: string;
  tests: TestCaseResult[];
  durationMs: number;
  passed: number;
  failed: number;
}

export interface TestRunnerSummary {
  tiers: TierResult[];
  totalTests: number;
  passed: number;
  failed: number;
  durationMs: number;
  success: boolean;
}

export class AssertionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AssertionError';
  }
}

export function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new AssertionError(message);
  }
}

export function assertTrue(condition: boolean, message = 'Expected condition to be true'): void {
  assert(condition === true, message);
}

export function assertFalse(condition: boolean, message = 'Expected condition to be false'): void {
  assert(condition === false, message);
}

export function assertEquals<T>(actual: T, expected: T, message?: string): void {
  if (actual !== expected) {
    const defaultMsg = `Expected ${JSON.stringify(expected)}, but got ${JSON.stringify(actual)}`;
    throw new AssertionError(message ? `${message}: ${defaultMsg}` : defaultMsg);
  }
}

export function assertNotEquals<T>(actual: T, expected: T, message?: string): void {
  if (actual === expected) {
    const defaultMsg = `Expected value not to equal ${JSON.stringify(expected)}`;
    throw new AssertionError(message ? `${message}: ${defaultMsg}` : defaultMsg);
  }
}

export function assertDefined<T>(
  value: T | null | undefined,
  message = 'Expected value to be defined and non-null'
): asserts value is T {
  if (value === null || value === undefined) {
    throw new AssertionError(message);
  }
}

export function assertGreaterThan(actual: number, expected: number, message?: string): void {
  if (!(actual > expected)) {
    const defaultMsg = `Expected ${actual} > ${expected}`;
    throw new AssertionError(message ? `${message}: ${defaultMsg}` : defaultMsg);
  }
}

export function assertGreaterThanOrEqual(actual: number, expected: number, message?: string): void {
  if (!(actual >= expected)) {
    const defaultMsg = `Expected ${actual} >= ${expected}`;
    throw new AssertionError(message ? `${message}: ${defaultMsg}` : defaultMsg);
  }
}

export function assertLessThanOrEqual(actual: number, expected: number, message?: string): void {
  if (!(actual <= expected)) {
    const defaultMsg = `Expected ${actual} <= ${expected}`;
    throw new AssertionError(message ? `${message}: ${defaultMsg}` : defaultMsg);
  }
}

export function assertIncludes(haystack: string, needle: string, message?: string): void {
  if (!haystack.includes(needle)) {
    const defaultMsg = `Expected "${haystack.slice(0, 100)}..." to include "${needle}"`;
    throw new AssertionError(message ? `${message}: ${defaultMsg}` : defaultMsg);
  }
}

export async function runTestCase(
  id: string,
  name: string,
  fn: () => Promise<string | void> | string | void
): Promise<TestCaseResult> {
  const start = Date.now();
  try {
    const detailMsg = await fn();
    const durationMs = Date.now() - start;
    return {
      id,
      name,
      passed: true,
      durationMs,
      details: typeof detailMsg === 'string' ? detailMsg : undefined,
    };
  } catch (err: unknown) {
    const durationMs = Date.now() - start;
    const error = err instanceof Error ? err.message : String(err);
    return {
      id,
      name,
      passed: false,
      durationMs,
      error,
    };
  }
}
