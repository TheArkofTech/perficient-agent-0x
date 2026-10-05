import { QuoteData, QuoteResult, SparklinePoint, SparklineWithHelpers } from '../types/quote';

const YAHOO_HOSTS = [
  'query1.finance.yahoo.com',
  'query2.finance.yahoo.com',
];

const YAHOO_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept':
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.5',
};

interface YahooChartMeta {
  currency?: string;
  symbol?: string;
  exchangeName?: string;
  fullExchangeName?: string;
  instrumentType?: string;
  regularMarketTime?: number;
  regularMarketPrice?: number;
  regularMarketChangePercent?: number;
  fiftyTwoWeekHigh?: number;
  fiftyTwoWeekLow?: number;
  regularMarketDayHigh?: number;
  regularMarketDayLow?: number;
  regularMarketVolume?: number;
  previousClose?: number | null;
  chartPreviousClose?: number | null;
}

interface YahooChartResponse {
  chart?: {
    result?: Array<{
      meta: YahooChartMeta;
      timestamp?: number[];
      indicators?: {
        quote?: Array<{
          open?: Array<number | null>;
          high?: Array<number | null>;
          low?: Array<number | null>;
          close?: Array<number | null>;
          volume?: Array<number | null>;
        }>;
      };
    }> | null;
    error?: {
      code: string;
      description: string;
    } | null;
  };
}

/**
 * Fetches market quote data for a given ticker from Yahoo Finance v8 chart API.
 * Uses query1 with automatic mirror fallback to query2 on network or server errors,
 * sending modern desktop browser headers (Chrome 124+) to avoid ATS edge 429 rate limiting.
 *
 * Normalizes all fields including:
 * - 1-year daily sparkline points ({ date: 'YYYY-MM-DD', close: number })
 * - Fallback hierarchy for previousClose:
 *   meta.previousClose ?? closes[closes.length - 2] ?? (price / (1 + changePct / 100)) ?? meta.chartPreviousClose
 * - ISO string marketTime
 * - Graceful structured error handling for invalid or delisted tickers without throwing exceptions.
 */
