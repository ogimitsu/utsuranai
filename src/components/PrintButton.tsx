"use client";

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white"
    >
      印刷する
    </button>
  );
}
