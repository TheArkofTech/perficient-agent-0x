import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Advisor Brief | Institutional Equity Research",
  description: "Next-generation institutional equity brief platform combining live SEC filings and market quotes.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[#090a0f] text-neutral-100 antialiased selection:bg-emerald-500 selection:text-neutral-950">
        {children}
      </body>
    </html>
  );
}
