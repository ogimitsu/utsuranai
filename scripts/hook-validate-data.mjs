// Claude Code の PostToolUse フック。
// Write/Edit の対象が data/*.json のときだけ、スキーマ検証を走らせる。
// 失敗したら exit 2 で Claude に結果を返し、その場で直させる。
import { execFileSync } from "node:child_process";

let raw = "";
process.stdin.setEncoding("utf8");
for await (const chunk of process.stdin) raw += chunk;

let filePath = "";
try {
  const payload = JSON.parse(raw);
  filePath = payload?.tool_input?.file_path ?? "";
} catch {
  process.exit(0);
}

const normalized = filePath.replaceAll("\\", "/");
if (!/\/data\/[^/]+\.json$/.test(normalized)) process.exit(0);

try {
  const out = execFileSync(process.execPath, ["scripts/validate-data.ts"], {
    cwd: process.env.CLAUDE_PROJECT_DIR ?? process.cwd(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  process.stdout.write(out.trim().split("\n").slice(-2).join("\n"));
  process.exit(0);
} catch (e) {
  const err = e;
  process.stderr.write(`data の検証に失敗しました。直してください。\n${err.stdout ?? ""}${err.stderr ?? ""}`);
  process.exit(2);
}
