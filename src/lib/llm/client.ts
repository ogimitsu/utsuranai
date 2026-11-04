import Anthropic from "@anthropic-ai/sdk";

/**
 * LLM 呼び出しの唯一の入口。
 * 将来ローカルLLMに差し替えるときは、このディレクトリの中だけを変える。
 */

export const MODELS = {
  /** 教室の一次対応。先生は30秒しか待てない */
  fast: "claude-haiku-5-5",
  /** 履歴の分析、確認ポイントの抽出、購入計画・引継ぎ文書の生成 */
  deep: "claude-sonnet-5-5",
} as const;

let client: Anthropic | null = null;

export function hasApiKey(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export function getClient(): Anthropic {
  if (!hasApiKey()) {
    throw new Error("ANTHROPIC_API_KEY が設定されていません（.env.local）");
  }
  client ??= new Anthropic();
  return client;
}
