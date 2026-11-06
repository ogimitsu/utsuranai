import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { DateSim } from "@/components/DateSim";
import { AdminLink } from "@/components/AdminLink";
import { Mark } from "@/components/Mark";
import { getToday, isSimulated } from "@/lib/today";

export const metadata: Metadata = {
  title: "映らないノート",
  description: "教室ICTサポートエージェント — 先生の一次対応を助け、次のICT担当への引継ぎが自動で溜まる",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const today = await getToday();
  return (
    <html lang="ja" className="h-full antialiased">
      <body className="flex min-h-full flex-col">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-xl focus:bg-ink focus:px-4 focus:py-2 focus:text-white"
        >
          本文へ移動
        </a>
        <header className="border-b border-line bg-surface/90 backdrop-blur print:hidden">
          <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3 px-4 py-2.5">
            <Link href="/" className="flex items-center gap-2.5 rounded-lg" aria-label="映らないノート トップへ">
              <Mark />
              <span className="text-[17px] font-bold tracking-tight">映らないノート</span>
              <span className="hidden text-xs text-muted sm:inline">教室ICTサポート</span>
            </Link>
            <div className="flex items-center gap-3">
              <DateSim today={today} simulated={isSimulated(today)} />
              <AdminLink />
            </div>
          </div>
        </header>
        <div id="main" className="flex-1">
          {children}
        </div>
      </body>
    </html>
  );
}
