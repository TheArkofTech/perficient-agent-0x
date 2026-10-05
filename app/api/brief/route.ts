import { NextRequest, NextResponse } from "next/server";
import { getMarketQuote } from "@/lib/quote";
import { getCompanyFilings } from "@/lib/sec";
import { generateAdvisorBrief } from "@/lib/llm";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const ticker = searchParams.get("ticker");

  if (!ticker || !ticker.trim()) {
    return NextResponse.json({ error: "Ticker query parameter is required" }, { status: 400 });
  }

  const cleanTicker = ticker.trim().toUpperCase();

  try {
    // Fan out quote and filings concurrently
    const [quoteResult, secResult] = await Promise.allSettled([
      getMarketQuote(cleanTicker),
      getCompanyFilings(cleanTicker),
    ]);

    const quote = quoteResult.status === "fulfilled" && quoteResult.value.success ? quoteResult.value.data : undefined;
    const filings = secResult.status === "fulfilled" && secResult.value.success ? secResult.value.data : undefined;

    if (!quote && !filings) {
      return NextResponse.json(
        { error: `Unable to retrieve quote or SEC filings for ticker "${cleanTicker}". Verify the symbol is a US-listed company.` },
        { status: 404 }
      );
    }

    const briefResult = await generateAdvisorBrief(cleanTicker, quote, filings);
    return NextResponse.json(briefResult);
  } catch (error: any) {
    console.error("API /api/brief error:", error);
    return NextResponse.json(
      { error: error?.message || "Internal server error generating brief" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const ticker = body?.ticker;

    if (!ticker || typeof ticker !== "string") {
      return NextResponse.json({ error: "Missing or invalid 'ticker' in JSON body" }, { status: 400 });
    }

    const cleanTicker = ticker.trim().toUpperCase();
    const [quoteResult, secResult] = await Promise.allSettled([
      getMarketQuote(cleanTicker),
      getCompanyFilings(cleanTicker),
    ]);

    const quote = quoteResult.status === "fulfilled" && quoteResult.value.success ? quoteResult.value.data : undefined;
    const filings = secResult.status === "fulfilled" && secResult.value.success ? secResult.value.data : undefined;

    if (!quote && !filings) {
      return NextResponse.json(
        { error: `Unable to find quote or filings for "${cleanTicker}"` },
        { status: 404 }
      );
    }

    const briefResult = await generateAdvisorBrief(cleanTicker, quote, filings);
    return NextResponse.json(briefResult);
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Internal error" }, { status: 500 });
  }
}
