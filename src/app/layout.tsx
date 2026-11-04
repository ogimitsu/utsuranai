import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { DateSim } from "@/components/DateSim";
import { AdminLink } from "@/components/AdminLink";
import { getToday, isSimulated } from "@/lib/today";

export const metadata: Metadata = {
  title: "映らないノート",
  description: "教室ICTサポートエージェント — 先生の一次対応を助け、次のICT担当への引継ぎが自動で溜まる",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const today = await getToday();
  return (
    <html lang="ja" className="h-full antialiased">
      <body className="flex min-h-full flex-col bg-zinc-50 text-zinc-900">
        <div className="border-b border-zinc-200 bg-white print:hidden">
          <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3 px-4 py-2">
            <Link href="/" className="font-bold">
              映らないノート
            </Link>
            <div className="flex items-center gap-4">
              <DateSim today={today} simulated={isSimulated(today)} />
              <AdminLink />
            </div>
          </div>
        </div>
        {children}
      </body>
    </html>
  );
}
