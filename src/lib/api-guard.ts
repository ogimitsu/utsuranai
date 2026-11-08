import { z } from "zod";

/**
 * API ルートの入口で使う小さな守り。
 * - IdString: room_id / device_id / incident id の形（英数字・ハイフン・下線、40字まで）
 * - rateLimit: IP ごとの回数制限（プロセス内メモリ。Vercel ではインスタンスごと）
 *
 * 目的は「公開URLに API キーを載せたとき、1人が Claude 呼び出しを使い切る」のを防ぐこと。
 * 校内で使う分には引っかからない回数にしてある。
 */

export const IdString = z.string().regex(/^[\w-]{1,40}$/, "id の形ではありません");

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

function clientKey(request: Request): string {
  const h = request.headers;
  const fwd = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  return fwd || h.get("x-real-ip") || "local";
}

/**
 * 制限内なら null、超えていたら 429 の Response を返す。
 * @param name  ルート名（別々に数える）
 * @param limit windowMs の間に許す回数
 */
export function rateLimit(request: Request, name: string, limit: number, windowMs = 60_000): Response | null {
  const now = Date.now();
  const key = `${name}:${clientKey(request)}`;
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    if (buckets.size > 5000) {
      for (const [k, v] of buckets) if (v.resetAt <= now) buckets.delete(k);
    }
    return null;
  }
  b.count += 1;
  if (b.count <= limit) return null;
  const retry = Math.max(1, Math.ceil((b.resetAt - now) / 1000));
  return Response.json(
    { error: "しばらく待ってからもう一度お試しください" },
    { status: 429, headers: { "retry-after": String(retry) } },
  );
}
