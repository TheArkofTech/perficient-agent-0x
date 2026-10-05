import Link from "next/link";
import { getMarketQuote } from "@/lib/quote";
import { getCompanyFilings, resolveTickerOrCompany } from "@/lib/sec";
import { generateAdvisorBrief } from "@/lib/llm";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ ticker: string }>;
}

export default async function BriefDetailPage({ params }: PageProps) {
  const { ticker } = await params;
  const rawInput = decodeURIComponent(ticker || "").trim();

  // 1. Resolve ticker or company name (e.g. "FORD" -> "F", "google" -> "GOOGL")
  const resolved = await resolveTickerOrCompany(rawInput);
  const targetTicker = (resolved?.ticker || rawInput).toUpperCase();
  const matchedAlias = resolved && resolved.ticker !== rawInput.toUpperCase() ? rawInput.toUpperCase() : null;

  // 2. Fetch fresh live quote (always up to the second) and SEC filings
  const [quoteResult, secResult] = await Promise.allSettled([
    getMarketQuote(targetTicker),
    getCompanyFilings(targetTicker),
  ]);

  const quote = quoteResult.status === "fulfilled" && quoteResult.value.success ? quoteResult.value.data : undefined;
  const filings = secResult.status === "fulfilled" && secResult.value.success ? secResult.value.data : undefined;

  // If completely unknown, render a clean search-recovery screen rather than a raw 404
  if (!quote && !filings) {
    return (
      <main className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col items-center justify-center px-4 py-16">
        <div className="w-full max-w-lg space-y-6 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-400">
            Ticker Not Found
          </div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight">
            No filings or quotes for &ldquo;{rawInput}&rdquo;
          </h1>
          <p className="text-sm text-neutral-400">
            We could not resolve an SEC-registered US company or live market quote matching &ldquo;{rawInput}&rdquo;.
          </p>

          <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-4 text-xs text-neutral-400 space-y-2 text-left">
            <span className="font-semibold text-neutral-300">Quick Tips:</span>
            <ul className="list-disc list-inside space-y-1 text-neutral-400">
              <li>Ford Motor Co trades under ticker <span className="font-mono text-emerald-400 font-bold">$F</span></li>
              <li>Boeing trades under ticker <span className="font-mono text-emerald-400 font-bold">$BA</span></li>
              <li>Walt Disney trades under ticker <span className="font-mono text-emerald-400 font-bold">$DIS</span></li>
              <li>Berkshire Hathaway trades under <span className="font-mono text-emerald-400 font-bold">$BRK.B</span></li>
            </ul>
          </div>

          <form action="/brief" method="GET" className="flex gap-2">
            <input
              type="text"
              name="ticker"
              placeholder="Search by ticker (e.g. F, NVDA, AAPL)..."
              required
              className="flex-1 rounded-xl border border-neutral-700 bg-neutral-900 px-4 py-2.5 text-sm text-white placeholder-neutral-500 uppercase font-mono"
            />
            <button
              type="submit"
              className="rounded-xl bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-neutral-950 hover:bg-emerald-400 transition"
            >
              Search
            </button>
          </form>

          <div className="pt-2">
            <Link href="/" className="text-xs text-neutral-500 hover:text-neutral-300 transition">
              ← Return to Advisor Brief Home
            </Link>
          </div>
        </div>
      </main>
    );
  }

  // 3. Generate or retrieve remembered brief (cached) and update with the live quote!
  const { brief, isAiGenerated, generatedAt } = await generateAdvisorBrief(targetTicker, quote, filings);
  const companyName = filings?.companyName || resolved?.title || quote?.ticker || targetTicker;
  const isPositive = quote ? quote.regularMarketChangePercent >= 0 : false;

  // Build SVG sparkline path from daily close points
  const sparklinePoints = quote?.sparkline || [];
  let svgPath = "";
  if (sparklinePoints.length > 1) {
    const closes = sparklinePoints.map((p) => p.close).filter((c) => typeof c === "number" && !isNaN(c));
    const min = Math.min(...closes);
    const max = Math.max(...closes);
    const range = max - min || 1;
    const width = 240;
    const height = 48;
    const pts = closes.map((val, idx) => {
      const x = (idx / (closes.length - 1)) * width;
      const y = height - ((val - min) / range) * (height - 8) - 4;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    svgPath = `M ${pts.join(" L ")}`;
  }

  // Calculate 52-week position percentage
  let fiftyTwoPct = 50;
  if (quote && quote.fiftyTwoWeekHigh > quote.fiftyTwoWeekLow) {
    fiftyTwoPct = Math.min(
      100,
      Math.max(
        0,
        ((quote.regularMarketPrice - quote.fiftyTwoWeekLow) / (quote.fiftyTwoWeekHigh - quote.fiftyTwoWeekLow)) * 100
      )
    );
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 antialiased selection:bg-emerald-500 selection:text-neutral-950">
      {/* Top Navigation */}
      <header className="sticky top-0 z-40 border-b border-neutral-800/80 bg-neutral-950/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-800 bg-neutral-900/80 px-2.5 py-1 text-xs font-medium text-neutral-400 hover:border-neutral-700 hover:text-white transition"
            >
              ← Search
            </Link>
            <span className="text-sm font-bold text-white tracking-tight">Advisor Brief</span>
            <span className="rounded bg-emerald-500/10 px-2 py-0.5 text-[11px] font-mono font-medium text-emerald-400 border border-emerald-500/20">
              LIVE DATA
            </span>
          </div>

          <div className="flex items-center gap-2 text-xs text-neutral-500 font-mono">
            <span>Brief Generated: {new Date(generatedAt).toLocaleTimeString()}</span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 space-y-6">
        {/* Alias resolution alert banner if searched by name */}
        {matchedAlias && (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-xs font-mono text-emerald-300 flex items-center justify-between">
            <span>
              ℹ️ Searched &ldquo;{matchedAlias}&rdquo; → Auto-resolved to NYSE/NASDAQ ticker <strong className="text-white">${targetTicker}</strong> ({companyName})
            </span>
            <span className="text-emerald-400 font-semibold">Active</span>
          </div>
        )}

        {/* Header Block */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-neutral-800/80 pb-6">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-extrabold text-white tracking-tight sm:text-4xl">
                {companyName}
              </h1>
              <span className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1 font-mono text-base font-bold text-emerald-400">
                ${targetTicker}
              </span>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-neutral-400 font-mono">
              {quote?.exchange && <span>Exchange: {quote.exchange}</span>}
              {filings?.cik && <span>· CIK: {filings.cik}</span>}
              <span>· Regulatory Regime: US SEC EDGAR</span>
            </div>
          </div>

          {/* Filing Badges */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-neutral-500 uppercase font-medium">Source Filings:</span>
            {filings?.filings && filings.filings.length > 0 ? (
              filings.filings.map((f, i) => (
                <a
                  key={i}
                  href={f.docUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded border border-neutral-700 bg-neutral-900 px-2.5 py-1 text-xs font-mono text-neutral-300 hover:border-emerald-500 hover:text-emerald-400 transition"
                  title={`View original ${f.form} filed on ${f.filingDate}`}
                >
                  <span className="font-bold text-white">{f.form}</span>
                  <span className="text-neutral-500">({f.filingDate})</span>
                  <span className="text-[10px] text-emerald-400">↗</span>
                </a>
              ))
            ) : (
              <span className="text-xs text-neutral-500 italic">No recent SEC periodic filings</span>
            )}
          </div>
        </div>

        {/* Market Quote Panel (Fresh Live Price) */}
        {quote && (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 rounded-2xl border border-neutral-800 bg-neutral-900/40 p-6 shadow-xl backdrop-blur">
            <div className="space-y-1">
              <div className="text-xs font-medium uppercase tracking-wider text-neutral-500">
                Live Market Price (Updated Now)
              </div>
              <div className="flex items-baseline gap-3">
                <span className="text-4xl font-extrabold font-mono text-white">
                  ${quote.regularMarketPrice.toFixed(2)}
                </span>
                <span
                  className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-mono font-bold ${
                    isPositive ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-red-500/10 text-red-400 border border-red-500/20"
                  }`}
                >
                  {isPositive ? "+" : ""}
                  {quote.regularMarketChangePercent.toFixed(2)}%
                </span>
              </div>
              <div className="text-xs text-neutral-500 font-mono pt-1">
                Prev Close: ${quote.previousClose.toFixed(2)} · Vol: {quote.regularMarketVolume.toLocaleString()}
              </div>
            </div>

            {/* 52-Week Channel */}
            <div className="space-y-2">
              <div className="text-xs font-medium uppercase tracking-wider text-neutral-500">52-Week Range</div>
              <div className="flex items-center justify-between text-xs font-mono text-neutral-300">
                <span>${quote.fiftyTwoWeekLow.toFixed(2)}</span>
                <span className="text-neutral-500">Position ({fiftyTwoPct.toFixed(0)}%)</span>
                <span>${quote.fiftyTwoWeekHigh.toFixed(2)}</span>
              </div>
              <div className="relative h-2 w-full overflow-hidden rounded-full bg-neutral-800">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-emerald-500/60 to-emerald-400"
                  style={{ width: `${fiftyTwoPct}%` }}
                />
              </div>
            </div>

            {/* Sparkline Chart */}
            <div className="flex flex-col justify-center items-start lg:items-end">
              <div className="text-xs font-medium uppercase tracking-wider text-neutral-500 pb-1">1-Year Price Trend</div>
              {svgPath ? (
                <svg width="240" height="48" className="overflow-visible">
                  <path d={svgPath} fill="none" stroke={isPositive ? "#34d399" : "#f87171"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : (
                <span className="text-xs text-neutral-600">Trend data unavailable</span>
              )}
            </div>
          </div>
        )}

        {/* 60-Second Plain English Payoff */}
        <section className="rounded-2xl border border-emerald-500/30 bg-emerald-950/20 p-6 sm:p-7 shadow-lg">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-emerald-400 mb-2">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            60-Second Executive Synthesis (Remembered Brief + Live Stock Price)
          </div>
          <p className="text-base sm:text-lg leading-relaxed text-neutral-200">
            {brief.plainEnglishSummary}
          </p>
        </section>

        {/* Advisor Talking Points Card */}
        <section className="rounded-2xl border border-neutral-800 bg-neutral-900/60 p-6 sm:p-7">
          <div className="text-xs font-bold uppercase tracking-wider text-neutral-400 mb-3">
            Client Meeting Talking Points
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {brief.advisorTalkingPoints.map((pt, i) => (
              <div key={i} className="rounded-xl border border-neutral-800/80 bg-neutral-950/50 p-4 space-y-1.5">
                <span className="inline-block rounded bg-neutral-800 px-1.5 py-0.5 text-[10px] font-mono text-emerald-400 font-bold">
                  POINT 0{i + 1}
                </span>
                <p className="text-xs leading-relaxed text-neutral-300">{pt}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Detailed Sections Grid */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {/* Business Snapshot */}
          <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-6 space-y-3">
            <div className="flex items-center justify-between border-b border-neutral-800/80 pb-2">
              <h2 className="text-sm font-bold uppercase tracking-wider text-white">Business Operations (Item 1)</h2>
              <span className="text-[11px] font-mono text-neutral-500">10-K / 20-F</span>
            </div>
            <p className="text-xs sm:text-sm leading-relaxed text-neutral-300">
              {brief.companySnapshot}
            </p>
          </div>

          {/* Key Risk Factors */}
          <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-6 space-y-3">
            <div className="flex items-center justify-between border-b border-neutral-800/80 pb-2">
              <h2 className="text-sm font-bold uppercase tracking-wider text-white">Material Risk Factors (Item 1A)</h2>
              <span className="text-[11px] font-mono text-neutral-500">10-K / 20-F</span>
            </div>
            <ul className="space-y-2 text-xs sm:text-sm text-neutral-300">
              {brief.keyRiskFactors.map((risk, idx) => (
                <li key={idx} className="flex items-start gap-2">
                  <span className="text-red-400 mt-0.5 font-mono">⚠️</span>
                  <span>{risk}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Financial Narrative */}
          <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-6 space-y-3">
            <div className="flex items-center justify-between border-b border-neutral-800/80 pb-2">
              <h2 className="text-sm font-bold uppercase tracking-wider text-white">MD&A Narrative (Item 7 / Item 2)</h2>
              <span className="text-[11px] font-mono text-neutral-500">Periodic MD&A</span>
            </div>
            <p className="text-xs sm:text-sm leading-relaxed text-neutral-300">
              {brief.financialNarrative}
            </p>
          </div>

          {/* Management Outlook & Recent Events */}
          <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-6 space-y-3">
            <div className="flex items-center justify-between border-b border-neutral-800/80 pb-2">
              <h2 className="text-sm font-bold uppercase tracking-wider text-white">Recent Events & Outlook</h2>
              <span className="text-[11px] font-mono text-neutral-500">8-K / Current</span>
            </div>
            <div className="space-y-2 text-xs sm:text-sm text-neutral-300">
              <p>{brief.managementOutlook}</p>
              {brief.recentMaterialEvents.length > 0 && (
                <div className="pt-2 border-t border-neutral-800/60">
                  <span className="text-xs font-semibold text-neutral-400">8-K Disclosures:</span>
                  {brief.recentMaterialEvents.map((ev, i) => (
                    <p key={i} className="mt-1 text-xs text-neutral-400 italic">“{ev}”</p>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Pipeline Step Status Strip */}
        <section className="rounded-xl border border-neutral-800 bg-neutral-950 p-4">
          <div className="text-[11px] font-mono uppercase tracking-wider text-neutral-500 mb-2">
            Deterministic Pipeline Execution Trace
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
            <div className="rounded border border-neutral-800/80 bg-neutral-900/40 p-2.5">
              <div className="text-emerald-400 font-semibold">✓ CIK Resolved</div>
              <div className="text-neutral-500 text-[10px] mt-0.5">{filings?.cik || resolved?.cik || "N/A"}</div>
            </div>
            <div className="rounded border border-neutral-800/80 bg-neutral-900/40 p-2.5">
              <div className="text-emerald-400 font-semibold">✓ Live Quote</div>
              <div className="text-neutral-500 text-[10px] mt-0.5">${quote?.regularMarketPrice.toFixed(2) || "N/A"}</div>
            </div>
            <div className="rounded border border-neutral-800/80 bg-neutral-900/40 p-2.5">
              <div className="text-emerald-400 font-semibold">✓ Filings Sliced</div>
              <div className="text-neutral-500 text-[10px] mt-0.5">{filings?.sections?.length || 0} items extracted</div>
            </div>
            <div className="rounded border border-neutral-800/80 bg-neutral-900/40 p-2.5">
              <div className="text-emerald-400 font-semibold">✓ Context Capped</div>
              <div className="text-neutral-500 text-[10px] mt-0.5">{filings?.totalChars || 0} / 60,000 chars</div>
            </div>
          </div>
        </section>

        {/* Compliance Disclaimer Bar */}
        <footer className="rounded-xl border border-neutral-800/60 bg-neutral-900/20 px-4 py-3 text-center text-xs text-neutral-500">
          Synthesized from public SEC EDGAR periodic filings and public market feeds for equity research and advisor onboarding only. Not investment advice or an offer to buy or sell securities.
        </footer>
      </main>
    </div>
  );
}
