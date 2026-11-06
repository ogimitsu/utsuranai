"use client";

import { useEffect, useRef, useState } from "react";
import { Markdown } from "@/components/Markdown";

/**
 * 書類の生成画面（ICT担当向け）。
 * 種類を選んで「下書きを作る」→ 文字がストリーミングで流れてくる → コピー／保存。
 */

export type DocKindOption = { kind: string; label: string; desc: string };
export type RepairTarget = { id: string; label: string };

const nowMs = () => Date.now();

export function DocStudio({
  kinds,
  repairTargets,
  hasKey,
  today,
}: {
  kinds: DocKindOption[];
  repairTargets: RepairTarget[];
  hasKey: boolean;
  today: string;
}) {
  const [kind, setKind] = useState(kinds[0]?.kind ?? "handover");
  const [deviceId, setDeviceId] = useState(repairTargets[0]?.id ?? "");
  const [text, setText] = useState("");
  const [source, setSource] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [copied, setCopied] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!busy) return;
    const start = nowMs();
    const id = setInterval(() => setElapsed(Math.round((nowMs() - start) / 1000)), 500);
    return () => clearInterval(id);
  }, [busy]);

  async function generate() {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setBusy(true);
    setText("");
    setSource(null);
    setElapsed(0);
    try {
      const res = await fetch("/api/documents", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind, deviceId: kind === "repair" ? deviceId || null : null }),
        signal: ac.signal,
      });
      setSource(res.headers.get("x-doc-source"));
      if (!res.ok || !res.body) {
        setText(`生成に失敗しました（${res.status}）`);
        return;
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = dec.decode(value, { stream: true });
        setText((t) => t + chunk);
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") setText((t) => `${t}\n\n（通信が中断しました）`);
    } finally {
      setBusy(false);
    }
  }

  function stop() {
    abortRef.current?.abort();
  }

  async function copy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function download() {
    const label = kinds.find((x) => x.kind === kind)?.label ?? kind;
    const blob = new Blob([text], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${label}_${today}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-2.5 sm:grid-cols-3" role="group" aria-label="書類の種類">
        {kinds.map((x) => {
          const on = kind === x.kind;
          return (
            <button
              key={x.kind}
              type="button"
              aria-pressed={on}
              onClick={() => setKind(x.kind)}
              className={`card p-4 text-left transition-colors ${on ? "border-ink bg-ink text-white" : "hover:border-ink"}`}
            >
              <p className="font-bold">{x.label}</p>
              <p className={`mt-1 text-xs leading-relaxed ${on ? "text-stone-300" : "text-muted"}`}>{x.desc}</p>
            </button>
          );
        })}
      </div>

      {kind === "repair" && repairTargets.length > 0 && (
        <label className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted">対象の機器</span>
          <select
            value={deviceId}
            onChange={(e) => setDeviceId(e.target.value)}
            className="min-h-10 rounded-lg border border-line-strong bg-surface px-2.5"
          >
            {repairTargets.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
      )}

      <div className="flex flex-wrap items-center gap-3">
        {busy ? (
          <button type="button" onClick={stop} className="btn btn-soft">
            止める
          </button>
        ) : (
          <button type="button" onClick={generate} className="btn btn-primary">
            {text ? "作り直す" : "下書きを作る"}
          </button>
        )}
        <span className="text-sm text-ink-2" role="status" aria-live="polite">
          {busy
            ? `${today} 時点の記録から書いています… ${elapsed}秒`
            : hasKey
              ? "Sonnet が記録だけを材料に書きます（数字は集計値をそのまま使います）"
              : "APIキーが無いため、集計値から雛形を組み立てます（手順集モード）"}
        </span>
      </div>

      {text && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className={`chip ${source === "ai" ? "chip-go" : ""}`}>
              {source === "ai" ? "AI生成（Sonnet）" : source === "template" ? "手順集モード（AIなし）" : "生成中"}
            </span>
            <button type="button" onClick={copy} className="link">
              {copied ? "コピーしました" : "コピー"}
            </button>
            <button type="button" onClick={download} className="link">
              .md で保存
            </button>
            <span className="text-muted">下書きです。送る前に目を通してください。</span>
          </div>
          <article className="card p-6 sm:p-8">
            <Markdown text={text} />
            {busy && <span className="ml-1 inline-block h-4 w-2 animate-pulse bg-stone-400 align-middle" aria-hidden="true" />}
          </article>
        </section>
      )}
    </div>
  );
}
