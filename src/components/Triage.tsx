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
]; // 「わからない」は上の「わからない・急いでいる」ボタンが兼ねる
const MAX_ROUNDS = 4;

// 経過時間の計測（イベント内でのみ呼ぶ。描画中には使わない）
const nowMs = () => Date.now();

function CheckIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" aria-hidden="true" className="shrink-0">
      <circle cx="12" cy="12" r="11" fill="#047857" />
      <path d="M7 12.5l3.2 3.2L17 9" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

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
      <section className="space-y-3" aria-labelledby="q-symptom">
        <h2 id="q-symptom" className="text-xl font-bold">
          どうなっていますか？
        </h2>
        <div className="grid grid-cols-2 gap-3">
          {SYMPTOM_ORDER.map((s, i) => (
            <button
              key={s}
              type="button"
              onClick={() => pickSymptom(s)}
              className={`btn btn-primary ${i === 0 ? "col-span-2 min-h-20 text-2xl" : "min-h-16 text-lg"}`}
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
      <section className="card flex items-center gap-3 p-5 text-ink-2" role="status" aria-live="polite">
        <span aria-hidden="true" className="flex gap-1">
          <span className="h-2 w-2 animate-pulse rounded-full bg-accent" />
          <span className="h-2 w-2 animate-pulse rounded-full bg-accent [animation-delay:150ms]" />
          <span className="h-2 w-2 animate-pulse rounded-full bg-accent [animation-delay:300ms]" />
        </span>
        確認しています…
      </section>
    );
  }

  if (phase === "done") {
    return (
      <section className="card space-y-4 border-go/30 bg-go-soft p-5" role="status" aria-live="polite">
        <div className="flex items-start gap-3">
          <CheckIcon />
          <p className="text-lg font-bold text-emerald-900">{doneText}</p>
        </div>
        <button type="button" onClick={() => setPhase("symptom")} className="btn btn-soft btn-sm">
          最初に戻る
        </button>
      </section>
    );
  }

  if (phase === "cause" && reply) {
    return (
      <section className="space-y-3" aria-labelledby="q-cause">
        <h2 id="q-cause" className="text-xl font-bold">
          直ってよかった。原因はどれでしたか？
        </h2>
        <p className="text-sm text-ink-2">1タップで記録されます。次の担当への引継ぎになります。</p>
        <button
          type="button"
          onClick={() => record({ cause_tag: "unknown", resolved: "self" })}
          className="btn btn-outline min-h-14 w-full text-base"
        >
          わからない・急いでいる（そのまま授業に戻る）
        </button>
        <div className="grid grid-cols-2 gap-3">
          {CAUSE_ORDER.map((c) => {
            const likely = reply.suspected_cause === c;
            return (
              <button
                key={c}
                type="button"
                onClick={() => record({ cause_tag: c, resolved: "self" })}
                className={`btn min-h-16 flex-col text-base ${likely ? "btn-go" : "btn-soft"}`}
              >
                {CAUSE_LABEL[c]}
                {likely && <span className="text-xs font-semibold opacity-90">たぶんこれ</span>}
              </button>
            );
          })}
        </div>
      </section>
    );
  }

  // phase === "reply"
  if (!reply || !symptom) return null;

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="chip">{SYMPTOM_LABEL[symptom]}</span>
        <span className="text-xs font-semibold text-muted">{reply.source === "ai" ? "AIの案内" : "手順集の案内"}</span>
      </div>
      {error && (
        <p className="rounded-xl bg-stop-soft px-3 py-2 text-sm font-semibold text-stop" role="alert">
          通信エラー：{error}
        </p>
      )}

      <div className="card p-5">
        <p className="text-[19px] font-bold leading-relaxed">{reply.text}</p>

        {reply.kind === "steps" && reply.steps.length > 0 && (
          <ol className="mt-4 space-y-3">
            {reply.steps.map((s, i) => (
              <li key={i} className="flex gap-3 text-[16px] leading-relaxed">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink text-sm font-bold text-white">
                  {i + 1}
                </span>
                <span>{s}</span>
              </li>
            ))}
          </ol>
        )}

        {reply.kind === "escalate" && reply.spare_hint && (
          <p className="mt-3 rounded-xl bg-warn-soft p-3 font-semibold text-warn">予備機：{reply.spare_hint}</p>
        )}
      </div>

      {reply.kind === "question" && (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-3">
            <button type="button" onClick={() => sendAnswer("はい")} className="btn btn-primary min-h-14 text-lg">
              はい
            </button>
            <button type="button" onClick={() => sendAnswer("いいえ")} className="btn btn-primary min-h-14 text-lg">
              いいえ
            </button>
          </div>
          <button type="button" onClick={() => sendAnswer("わかりません")} className="btn btn-soft w-full text-base">
            わからない
          </button>
        </div>
      )}

      {reply.kind === "steps" && (
        <div className="grid grid-cols-2 gap-3">
          <button type="button" onClick={() => setPhase("cause")} className="btn btn-go min-h-16 text-xl">
            直った
          </button>
          <button type="button" onClick={notFixed} className="btn btn-outline min-h-16 text-xl">
            直らない
          </button>
        </div>
      )}

      {reply.kind !== "escalate" && (
        <div className="rounded-2xl border border-line bg-surface/60 p-3 text-sm">
          {reply.spare_hint && <p className="mb-2 text-ink-2">予備機：{reply.spare_hint}</p>}
          <button type="button" onClick={giveUp} className="btn btn-soft w-full text-base">
            急ぐ → 予備機で続けて、ICT担当に知らせる
          </button>
        </div>
      )}

      {reply.kind === "escalate" && (
        <div className="grid gap-3">
          <button
            type="button"
            onClick={() => record({ ...escalation(), resolved: "spare" })}
            className="btn btn-primary min-h-16 text-lg"
          >
            予備機で続ける（ICT担当に知らせる）
          </button>
          <button
            type="button"
            onClick={() => record({ ...escalation(), resolved: "ticket" })}
            className="btn btn-outline min-h-14 text-base"
          >
            ICT担当に来てもらう
          </button>
          <button
            type="button"
            onClick={() => setPhase("cause")}
            className="btn btn-soft min-h-14 border-go text-base text-go"
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
