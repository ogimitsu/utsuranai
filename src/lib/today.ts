import { cookies } from "next/headers";

/**
 * 日付シミュレーター。
 * デモで「今日」を動かすため、cookie `sim_today`（YYYY-MM-DD）があればそれを今日として扱う。
 */

export const SIM_COOKIE = "sim_today";

export function realToday(): string {
  // JST で日付を出す（サーバーのタイムゾーンに依存しない）
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export async function getToday(): Promise<string> {
  const store = await cookies();
  const sim = store.get(SIM_COOKIE)?.value;
  return sim && /^\d{4}-\d{2}-\d{2}$/.test(sim) ? sim : realToday();
}

/** 「今日」の時刻つき ISO 文字列（記録用）。シミュレーション中は現在時刻を今日の日付に載せ替える */
export function nowOn(today: string): string {
  const now = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString();
  return `${today}T${now.slice(11, 19)}`;
}

export function isSimulated(today: string): boolean {
  return today !== realToday();
}
