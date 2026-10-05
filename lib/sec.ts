import * as cheerio from 'cheerio';
import {
  CikInfo,
  CompanyFilingMetadata,
  ExtractedSection,
  FilingMetadata,
  FilingSection,
  FilingSectionsCollection,
  ResolvedCik,
  SecFilingPackage,
  SecResult,
} from '../types/sec';

const SEC_TICKERS_URL = 'https://www.sec.gov/files/company_tickers.json';
const SEC_SUBMISSIONS_BASE = 'https://data.sec.gov/submissions/CIK';
const SEC_ARCHIVES_BASE = 'https://www.sec.gov/Archives/edgar/data';

const DEFAULT_SEC_USER_AGENT =
  process.env.SEC_USER_AGENT ||
  'AdvisorBrief/1.0 (advisor-brief-support@perficient.com)';

const MAX_HTML_DOWNLOAD_BYTES = 3 * 1024 * 1024; // 3 MB stream cap per doc
const MAX_TOTAL_CONTEXT_BUDGET = 60000;          // Strict hard cap of 60k chars

// In-memory cache for CIK lookup map
let cachedTickersMap: Map<string, CikInfo> | null = null;
let lastTickersFetchTime = 0;
const TICKERS_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// SEC Fair Access rate ceiling: max 10 req/s
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL_MS = 105; // guarantees <= 9.5 req/s

async function paceRequest(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < MIN_REQUEST_INTERVAL_MS) {
    await new Promise((r) => setTimeout(r, MIN_REQUEST_INTERVAL_MS - elapsed));
  }
  lastRequestTime = Date.now();
}

interface SecTickerEntry {
  cik_str: number;
  ticker: string;
  title: string;
}

interface SecSubmissionsResponse {
  cik: string;
  name: string;
  filings: {
    recent: {
      accessionNumber: string[];
      filingDate: string[];
      reportDate?: string[];
      form: string[];
      primaryDocument: string[];
    };
  };
}

/**
 * Creates a ResolvedCik object that acts as a string while preserving
 * CikInfo property access (cik, unpaddedCik, ticker, title).
 */
function makeResolvedCik(
  paddedCik: string,
  unpaddedCik: string,
  ticker: string,
  title: string
): ResolvedCik {
  const strObj = new String(paddedCik);
  const info: CikInfo = {
    cik: paddedCik,
    unpaddedCik,
    ticker,
    title,
  };
  return Object.assign(strObj, info, {
    toString: () => paddedCik,
    valueOf: () => paddedCik,
    [Symbol.toPrimitive]: () => paddedCik,
  }) as unknown as ResolvedCik;
}

/**
 * Resolves a stock ticker symbol to CIK information querying sec.gov company_tickers.json.
 * Uses an in-memory cache and returns a 10-digit zero-padded CIK with helper metadata.
 */
