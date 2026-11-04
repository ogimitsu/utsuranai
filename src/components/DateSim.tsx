"use client";

import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";

/**
 * 日付シミュレーター（デモ用）。
 * 「今日」を動かすと cookie に保存し、サーバー側の getToday() がそれを使う。
 */
export function DateSim({ today, simulated }: { today: string; simulated: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();

  // 先生の画面（教室ページ）では出さない。デモで日付を動かしている間だけ、戻せるように見せる
  if (pathname.startsWith("/room/") && !simulated) return null;

  const set = (value: string | null) => {
    if (value) {
      document.cookie = `sim_today=${value}; path=/; max-age=${60 * 60 * 24 * 30}; samesite=lax`;
    } else {
      document.cookie = "sim_today=; path=/; max-age=0";
    }
    startTransition(() => router.refresh());
  };

  return (
    <label className="flex items-center gap-2 text-sm">
      <span className={simulated ? "font-semibold text-amber-700" : "text-zinc-500"}>
        今日{simulated ? "（仮）" : ""}
      </span>
      <input
        type="date"
        value={today}
        onChange={(e) => set(e.target.value)}
        disabled={pending}
        className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm"
      />
      {simulated && (
        <button type="button" onClick={() => set(null)} className="text-xs text-zinc-500 underline">
          戻す
        </button>
      )}
    </label>
  );
}
