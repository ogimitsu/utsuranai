"use client";

import { useRef, useState } from "react";
import {
  CAUSE_LABEL,
  SYMPTOM_LABEL,
  type CauseTag,
  type Symptom,
} from "@/lib/schema";
import type { TriageReply, ChatMessage } from "@/lib/agent/triage";
import type { PhotoReply } from "@/lib/agent/photo";
import { PhotoAssist } from "./PhotoAssist";

/**
 * 教室の一次対応フロー（スマホ優先）。
 * 症状チップ → （最大2問）→ 手順 → 直った（原因1タップで記録）／直らない（予備機＋チケット）
 */

type Phase = "symptom" | "thinking" | "reply" | "cause" | "done";

const SYMPTOM_ORDER: Symptom[] = ["no_image", "no_sound", "no_response", "flicker", "noise", "other"];
const CAUSE_ORDER: CauseTag[] = [
  "input_select",
  "cable",
  "battery_remote",
  "settings",
  "power",
  "network",
  "device_fault",
  "unknown",
];
const MAX_ROUNDS = 4;

// 経過時間の計測（イベント内でのみ呼ぶ。描画中には使わない）
const nowMs = () => Date.now();

export function Triage({
  roomId,
  mainDeviceId,
  photoEnabled,
}: {
  roomId: string;
  mainDeviceId: string | null;
  photoEnabled: boolean;
}) {
  const [phase, setPhase] = useState<Phase>("symptom");
  const [symptom, setSymptom] = useState<Symptom | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [reply, setReply] = useState<TriageReply | null>(null);
  const [rounds, setRounds] = useState(0);
  const [doneText, setDoneText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [photo, setPhoto] = useState<PhotoReply | null>(null);
  const [tried, setTried] = useState<string[]>([]);
  const startedAt = useRef<number>(0);

  const minutesElapsed = () => Math.max(1, Math.round((nowMs() - startedAt.current) / 60000));

  async function ask(sym: Symptom, history: ChatMessage[]) {
    setPhase("thinking");
    setError(null);
    try {
      const res = await fetch("/api/triage", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ roomId, symptom: sym, messages: history }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as TriageReply;
      setReply(data);
      setRounds((r) => r + 1);
      setPhase("reply");
    } catch (e) {
      setError((e as Error).message);
      setPhase("reply");
      setReply({
        kind: "escalate",
        text: "つながりませんでした。下の「この教室のメモ」を試し、だめならICT担当に知らせてください。",
        steps: [],
        source: "playbook",
      });
    }
  }

  function pickSymptom(sym: Symptom) {
    startedAt.current = nowMs();
    setSymptom(sym);
    setMessages([]);
    setReply(null);
    setRounds(0);
    setPhoto(null);
    setTried([]);
    void ask(sym, []);
  }

  function sendAnswer(text: string) {
    if (!symptom || !reply) return;
    const history: ChatMessage[] = [
      ...messages,
      { role: "assistant", text: reply.text },
      { role: "user", text },
    ];
    setMessages(history);
    void ask(symptom, history);
  }

  function notFixed() {
    if (!symptom || !reply) return;
    if (rounds >= MAX_ROUNDS) {
      setReply({ ...reply, kind: "escalate", text: "ここまでで直らなければ、ICT担当に引き継ぎます。" });
      return;
    }
    if (reply.steps.length) setTried((t) => [...t, ...reply.steps]);
    const msg = reply.steps.length ? `手順（${reply.steps.join("／")}）を試しましたが直りません。` : "試しましたが直りません。";
    sendAnswer(msg);
  }

  async function record(body: {
    cause_tag: CauseTag;
    resolved: "self" | "spare" | "ticket";
    note?: string;
  }) {
    if (!symptom) return;
    setPhase("thinking");
    try {
      const res = await fetch("/api/incidents", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          roomId,
          deviceId: reply?.device_id ?? mainDeviceId,
          symptom,
          cause_tag: body.cause_tag,
          resolved: body.resolved,
          resolved_by: "teacher",
          minutes_lost: minutesElapsed(),
          note: body.note,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setDoneText(
        body.resolved === "self"
          ? "記録しました。授業に戻ってください。"
          : body.resolved === "spare"
            ? "ICT担当に知らせました。予備機で授業を続けてください。"
            : "ICT担当に知らせました。手が空き次第うかがいます。",
      );
      setPhase("done");
    } catch (e) {
      setError((e as Error).message);
      setPhase("reply");
    }
  }

  /** 途中でも、いつでも引き継げる出口 */
  function giveUp() {
    if (!reply) return;
    setReply({ ...reply, kind: "escalate", text: "ICT担当に引き継ぎます。", steps: [] });
  }

  /** 引き継ぐときの原因と添え書き。写真の所見があればそれを優先する */
  function escalation(): { cause_tag: CauseTag; note?: string } {
    const cause = (photo?.available && photo.suspected_cause) || reply?.suspected_cause || "unknown";
    const note = photo?.available ? `写真所見：${photo.observation}`.slice(0, 300) : undefined;
    return { cause_tag: cause, note };
  }

  // --- 画面 ---

  if (phase === "symptom") {
    return (
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">どうなっていますか？</h2>
        <div className="grid grid-cols-2 gap-3">
          {SYMPTOM_ORDER.map((s, i) => (
            <button
              key={s}
              type="button"
              onClick={() => pickSymptom(s)}
              className={`rounded-2xl bg-zinc-900 px-4 font-semibold text-white active:scale-[0.98] ${
                i === 0 ? "col-span-2 py-6 text-2xl" : "py-5 text-lg"
              }`}
            >
              {SYMPTOM_LABEL[s]}
            </button>
          ))}
        </div>
      </section>
    );
  }

  if (phase === "thinking") {
    return (
      <section className="rounded-2xl border border-zinc-200 p-5 text-zinc-600">
        確認しています…
      </section>
    );
  }

  if (phase === "done") {
    return (
      <section className="space-y-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
        <p className="text-lg font-semibold text-emerald-900">{doneText}</p>
        <button
          type="button"
          onClick={() => setPhase("symptom")}
          className="rounded-xl border border-zinc-300 bg-white px-4 py-2 text-sm"
        >
          最初に戻る
        </button>
      </section>
    );
  }

  if (phase === "cause" && reply) {
    return (
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">直ってよかった。原因はどれでしたか？</h2>
        <p className="text-sm text-zinc-500">1タップで記録されます。次の担当への引継ぎになります。</p>
        <button
          type="button"
          onClick={() => record({ cause_tag: "unknown", resolved: "self" })}
          className="w-full rounded-2xl border-2 border-zinc-300 bg-white px-4 py-4 text-base font-semibold text-zinc-700"
        >
          わからない・急いでいる（そのまま授業に戻る）
        </button>
        <div className="grid grid-cols-2 gap-3">
          {CAUSE_ORDER.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => record({ cause_tag: c, resolved: "self" })}
              className={`rounded-2xl px-4 py-4 text-base font-semibold active:scale-[0.98] ${
                reply.suspected_cause === c
                  ? "bg-emerald-600 text-white"
                  : "border border-zinc-300 bg-white text-zinc-900"
              }`}
            >
              {CAUSE_LABEL[c]}
              {reply.suspected_cause === c && <span className="block text-xs font-normal">たぶんこれ</span>}
            </button>
          ))}
        </div>
      </section>
    );
  }

  // phase === "reply"
  if (!reply || !symptom) return null;

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="rounded-full bg-zinc-100 px-3 py-1 text-sm">{SYMPTOM_LABEL[symptom]}</span>
        <span className="text-xs text-zinc-400">{reply.source === "ai" ? "AI" : "手順集"}</span>
      </div>
      {error && <p className="text-sm text-red-600">通信エラー：{error}</p>}

      <div className="rounded-2xl border border-zinc-200 bg-white p-5">
        <p className="text-lg font-semibold leading-relaxed">{reply.text}</p>

        {reply.kind === "steps" && reply.steps.length > 0 && (
          <ol className="mt-4 space-y-3">
            {reply.steps.map((s, i) => (
              <li key={i} className="flex gap-3 text-base leading-relaxed">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-sm font-bold text-white">
                  {i + 1}
                </span>
                <span>{s}</span>
              </li>
            ))}
          </ol>
        )}

        {reply.kind === "escalate" && reply.spare_hint && (
          <p className="mt-3 rounded-xl bg-amber-50 p-3 text-amber-900">{reply.spare_hint}</p>
        )}
      </div>

      {reply.kind === "question" && (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => sendAnswer("はい")}
              className="rounded-2xl bg-zinc-900 px-4 py-4 text-lg font-semibold text-white"
            >
              はい
            </button>
            <button
              type="button"
              onClick={() => sendAnswer("いいえ")}
              className="rounded-2xl bg-zinc-900 px-4 py-4 text-lg font-semibold text-white"
            >
              いいえ
            </button>
          </div>
          <button
            type="button"
            onClick={() => sendAnswer("わかりません")}
            className="w-full rounded-2xl border-2 border-zinc-300 bg-white px-4 py-3 text-base font-semibold text-zinc-700"
          >
            わからない
          </button>
        </div>
      )}


      {reply.kind === "steps" && (
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setPhase("cause")}
            className="rounded-2xl bg-emerald-600 px-4 py-5 text-lg font-semibold text-white"
          >
            直った
          </button>
          <button
            type="button"
            onClick={notFixed}
            className="rounded-2xl border-2 border-zinc-900 px-4 py-5 text-lg font-semibold"
          >
            直らない
          </button>
        </div>
      )}

      {reply.kind !== "escalate" && (
        <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3 text-sm">
          {reply.spare_hint && <p className="mb-2 text-zinc-600">{reply.spare_hint}</p>}
          <button
            type="button"
            onClick={giveUp}
            className="w-full rounded-xl border border-zinc-400 bg-white px-4 py-3 text-base font-semibold"
          >
            急ぐ → 予備機で続けて、ICT担当に知らせる
          </button>
        </div>
      )}

      {reply.kind === "escalate" && (
        <div className="grid gap-3">
          <button
            type="button"
            onClick={() => record({ ...escalation(), resolved: "spare" })}
            className="rounded-2xl bg-zinc-900 px-4 py-5 text-lg font-semibold text-white"
          >
            予備機で授業を続ける（ICT担当に知らせる）
          </button>
          <button
            type="button"
            onClick={() => record({ ...escalation(), resolved: "ticket" })}
            className="rounded-2xl border-2 border-zinc-900 px-4 py-4 text-base font-semibold"
          >
            ICT担当に来てもらう
          </button>
          <button
            type="button"
            onClick={() => setPhase("cause")}
            className="rounded-2xl border-2 border-emerald-600 px-4 py-4 text-base font-semibold text-emerald-700"
          >
            いま直った
          </button>
          {photoEnabled && (
            <PhotoAssist
              roomId={roomId}
              symptom={symptom}
              deviceId={reply.device_id ?? mainDeviceId}
              tried={tried}
              onResult={setPhoto}
            />
          )}
        </div>
      )}
    </section>
  );
}
