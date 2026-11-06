"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** ICT担当の画面への入口。先生が見る教室ページでは出さない（「連絡ボタン」と誤解させない） */
export function AdminLink() {
  const pathname = usePathname();
  if (pathname.startsWith("/room/")) return null;
  return (
    <Link href="/admin" className="link text-sm">
      ICT担当のページ
    </Link>
  );
}
