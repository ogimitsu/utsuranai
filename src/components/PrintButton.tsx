"use client";

export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className="btn btn-primary btn-sm">
      印刷する
    </button>
  );
}
