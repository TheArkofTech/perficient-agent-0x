import fs from "fs";
import path from "path";
import { BriefJson } from "@/lib/llm";
import { SecFilingsResult } from "@/types/sec";

export interface CachedBriefRecord {
  ticker: string;
  brief: BriefJson;
  filings: SecFilingsResult;
  isAiGenerated: boolean;
  generatedAt: string;
  cachedAt: number;
}

// In-memory LRU / Map cache for high-speed lookups in warm lambdas
const memoryCache = new Map<string, CachedBriefRecord>();

// Filesystem cache directory in /tmp (survives warm cycles in Vercel)
const TMP_CACHE_DIR = path.join("/tmp", "advisor_brief_cache");

function ensureTmpDir() {
  try {
    if (!fs.existsSync(TMP_CACHE_DIR)) {
      fs.mkdirSync(TMP_CACHE_DIR, { recursive: true });
    }
  } catch {
    // Ignore if directory creation fails in restricted environments
  }
}

/**
 * 24-hour cache TTL: SEC filings only change when new reports are submitted,
 * so generated briefs can be safely remembered for up to 24 hours.
 */
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export function getCachedBrief(ticker: string): CachedBriefRecord | null {
  const key = ticker.trim().toUpperCase();

  // 1. Check in-memory cache first
  const memRecord = memoryCache.get(key);
  if (memRecord) {
    if (Date.now() - memRecord.cachedAt < CACHE_TTL_MS) {
      return memRecord;
    }
    memoryCache.delete(key);
  }

  // 2. Check /tmp filesystem cache
  try {
    const filePath = path.join(TMP_CACHE_DIR, `${key}.json`);
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, "utf-8");
      const record: CachedBriefRecord = JSON.parse(data);
      if (Date.now() - record.cachedAt < CACHE_TTL_MS) {
        // Re-populate memory cache
        memoryCache.set(key, record);
        return record;
      }
    }
  } catch (err) {
    // Ignore cache read failures
  }

  return null;
}

export function setCachedBrief(
  ticker: string,
  brief: BriefJson,
  filings: SecFilingsResult,
  isAiGenerated: boolean
): CachedBriefRecord {
  const key = ticker.trim().toUpperCase();
  const record: CachedBriefRecord = {
    ticker: key,
    brief,
    filings,
    isAiGenerated,
    generatedAt: new Date().toISOString(),
    cachedAt: Date.now(),
  };

  // Save to in-memory map
  memoryCache.set(key, record);

  // Save to /tmp
  try {
    ensureTmpDir();
    const filePath = path.join(TMP_CACHE_DIR, `${key}.json`);
    fs.writeFileSync(filePath, JSON.stringify(record), "utf-8");
  } catch (err) {
    // Ignore /tmp write errors
  }

  return record;
}
