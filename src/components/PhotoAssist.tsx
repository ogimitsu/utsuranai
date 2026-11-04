"use client";

import { useRef, useState } from "react";
import type { PhotoReply } from "@/lib/agent/photo";
import type { Symptom } from "@/lib/schema";

/**
 * 「直らない」ときの写真1枚（F5）。
 * 端末側で長辺1024pxのJPEGに縮小してから送る。写真はサーバーに保存されない。
 */
const MAX_EDGE = 1024;

async function shrinkToDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext("2d");
  if (!g) throw new Error("canvas unavailable");
  g.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.8);
}

export function PhotoAssist({
  roomId,
  symptom,
  deviceId,
  tried,
  onResult,
}: {
  roomId: string;
  symptom: Symptom;
  deviceId: string | null;
  tried: string[];
  onResult: (r: PhotoReply) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<PhotoReply | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function onPick(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const image = await shrinkToDataUrl(file);
      const res = await fetch("/api/photo", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ roomId, symptom, deviceId, tried, image }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as PhotoReply;
      setResult(data);
      onResult(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="rounded-2xl border border-dashed border-zinc-300 bg-white p-4">
      {!result && (
        <>
          <p className="text-sm font-semibold">写真を1枚、見てもらう（任意）</p>
          <p className="mt-1 text-sm text-zinc-500">ランプかケーブルの根元を。生徒が写らない向きで。保存はされません。</p>
          <label className="mt-3 block">
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              disabled={busy}
              onChange={(e) => void onPick(e.target.files?.[0])}
            />
            <span
              className={`block rounded-xl border-2 border-zinc-900 px-4 py-3 text-center text-base font-semibold ${
                busy ? "opacity-50" : "active:scale-[0.98]"
              }`}
            >
              {busy ? "見ています…" : "写真を撮る／選ぶ"}
            </span>
          </label>
          {error && <p className="mt-2 text-sm text-red-600">送れませんでした：{error}</p>}
        </>
      )}
      {result && (
        <div className="space-y-2">
          <p className="text-xs text-zinc-400">写真から{result.source === "ai" ? "（AI）" : ""}</p>
          <p className="text-[15px] leading-relaxed">{result.observation}</p>
          <p className="rounded-xl bg-zinc-900 px-3 py-2 text-base font-semibold text-white">→ {result.next_step}</p>
          {result.available && result.confidence !== "high" && (
            <p className="text-xs text-zinc-500">はっきりしない部分があります。試して直らなければ下のボタンへ。</p>
          )}
        </div>
      )}
    </div>
  );
}
