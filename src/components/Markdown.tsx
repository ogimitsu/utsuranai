import type { ReactNode } from "react";

/**
 * 生成文書の表示用、最小の Markdown 描画。
 * 見出し（#〜###）、箇条書き（- / ・ / 1.）、表、段落、**太字** だけ。HTML は解釈しない（安全）。
 */
export function Markdown({ text }: { text: string }) {
  return <div className="space-y-3 text-[15.5px] leading-[1.75]">{parse(text)}</div>;
}

type Row = string[];

const isListLine = (s: string) => /^\s*([-*・]|\d+[.)])\s+/.test(s);
const isHeading = (s: string) => /^(#{1,3})\s/.test(s);

function parse(text: string): ReactNode[] {
  const lines = text.replaceAll("\r\n", "\n").split("\n");
  const out: ReactNode[] = [];
  let i = 0;
  let key = 0;
  const k = () => `b${key++}`;

  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === "") {
      i++;
      continue;
    }
    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    if (h) {
      const level = h[1].length;
      const content = inline(h[2]);
      out.push(
        level === 1 ? (
          <h1 key={k()} className="text-2xl font-bold tracking-tight">
            {content}
          </h1>
        ) : level === 2 ? (
          <h2 key={k()} className="mt-7 border-l-4 border-accent pl-3 text-lg font-bold">
            {content}
          </h2>
        ) : (
          <h3 key={k()} className="mt-4 font-bold text-ink-2">
            {content}
          </h3>
        ),
      );
      i++;
      continue;
    }
    if (line.startsWith("|")) {
      const rows: Row[] = [];
      while (i < lines.length && lines[i].startsWith("|")) {
        const cells = lines[i]
          .trim()
          .replace(/^\|/, "")
          .replace(/\|$/, "")
          .split("|")
          .map((c) => c.trim());
        if (!cells.every((c) => /^:?-{2,}:?$/.test(c))) rows.push(cells);
        i++;
      }
      const [head, ...body] = rows;
      out.push(
        <div key={k()} className="overflow-x-auto rounded-xl border border-line">
          <table className="w-full border-collapse text-sm">
            {head && (
              <thead className="bg-stone-50">
                <tr>
                  {head.map((c, j) => (
                    <th key={j} className="border-b border-line px-3 py-2 text-left font-bold">
                      {inline(c)}
                    </th>
                  ))}
                </tr>
              </thead>
            )}
            <tbody>
              {body.map((r, ri) => (
                <tr key={ri} className="odd:bg-surface even:bg-stone-50/60">
                  {r.map((c, j) => (
                    <td key={j} className="border-b border-line px-3 py-2 align-top">
                      {inline(c)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }
    if (isListLine(line)) {
      const items: ReactNode[] = [];
      const ordered = /^\s*\d+[.)]\s+/.test(line);
      while (i < lines.length && isListLine(lines[i])) {
        const indent = /^(\s*)/.exec(lines[i])?.[1].length ?? 0;
        const content = lines[i].replace(/^\s*([-*・]|\d+[.)])\s+/, "");
        items.push(
          <li key={items.length} className={indent >= 2 ? "ml-5 list-[circle]" : ""}>
            {inline(content)}
          </li>,
        );
        i++;
      }
      out.push(
        ordered ? (
          <ol key={k()} className="list-decimal space-y-1.5 pl-6 marker:font-bold marker:text-muted">
            {items}
          </ol>
        ) : (
          <ul key={k()} className="list-disc space-y-1.5 pl-6 marker:text-accent">
            {items}
          </ul>
        ),
      );
      continue;
    }
    // 段落（空行まで）
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() !== "" && !isHeading(lines[i]) && !lines[i].startsWith("|") && !isListLine(lines[i])) {
      para.push(lines[i]);
      i++;
    }
    out.push(<p key={k()}>{inline(para.join("\n"))}</p>);
  }
  return out;
}

function inline(s: string): ReactNode {
  const parts = s.split(/(\*\*[^*]+\*\*)/g);
  if (parts.length === 1) return s;
  return parts.map((p, j) =>
    p.startsWith("**") && p.endsWith("**") ? <strong key={j}>{p.slice(2, -2)}</strong> : <span key={j}>{p}</span>,
  );
}