export async function getMarketQuote(ticker: string): Promise<QuoteResult> {
  const cleanTicker = (ticker || '').trim().toUpperCase();
  if (!cleanTicker || cleanTicker.length > 15) {
    return {
      success: false,
      error: `Invalid ticker symbol: "${ticker}"`,
      statusCode: 400,
    };
  }

  // Yahoo Finance uses hyphens instead of dots for share classes (e.g. BRK-B, BF-B)
  const queryTicker = cleanTicker.replace(/\./g, '-');
  let lastError = `Failed to fetch quote for ${cleanTicker}`;
  let lastStatusCode: number | undefined;

  for (const host of YAHOO_HOSTS) {
    const url = `https://${host}/v8/finance/chart/${encodeURIComponent(queryTicker)}?interval=1d&range=1y`;
    try {
      const response = await fetch(url, {
        headers: YAHOO_HEADERS,
        signal: AbortSignal.timeout(8000),
      });

      // Handle 404 Not Found (e.g. invalid ticker like ZZZZ99 or delisted company)
      if (response.status === 404) {
        let errorDesc = `Ticker '${cleanTicker}' not found on Yahoo Finance (HTTP 404)`;
        try {
          const errJson: YahooChartResponse = await response.json();
          if (errJson?.chart?.error?.description) {
            errorDesc = errJson.chart.error.description;
          }
        } catch {
          // Ignore JSON parse error on 404
        }
        return {
          success: false,
          error: errorDesc,
          statusCode: 404,
        };
      }

      if (!response.ok) {
        lastError = `Yahoo Finance HTTP ${response.status} from ${host}`;
        lastStatusCode = response.status;
        continue; // Failover to secondary mirror host
      }

      const json: YahooChartResponse = await response.json();

      // Check for structured error payload from Yahoo API
      if (json?.chart?.error) {
        const errorDesc =
          json.chart.error.description ||
          json.chart.error.code ||
          `Yahoo Finance error for ${cleanTicker}`;

        // If symbol is unknown or delisted, do not retry mirror host
        if (
          errorDesc.toLowerCase().includes('not found') ||
          errorDesc.toLowerCase().includes('delisted')
        ) {
          return {
            success: false,
            error: errorDesc,
            statusCode: 404,
          };
        }

        lastError = errorDesc;
        continue; // Retry mirror host for other transient errors
      }

      const result = json?.chart?.result?.[0];
      if (!result || !result.meta) {
        lastError = `No chart data returned for ${cleanTicker} from ${host}`;
        continue;
      }

      const meta = result.meta;
      const timestamps = result.timestamp || [];
      const rawCloses = result.indicators?.quote?.[0]?.close || [];

      // Filter and sanitize sparkline points (pair valid timestamps with non-null close prices)
      const sparklinePoints: SparklinePoint[] = [];
      const validCloses: number[] = [];
      const validTimestamps: number[] = [];
      const count = Math.min(timestamps.length, rawCloses.length);

      for (let i = 0; i < count; i++) {
        const t = timestamps[i];
        const c = rawCloses[i];
        if (
          typeof t === 'number' &&
          !isNaN(t) &&
          typeof c === 'number' &&
          !isNaN(c)
        ) {
          const dateStr = new Date(t * 1000).toISOString().split('T')[0];
          sparklinePoints.push({
            date: dateStr,
            close: c,
          });
          validCloses.push(c);
          validTimestamps.push(t);
        }
      }

      // Determine regularMarketPrice: meta.regularMarketPrice or latest sparkline close
      const regularMarketPrice =
        typeof meta.regularMarketPrice === 'number' &&
        !isNaN(meta.regularMarketPrice)
          ? meta.regularMarketPrice
          : validCloses.length > 0
          ? validCloses[validCloses.length - 1]
          : 0;

      // Determine regularMarketChangePercent
      const regularMarketChangePercent =
        typeof meta.regularMarketChangePercent === 'number' &&
        !isNaN(meta.regularMarketChangePercent)
          ? meta.regularMarketChangePercent
          : 0;

      // Fallback hierarchy for previousClose:
      // 1. meta.previousClose
      // 2. closes[closes.length - 2]
      // 3. (price / (1 + changePct / 100))
      // 4. meta.chartPreviousClose
      // 5. fallback to regularMarketPrice
      let previousClose: number | null = null;

      if (
        typeof meta.previousClose === 'number' &&
        !isNaN(meta.previousClose) &&
        meta.previousClose > 0
      ) {
        previousClose = meta.previousClose;
      }

      if (previousClose === null && validCloses.length >= 2) {
        const candidate = validCloses[validCloses.length - 2];
        if (typeof candidate === 'number' && !isNaN(candidate) && candidate > 0) {
          previousClose = candidate;
        }
      }

      if (
        previousClose === null &&
        regularMarketPrice > 0 &&
        regularMarketChangePercent !== 0
      ) {
        const divisor = 1 + regularMarketChangePercent / 100;
        if (divisor !== 0) {
          previousClose = Number((regularMarketPrice / divisor).toFixed(4));
        }
      }

      if (
        previousClose === null &&
        typeof meta.chartPreviousClose === 'number' &&
        !isNaN(meta.chartPreviousClose) &&
        meta.chartPreviousClose > 0
      ) {
        previousClose = meta.chartPreviousClose;
      }

      if (previousClose === null) {
        previousClose = regularMarketPrice;
      }

      // Determine 52-week high & low without spread operator
      let closesMin = regularMarketPrice;
      let closesMax = regularMarketPrice;
      if (validCloses.length > 0) {
        closesMin = validCloses[0];
        closesMax = validCloses[0];
        for (const val of validCloses) {
          if (val < closesMin) closesMin = val;
          if (val > closesMax) closesMax = val;
        }
      }

      const fiftyTwoWeekHigh =
        typeof meta.fiftyTwoWeekHigh === 'number' &&
        !isNaN(meta.fiftyTwoWeekHigh) &&
        meta.fiftyTwoWeekHigh > 0
          ? meta.fiftyTwoWeekHigh
          : closesMax > 0
          ? closesMax
          : regularMarketPrice;

      const fiftyTwoWeekLow =
        typeof meta.fiftyTwoWeekLow === 'number' &&
        !isNaN(meta.fiftyTwoWeekLow) &&
        meta.fiftyTwoWeekLow > 0
          ? meta.fiftyTwoWeekLow
          : closesMin > 0
          ? closesMin
          : regularMarketPrice;

      // Determine regularMarketVolume
      const regularMarketVolume =
        typeof meta.regularMarketVolume === 'number' &&
        !isNaN(meta.regularMarketVolume)
          ? meta.regularMarketVolume
          : 0;

      // Determine marketTime: format as ISO 8601 string
      const marketTimeSec =
        typeof meta.regularMarketTime === 'number' &&
        !isNaN(meta.regularMarketTime)
          ? meta.regularMarketTime
          : Math.floor(Date.now() / 1000);

      const marketTimeIso = new Date(marketTimeSec * 1000).toISOString();

      // Determine day range
      const dayLow =
        typeof meta.regularMarketDayLow === 'number' &&
        !isNaN(meta.regularMarketDayLow)
          ? meta.regularMarketDayLow
          : regularMarketPrice;

      const dayHigh =
        typeof meta.regularMarketDayHigh === 'number' &&
        !isNaN(meta.regularMarketDayHigh)
          ? meta.regularMarketDayHigh
          : regularMarketPrice;

      const exchange =
        meta.fullExchangeName || meta.exchangeName || 'Unknown';

      // Attach convenience properties to sparkline array for backward-compatibility
      const sparklineWithHelpers: SparklineWithHelpers = Object.assign(sparklinePoints, {
        points: sparklinePoints,
        close: validCloses,
        t: validTimestamps,
      });

      const quoteData: QuoteData = {
        ticker: meta.symbol || cleanTicker,
        regularMarketPrice,
        regularMarketChangePercent,
        fiftyTwoWeekHigh,
        fiftyTwoWeekLow,
        regularMarketVolume,
        marketTime: marketTimeIso,
        previousClose,
        sparkline: sparklineWithHelpers,

        // Compatibility aliases for consumers and verification runners
        price: regularMarketPrice,
        symbol: meta.symbol || cleanTicker,
        changePercent: regularMarketChangePercent,
        dayRange: {
          low: Math.min(dayLow, dayHigh),
          high: Math.max(dayLow, dayHigh),
        },
        fiftyTwoWeek: {
          low: Math.min(fiftyTwoWeekLow, fiftyTwoWeekHigh),
          high: Math.max(fiftyTwoWeekLow, fiftyTwoWeekHigh),
        },
        volume: regularMarketVolume,
        exchange,
        timestamp: marketTimeSec,
      };

      return {
        success: true,
        data: quoteData,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      lastError = `${host}: ${msg}`;
    }
  }

  return {
    success: false,
    error: lastError,
    statusCode: lastStatusCode,
  };
}
