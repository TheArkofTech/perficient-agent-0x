import Link from "next/link";

export default function HomePage() {
  const sampleTickers = ["AAPL", "NVDA", "TSLA", "MSFT", "AMZN"];

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 py-16 sm:px-6 lg:px-8">
      <div className="w-full max-w-3xl space-y-8 text-center">
        <div className="space-y-3">
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Next.js 16 App Router · Institutional Engine
          </div>
          <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl lg:text-6xl text-white">
            Advisor <span className="text-emerald-400">Brief</span>
          </h1>
          <p className="mx-auto max-w-xl text-base sm:text-lg text-neutral-400">
            Rapid synthesis of live market quotes and SEC EDGAR periodic filings (10-K, 10-Q, 8-K) for wealth management professionals.
          </p>
        </div>

        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/60 p-6 shadow-2xl backdrop-blur sm:p-8">
          <form action="/brief" method="GET" className="flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <input
                type="text"
                name="ticker"
                placeholder="Enter stock ticker (e.g. AAPL, NVDA)..."
                required
                maxLength={10}
                className="w-full rounded-xl border border-neutral-700 bg-neutral-950/80 px-4 py-3.5 text-neutral-100 placeholder-neutral-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 text-sm font-mono uppercase"
              />
            </div>
            <button
              type="submit"
              className="inline-flex items-center justify-center rounded-xl bg-emerald-500 px-6 py-3.5 text-sm font-semibold text-neutral-950 transition hover:bg-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 focus:ring-offset-neutral-900"
            >
              Generate Brief
            </button>
          </form>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-2 pt-4 border-t border-neutral-800/80">
            <span className="text-xs text-neutral-500 uppercase tracking-wider font-medium mr-2">
              Benchmark Tickers:
            </span>
            {sampleTickers.map((ticker) => (
              <Link
                key={ticker}
                href={`/brief/${ticker}`}
                className="rounded-lg border border-neutral-800 bg-neutral-950/60 px-2.5 py-1 text-xs font-mono font-medium text-neutral-300 hover:border-emerald-500/50 hover:text-emerald-400 transition"
              >
                ${ticker}
              </Link>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 pt-6 sm:grid-cols-3 text-left">
          <div className="rounded-xl border border-neutral-800/80 bg-neutral-900/30 p-4">
            <div className="text-xs font-semibold text-neutral-300">Live Market Quotes</div>
            <div className="mt-1 text-xs text-neutral-500">
              Real-time prices, 52-week ranges, volume, and 1y sparklines via resilient chart feeds.
            </div>
          </div>
          <div className="rounded-xl border border-neutral-800/80 bg-neutral-900/30 p-4">
            <div className="text-xs font-semibold text-neutral-300">SEC EDGAR Ingestion</div>
            <div className="mt-1 text-xs text-neutral-500">
              CIK resolution, submission parsing, and 10-K/10-Q/8-K document retrieval.
            </div>
          </div>
          <div className="rounded-xl border border-neutral-800/80 bg-neutral-900/30 p-4">
            <div className="text-xs font-semibold text-neutral-300">Intelligent Slicing</div>
            <div className="mt-1 text-xs text-neutral-500">
              TOC-resistant extraction of Business (Item 1), Risk (Item 1A), and MD&A (Item 7).
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