export async function resolveCik(ticker: string): Promise<ResolvedCik | null> {
  if (!ticker || typeof ticker !== 'string') return null;
  const cleanInput = ticker.trim().toUpperCase();
  if (!cleanInput) return null;

  // Reject clearly overlong input (> 10 chars)
  if (cleanInput.length > 10) return null;

  // Normalize dual-class symbols (e.g. BRK.B or BRK/B -> BRK-B)
  const normalizedTicker = cleanInput.replace(/[./]/g, '-');

  const now = Date.now();
  if (!cachedTickersMap || now - lastTickersFetchTime > TICKERS_CACHE_TTL_MS) {
    try {
      await paceRequest();
      const response = await fetch(SEC_TICKERS_URL, {
        headers: {
          'User-Agent': DEFAULT_SEC_USER_AGENT,
          'Accept': 'application/json',
        },
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        throw new Error(`SEC company_tickers.json responded with HTTP ${response.status}`);
      }

      const json: Record<string, SecTickerEntry> = await response.json();
      const map = new Map<string, CikInfo>();

      for (const key of Object.keys(json)) {
        const item = json[key];
        if (item && item.ticker && item.cik_str !== undefined) {
          const rawCikStr = String(item.cik_str);
          const paddedCik = rawCikStr.padStart(10, '0');
          const t = item.ticker.toUpperCase();
          const info: CikInfo = {
            ticker: t,
            cik: paddedCik,
            unpaddedCik: rawCikStr,
            title: item.title,
          };
          map.set(t, info);
          // Also alias hyphenated or dotless equivalents for dual-class shares
          if (t.includes('-')) {
            map.set(t.replace(/-/g, ''), info);
          }
        }
      }

      cachedTickersMap = map;
      lastTickersFetchTime = now;
    } catch (err) {
      if (!cachedTickersMap) {
        throw err;
      }
      // Continue with existing cache if refresh failed
    }
  }

  const found =
    cachedTickersMap.get(normalizedTicker) ||
    cachedTickersMap.get(cleanInput) ||
    null;

  if (!found) return null;

  return makeResolvedCik(
    found.cik,
    found.unpaddedCik,
    found.ticker,
    found.title
  );
}

/**
 * Retrieves the list of target filings (latest 10-K, latest 10-Q, and latest 8-K within 60 days)
 * from SEC submissions endpoint.
 */
export async function getRecentFilingsMetadata(
  paddedCik: string,
  unpaddedCik: string
): Promise<FilingMetadata[]> {
  await paceRequest();
  const url = `${SEC_SUBMISSIONS_BASE}${paddedCik}.json`;
  const response = await fetch(url, {
    headers: {
      'User-Agent': DEFAULT_SEC_USER_AGENT,
      'Accept': 'application/json',
    },
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    throw new Error(`SEC submissions for CIK ${paddedCik} returned HTTP ${response.status}`);
  }

  const json: SecSubmissionsResponse = await response.json();
  const recent = json.filings?.recent;
  if (!recent || !recent.form || recent.form.length === 0) {
    return [];
  }

  const selectedFilings: FilingMetadata[] = [];
  const now = Date.now();
  const sixtyDaysMs = 60 * 24 * 60 * 60 * 1000;
  const sixtyDaysAgoTimestamp = now - sixtyDaysMs;

  let found10K = false;
  let found10Q = false;
  let found8K = false;

  // Track foreign issuer fallback forms if 10-K / 10-Q are absent
  let found20F = false;
  let found6K = false;

  const count = recent.form.length;
  for (let i = 0; i < count; i++) {
    const form = recent.form[i];
    const filingDate = recent.filingDate[i];
    const accessionNumber = recent.accessionNumber[i];
    const primaryDocument = recent.primaryDocument[i];
    const reportDate = recent.reportDate ? recent.reportDate[i] : undefined;

    if (!form || !accessionNumber || !primaryDocument || !filingDate) continue;

    const accessionNoDashes = accessionNumber.replace(/-/g, '');
    const docUrl = `${SEC_ARCHIVES_BASE}/${unpaddedCik}/${accessionNoDashes}/${primaryDocument}`;

    if (!found10K && form === '10-K') {
      selectedFilings.push({
        form: '10-K',
        filingDate,
        accessionNumber,
        accessionNoDashes,
        primaryDocument,
        docUrl,
        reportDate,
      });
      found10K = true;
    } else if (!found10Q && form === '10-Q') {
      selectedFilings.push({
        form: '10-Q',
        filingDate,
        accessionNumber,
        accessionNoDashes,
        primaryDocument,
        docUrl,
        reportDate,
      });
      found10Q = true;
    } else if (!found8K && form === '8-K') {
      const filingDateObj = new Date(filingDate);
      if (!isNaN(filingDateObj.getTime()) && filingDateObj.getTime() >= sixtyDaysAgoTimestamp) {
        selectedFilings.push({
          form: '8-K',
          filingDate,
          accessionNumber,
          accessionNoDashes,
          primaryDocument,
          docUrl,
          reportDate,
        });
        found8K = true;
      }
    } else if (!found10K && !found20F && form === '20-F') {
      selectedFilings.push({
        form: '20-F',
        filingDate,
        accessionNumber,
        accessionNoDashes,
        primaryDocument,
        docUrl,
        reportDate,
      });
      found20F = true;
    } else if (!found10Q && !found6K && form === '6-K') {
      selectedFilings.push({
        form: '6-K',
        filingDate,
        accessionNumber,
        accessionNoDashes,
        primaryDocument,
        docUrl,
        reportDate,
      });
      found6K = true;
    }

    // Cease selection once 3 documents are identified
    if (selectedFilings.length >= 3) break;
  }

  return selectedFilings;
}

/**
 * Downloads a primary SEC filing document, capped at 3 MB to prevent memory bloat.
 */
export async function fetchFilingHtml(docUrl: string): Promise<string> {
  await paceRequest();
  const response = await fetch(docUrl, {
    headers: {
      'User-Agent': DEFAULT_SEC_USER_AGENT,
      'Accept': 'text/html,application/xhtml+xml,*/*',
    },
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch document ${docUrl} (HTTP ${response.status})`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const cappedBytes = arrayBuffer.byteLength > MAX_HTML_DOWNLOAD_BYTES
    ? arrayBuffer.slice(0, MAX_HTML_DOWNLOAD_BYTES)
    : arrayBuffer;

  const decoder = new TextDecoder('utf-8');
  return decoder.decode(cappedBytes);
}

/**
 * Parses raw HTML with Cheerio into clean, decoded plain text with preserved spacing.
 */
export function htmlToText(html: string): string {
  const $ = cheerio.load(html);
  $('script, style, noscript').remove();

  // Add whitespace around block elements to prevent words fusing
  $('p, div, tr, br, h1, h2, h3, h4, h5, h6, td, th').each((_, el) => {
    $(el).append(' ');
    $(el).prepend(' ');
  });

  const rawText = $('body').length ? $('body').text() : $.text();

  return rawText
    .replace(/[\u00a0\u2000-\u200b\u202f\u205f\u3000]/g, ' ')
    .replace(/&#160;/g, ' ')
    .replace(/[\u2018\u2019\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201F]/g, '"')
    .replace(/&rsquo;/g, "'")
    .replace(/&lsquo;/g, "'")
    .replace(/&rdquo;/g, '"')
    .replace(/&ldquo;/g, '"')
    .replace(/&#8217;/g, "'")
    .replace(/&#8216;/g, "'")
    .replace(/&#8220;/g, '"')
    .replace(/&#8221;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&mdash;/g, '-')
    .replace(/&ndash;/g, '-')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/[ \t]+/g, ' ')
    .replace(/\r\n/g, '\n')
    .replace(/\n\s*\n+/g, '\n\n')
    .trim();
}

/**
 * Checks if a matched index is an in-text cross-reference (e.g. "Refer to Item 1A").
 */
function isCrossReference(text: string, matchIndex: number): boolean {
  const before = text.substring(Math.max(0, matchIndex - 90), matchIndex).toLowerCase();
  const trimmedBefore = before.trimEnd();

  // Check if preceded by opening quotation marks
  if (
    trimmedBefore.endsWith('"') ||
    trimmedBefore.endsWith('“') ||
    trimmedBefore.endsWith("'")
  ) {
    return true;
  }

  const xrefBefore =
    /(?:see(?:\s+also)?|refer\s+to|referring\s+to|in\s+conjunction\s+with|set\s+forth\s+in|included\s+in|discussed\s+in|described\s+in|found\s+in|heading|pursuant\s+to|note\s+to|in\s+part\s+[ivx]+,?|located\s+in|stated\s+in|in)\s*["“']?\s*$/i;

  const xrefAfter =
    /^item\s+\d+[a-z]?\s*(?:of\s+this|in\s+this|under\s+the|herein|above|below|for\s+additional)/i;

  return xrefBefore.test(before) || xrefAfter.test(text.substring(matchIndex, matchIndex + 140));
}

/**
 * Checks if a matched index is within a Table of Contents cluster.
 */
function isTocMatch(text: string, matchIndex: number): boolean {
  const after = text.substring(matchIndex, matchIndex + 220);
  // Strip the current item heading
  const afterHeading = after.replace(
    /^item\s+\d+[a-z]?\s*[:.\-]?\s*[a-z\s&,']{0,90}/i,
    ''
  );

  // In TOC, another Item or Part follows immediately within ~80 chars
  if (/\b(?:item\s+\d+[a-z]?|part\s+[ivx]+)\b/i.test(afterHeading)) {
    return true;
  }

  // Also check if heading is immediately followed by a page number and another Item
  if (/^\s*item\s+\d+[a-z]?[^0-9\n]{0,80}\s+\d+\s+item\s+\d+[a-z]?/i.test(after)) {
    return true;
  }

  return false;
}

/**
 * Locates the true narrative start and end of a section in plain text,
 * resisting TOC clusters and in-text cross-references.
 */
export function findSectionSlice(
  text: string,
  startRegex: RegExp,
  endRegex: RegExp | null,
  maxChars: number
): string | null {
  const startMatches = [...text.matchAll(startRegex)];
  const endMatches = endRegex ? [...text.matchAll(endRegex)] : [];

  for (const startM of startMatches) {
    if (startM.index === undefined) continue;
    const startIdx = startM.index;
    if (isCrossReference(text, startIdx)) continue;
    if (isTocMatch(text, startIdx)) continue;

    let endIdx = text.length;
    if (endRegex) {
      for (const endM of endMatches) {
        if (endM.index === undefined || endM.index <= startIdx + 100) continue;
        const eIdx = endM.index;
        if (isCrossReference(text, eIdx)) continue;
        if (isTocMatch(text, eIdx)) continue;
        endIdx = eIdx;
        break;
      }
    }

    // Rule 3: Substantive Span Verification (min 300 characters span if end marker exists)
    if (endRegex && endIdx - startIdx < 300) {
      continue;
    }

    const length = Math.min(endIdx - startIdx, maxChars);
    const slice = text.substring(startIdx, startIdx + length).trim();
    if (slice.length > 0) {
      return slice;
    }
  }

  return null;
}

/**
 * Head-tail fallback sampling when regex slicing misses due to format drift.
 * Samples first 8,000 chars and last 8,000 chars of document (16,000 chars target cap).
 */
export function createHeadTailFallback(text: string, targetCap = 16000): string {
  if (text.length <= targetCap) return text;
  const half = Math.floor(targetCap / 2);
  const head = text.substring(0, half).trim();
  const tail = text.substring(text.length - half).trim();
  return `${head}\n\n[... document omitted ...]\n\n${tail}`;
}

/**
 * Extracts sections from a single filing based on its form type.
 */
export function extractSectionsFromFiling(
  text: string,
  meta: FilingMetadata
): ExtractedSection[] {
  const sections: ExtractedSection[] = [];
  const form = meta.form;

  if (form === '10-K') {
    // 10-K: Item 1 (cap 12k), Item 1A (cap 12k), Item 7 (cap 15k), Item 7A (cap 5k)
    const item1 = findSectionSlice(
      text,
      /\bitem\s+1\b[.\s\-:]*(?:business\b)?/gi,
      /\bitem\s+(?:1a|1b|2)\b/gi,
      12000
    );
    if (item1) {
      sections.push({
        title: 'Item 1. Business',
        name: 'Item 1. Business',
        item: '1',
        form,
        filingDate: meta.filingDate,
        accessionNumber: meta.accessionNumber,
        docUrl: meta.docUrl,
        content: item1,
        charCount: item1.length,
        isFallback: false,
      });
    }

    const item1A = findSectionSlice(
      text,
      /\bitem\s+1a\b[.\s\-:]*(?:risk\s+factors\b)?/gi,
      /\bitem\s+(?:1b|1c|2)\b/gi,
      12000
    );
    if (item1A) {
      sections.push({
        title: 'Item 1A. Risk Factors',
        name: 'Item 1A. Risk Factors',
        item: '1A',
        form,
        filingDate: meta.filingDate,
        accessionNumber: meta.accessionNumber,
        docUrl: meta.docUrl,
        content: item1A,
        charCount: item1A.length,
        isFallback: false,
      });
    }

    const item7 = findSectionSlice(
      text,
      /\bitem\s+7\b[.\s\-:]*(?:management['’]?s\s+discussion|md&a\b)?/gi,
      /\bitem\s+(?:7a|8)\b/gi,
      15000
    );
    if (item7) {
      sections.push({
        title: 'Item 7. MD&A',
        name: 'Item 7. MD&A',
        item: '7',
        form,
        filingDate: meta.filingDate,
        accessionNumber: meta.accessionNumber,
        docUrl: meta.docUrl,
        content: item7,
        charCount: item7.length,
        isFallback: false,
      });
    }

    // Optional Item 7A
    const item7A = findSectionSlice(
      text,
      /\bitem\s+7a\b[.\s\-:]*(?:quantitative|market\s+risk)?/gi,
      /\bitem\s+8\b/gi,
      5000
    );
    if (item7A) {
      sections.push({
        title: 'Item 7A. Market Risk',
        name: 'Item 7A. Market Risk',
        item: '7A',
        form,
        filingDate: meta.filingDate,
        accessionNumber: meta.accessionNumber,
        docUrl: meta.docUrl,
        content: item7A,
        charCount: item7A.length,
        isFallback: false,
      });
    }

    // Fallback if all targeted items missed due to format drift
    if (sections.length === 0) {
      const fallback = createHeadTailFallback(text, 16000);
      sections.push({
        title: '10-K Overview (Fallback Sample)',
        name: '10-K Overview (Fallback Sample)',
        item: '10-K',
        form,
        filingDate: meta.filingDate,
        accessionNumber: meta.accessionNumber,
        docUrl: meta.docUrl,
        content: fallback,
        charCount: fallback.length,
        isFallback: true,
      });
    }
  } else if (form === '20-F') {
    // Foreign Private Issuer Annual Report:
    // Item 4: Information on the Company (Business Overview)
    const item4 = findSectionSlice(
      text,
      /\bitem\s+4[.:\s\-]+information\s+on\s+the\s+company/gi,
      /\bitem\s+(?:4a|5)[.:\s\-]+/gi,
      12000
    );
    if (item4) {
      sections.push({
        title: 'Item 4. Information on the Company (Business Overview)',
        name: 'Item 4. Information on the Company (Business Overview)',
        item: '4',
        form,
        filingDate: meta.filingDate,
        accessionNumber: meta.accessionNumber,
        docUrl: meta.docUrl,
        content: item4,
        charCount: item4.length,
        isFallback: false,
      });
    }

    // Item 3: Key Information / Risk Factors
    const item3 = findSectionSlice(
      text,
      /\bitem\s+3(?:\.[a-z])?[.:\s\-]+(?:key\s+information|risk\s+factors)/gi,
      /\bitem\s+(?:3a|4)[.:\s\-]+/gi,
      12000
    );
    if (item3) {
      sections.push({
        title: 'Item 3. Key Information & Risk Factors',
        name: 'Item 3. Key Information & Risk Factors',
        item: '3',
        form,
        filingDate: meta.filingDate,
        accessionNumber: meta.accessionNumber,
        docUrl: meta.docUrl,
        content: item3,
        charCount: item3.length,
        isFallback: false,
      });
    }

    // Item 5: Operating and Financial Review (MD&A)
    const item5 = findSectionSlice(
      text,
      /\bitem\s+5[.:\s\-]+operating\s+and\s+financial\s+review/gi,
      /\bitem\s+(?:5a|6)[.:\s\-]+/gi,
      15000
    );
    if (item5) {
      sections.push({
        title: 'Item 5. Operating and Financial Review (MD&A)',
        name: 'Item 5. Operating and Financial Review (MD&A)',
        item: '5',
        form,
        filingDate: meta.filingDate,
        accessionNumber: meta.accessionNumber,
        docUrl: meta.docUrl,
        content: item5,
        charCount: item5.length,
        isFallback: false,
      });
    }

    if (sections.length === 0) {
      const fallback = createHeadTailFallback(text, 16000);
      sections.push({
        title: '20-F Business & Risk Overview (Fallback Sample)',
        name: '20-F Business & Risk Overview (Fallback Sample)',
        item: '20-F',
        form,
        filingDate: meta.filingDate,
        accessionNumber: meta.accessionNumber,
        docUrl: meta.docUrl,
        content: fallback,
        charCount: fallback.length,
        isFallback: true,
      });
    }
  } else if (form === '10-Q' || form === '6-K') {
    // 10-Q: Item 2 MD&A (cap 12k)
    const item2 = findSectionSlice(
      text,
      /\bitem\s+2\b[.\s\-:]*(?:management['’]?s\s+discussion|md&a\b)?/gi,
      /\bitem\s+(?:3|4)\b|\bpart\s+ii\b/gi,
      12000
    );

    if (item2) {
      sections.push({
        title: 'Item 2. MD&A (Quarterly)',
        name: 'Item 2. MD&A (Quarterly)',
        item: '2',
        form,
        filingDate: meta.filingDate,
        accessionNumber: meta.accessionNumber,
        docUrl: meta.docUrl,
        content: item2,
        charCount: item2.length,
        isFallback: false,
      });
    } else {
      const fallback = createHeadTailFallback(text, 16000);
      sections.push({
        title: `${form} Overview (Fallback Sample)`,
        name: `${form} Overview (Fallback Sample)`,
        item: '2',
        form,
        filingDate: meta.filingDate,
        accessionNumber: meta.accessionNumber,
        docUrl: meta.docUrl,
        content: fallback,
        charCount: fallback.length,
        isFallback: true,
      });
    }
  } else if (form === '8-K') {
    // 8-K: narrative body capped at 6,000 chars
    const itemStart = text.search(/\bitem\s+\d+\.\d+\b/i);
    const startIdx = itemStart !== -1 ? itemStart : 0;
    const body = text.substring(startIdx, startIdx + 6000).trim();

    sections.push({
      title: '8-K Material Event Narrative',
      name: '8-K Material Event Narrative',
      item: '8-K',
      form,
      filingDate: meta.filingDate,
      accessionNumber: meta.accessionNumber,
      docUrl: meta.docUrl,
      content: body,
      charCount: body.length,
      isFallback: false,
    });
  }

  return sections;
}

/**
 * Enforces a strict total context budget <= 60,000 characters across all extracted sections.
 */
export function enforceContextBudget(
  sections: ExtractedSection[],
  maxBudget = MAX_TOTAL_CONTEXT_BUDGET
): ExtractedSection[] {
  let totalChars = sections.reduce((sum, s) => sum + s.charCount, 0);
  if (totalChars <= maxBudget) {
    return sections;
  }

  const adjusted = sections.map((s) => ({ ...s }));
  while (totalChars > maxBudget) {
    let largestIdx = 0;
    for (let i = 1; i < adjusted.length; i++) {
      if (adjusted[i].charCount > adjusted[largestIdx].charCount) {
        largestIdx = i;
      }
    }

    const excess = totalChars - maxBudget;
    const currentLargest = adjusted[largestIdx];
    const cutAmount = Math.min(excess, Math.max(1, Math.floor(currentLargest.charCount * 0.1)));

    const newLen = currentLargest.charCount - cutAmount;
    currentLargest.content = currentLargest.content.substring(0, newLen).trim();
    currentLargest.charCount = currentLargest.content.length;

    totalChars = adjusted.reduce((sum, s) => sum + s.charCount, 0);
  }

  return adjusted;
}

/**
 * Assembles all extracted sections into a formatted text block ready for LLM synthesis.
 */
export function assembleContext(
  ticker: string,
  companyName: string,
  sections: ExtractedSection[]
): string {
  const parts: string[] = [
    `TICKER: ${ticker.toUpperCase()}    COMPANY: ${companyName}    AS OF: ${new Date().toISOString()}`,
    '',
  ];

  for (const s of sections) {
    parts.push(`=== ${s.form} (filed ${s.filingDate}, accession ${s.accessionNumber}) — ${s.title || s.name} ===`);
    parts.push(s.content);
    parts.push('');
  }

  return parts.join('\n').trim();
}

/**
 * Top-level SEC ingestion pipeline:
 * Resolves ticker, downloads recent periodic filings, extracts sections,
 * and packages them according to canonical SecFilingPackage format.
 */
export async function getCompanyFilings(ticker: string): Promise<SecResult> {
  if (!ticker || typeof ticker !== 'string') {
    return { success: false, error: 'Empty ticker symbol' };
  }

  const cleanTicker = ticker.trim().toUpperCase();
  if (!cleanTicker) {
    return { success: false, error: 'Empty ticker symbol' };
  }

  if (cleanTicker.length > 10) {
    return { success: false, error: `Invalid ticker symbol "${cleanTicker}" (symbol exceeds maximum length)` };
  }

  try {
    const cikInfo = await resolveCik(cleanTicker);
    if (!cikInfo) {
      return {
        success: false,
        error: `Unknown ticker "${cleanTicker}" (not found among SEC-registered filers).`,
      };
    }

    const filingsMeta = await getRecentFilingsMetadata(cikInfo.cik, cikInfo.unpaddedCik);

    const filingsFound: SecFilingPackage['filingsFound'] = {
      eightKs: [],
    };

    for (const f of filingsMeta) {
      const filingMetaSummary: CompanyFilingMetadata = {
        form: f.form,
        filingDate: f.filingDate,
        accessionNumber: f.accessionNumber,
        primaryDocument: f.primaryDocument,
        accessionNoDashes: f.accessionNoDashes,
        docUrl: f.docUrl,
        reportDate: f.reportDate,
      };

      if (f.form === '10-K' || f.form === '20-F') {
        if (!filingsFound.tenK) filingsFound.tenK = filingMetaSummary;
      } else if (f.form === '10-Q' || f.form === '6-K') {
        if (!filingsFound.tenQ) filingsFound.tenQ = filingMetaSummary;
      } else if (f.form === '8-K') {
        filingsFound.eightKs.push(filingMetaSummary);
      }
    }

    if (filingsMeta.length === 0) {
      const emptySections: FilingSectionsCollection = [];
      return {
        success: true,
        data: {
          ticker: cleanTicker,
          cik: cikInfo.cik,
          unpaddedCik: cikInfo.unpaddedCik,
          companyName: cikInfo.title,
          filingsFound,
          filings: [],
          sections: emptySections,
          totalContextCharacters: 0,
          totalChars: 0,
          fallbackSamplingUsed: false,
          assembledContext: 'No US periodic filings on record.',
        },
      };
    }

    // Concurrently download and extract text from primary documents
    const docPromises = filingsMeta.map(async (meta) => {
      try {
        const html = await fetchFilingHtml(meta.docUrl);
        const text = htmlToText(html);
        return extractSectionsFromFiling(text, meta);
      } catch (err) {
        console.error(`Error processing filing ${meta.form} (${meta.accessionNumber}):`, err);
        return [];
      }
    });

    const docSectionsArrays = await Promise.all(docPromises);
    const rawSections = docSectionsArrays.flat();

    const fallbackSamplingUsed = rawSections.some((s) => s.isFallback);

    // Enforce strict 60k character budget
    // Note: assembledContext adds headers and separator banners (~500-800 chars).
    // We budget rawSections so that assembledContext is guaranteed <= 60,000 chars.
    let budgetedSections = enforceContextBudget(rawSections, MAX_TOTAL_CONTEXT_BUDGET);
    let assembledContext = assembleContext(cleanTicker, cikInfo.title, budgetedSections);

    if (assembledContext.length > MAX_TOTAL_CONTEXT_BUDGET) {
      const overage = assembledContext.length - MAX_TOTAL_CONTEXT_BUDGET;
      budgetedSections = enforceContextBudget(budgetedSections, MAX_TOTAL_CONTEXT_BUDGET - overage - 100);
      assembledContext = assembleContext(cleanTicker, cikInfo.title, budgetedSections);
      if (assembledContext.length > MAX_TOTAL_CONTEXT_BUDGET) {
        assembledContext = assembledContext.substring(0, MAX_TOTAL_CONTEXT_BUDGET).trim();
      }
    }

    const totalChars = budgetedSections.reduce((sum, s) => sum + s.charCount, 0);

    // Construct hybrid array/collection with named Item accessors
    const sectionsColl: FilingSectionsCollection = [...budgetedSections];

    for (const s of budgetedSections) {
      const filingSec: FilingSection = {
        title: s.title || s.name,
        name: s.name,
        item: s.item || '',
        charCount: s.charCount,
        content: s.content,
        form: s.form,
        filingDate: s.filingDate,
        accessionNumber: s.accessionNumber,
        docUrl: s.docUrl,
        isFallback: s.isFallback,
      };

      if ((s.name?.includes('Item 1.') || s.title?.includes('Item 1.') || s.name?.includes('Item 4.') || s.item === '1' || s.item === '4') && !s.name?.includes('Item 1A')) {
        if (!sectionsColl.item1_business) sectionsColl.item1_business = filingSec;
      } else if (s.name?.includes('Item 1A') || s.title?.includes('Item 1A') || s.name?.includes('Item 3.') || s.name?.toLowerCase().includes('risk') || s.item === '1A' || s.item === '3') {
        if (!sectionsColl.item1a_risk_factors) sectionsColl.item1a_risk_factors = filingSec;
      } else if (s.name?.includes('Item 7.') || s.title?.includes('Item 7.') || s.name?.includes('Item 5.') || s.item === '7' || s.item === '5') {
        if (!sectionsColl.item7_mda) sectionsColl.item7_mda = filingSec;
      } else if (s.name?.includes('Item 2.') || s.title?.includes('Item 2.') || s.item === '2') {
        if (!sectionsColl.item2_tenq_mda) sectionsColl.item2_tenq_mda = filingSec;
      } else if (s.name?.includes('8-K') || s.title?.includes('8-K') || s.item === '8-K') {
        if (!sectionsColl.eightk_narrative) sectionsColl.eightk_narrative = filingSec;
      }
    }

    return {
      success: true,
      data: {
        ticker: cleanTicker,
        cik: cikInfo.cik,
        unpaddedCik: cikInfo.unpaddedCik,
        companyName: cikInfo.title,
        filingsFound,
        filings: filingsMeta,
        sections: sectionsColl,
        totalContextCharacters: totalChars,
        totalChars,
        fallbackSamplingUsed,
        assembledContext,
      },
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: msg };
  }
}

/**
 * Backward compatibility alias for getCompanyFilings.
 */
export const getSecFilings = getCompanyFilings;
