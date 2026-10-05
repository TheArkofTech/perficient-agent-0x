export interface SparklinePoint {
  date: string;
  close: number;
}

export interface SparklineWithHelpers extends Array<SparklinePoint> {
  points: SparklinePoint[];
  close: number[];
  t: number[];
}

export interface QuoteData {
  ticker: string;
  regularMarketPrice: number;
  regularMarketChangePercent: number;
  fiftyTwoWeekHigh: number;
  fiftyTwoWeekLow: number;
  regularMarketVolume: number;
  marketTime: string; // ISO 8601 string
  previousClose: number;
  sparkline: SparklineWithHelpers;

  // Convenience & backward-compatibility aliases for downstream consumers
  price: number;
  symbol: string;
  changePercent: number;
  dayRange: {
    low: number;
    high: number;
  };
  fiftyTwoWeek: {
    low: number;
    high: number;
  };
  volume: number;
  exchange: string;
  timestamp: number;
}

export type QuoteResult =
  | { success: true; data: QuoteData; error?: any; statusCode?: number }
  | { success: false; error: string; statusCode?: number; data?: undefined };
