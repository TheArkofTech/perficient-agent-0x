import { redirect } from "next/navigation";

export default async function BriefRedirectPage({
  searchParams,
}: {
  searchParams: Promise<{ ticker?: string }>;
}) {
  const params = await searchParams;
  const ticker = params.ticker?.trim().toUpperCase();

  if (ticker) {
    redirect(`/brief/${encodeURIComponent(ticker)}`);
  }

  redirect("/");
}
