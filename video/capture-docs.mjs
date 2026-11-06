// 年度末の引継ぎ文書だけを撮り直す（capture.mjs の一部。強調行の選び方を改良）
// 使い方: node video/capture-docs.mjs
import puppeteer from "puppeteer-core";
import fs from "node:fs";
import path from "node:path";

const BASE = "http://localhost:3210";
const OUT = path.resolve("video/frames");
const CHROME = process.env.CHROME ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--lang=ja-JP"] });
try {
  const d = await browser.newPage();
  await d.setViewport({ width: 1280, height: 860, deviceScaleFactor: 1.5 });
  const hide = () => d.evaluate(() => document.querySelectorAll("nextjs-portal").forEach((n) => n.remove()));
  const shot = async (name, opts = {}) => {
    await d.screenshot({ path: path.join(OUT, `${name}.png`), ...opts });
    log("shot", name);
  };
  const hasText = (t) => d.evaluate((t) => document.body.innerText.includes(t), t);

  for (const f of fs.readdirSync(OUT)) if (/^docs-handover-s\d+\.png$/.test(f)) fs.unlinkSync(path.join(OUT, f));

  await d.setCookie({ name: "sim_today", value: "2027-03-31", url: BASE });
  await d.goto(`${BASE}/admin/docs`, { waitUntil: "networkidle0", timeout: 60000 });
  await sleep(300);
  await hide();
  await shot("docs-top");
  await d.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent?.includes("下書きを作る")).click());
  for (let i = 1; i <= 14; i++) {
    await sleep(1500);
    await hide();
    await d.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    const busy = await hasText("止める");
    await shot(`docs-handover-s${String(i).padStart(2, "0")}`);
    if (!busy) break;
  }
  await d.waitForFunction(() => !document.body.innerText.includes("止める"), { timeout: 180000 });
  await sleep(500);
  await hide();
  await d.evaluate(() => window.scrollTo(0, 0));
  await shot("docs-handover-final");
  await shot("docs-handover-full", { fullPage: true });

  const hl = await d.evaluate(() => {
    const art = document.querySelector("article");
    const mark = (el) => {
      el.style.background = "#fef08a";
      el.style.outline = "4px solid #ca8a04";
      el.style.outlineOffset = "4px";
      el.style.borderRadius = "6px";
    };
    // 文書順で最初に「電気科2年」が出る要素（見出し p でも箇条書き li でも）。短い見出しなら直後の箇条書きも強調
    const cands = [...art.querySelectorAll("h3, h4, p, li")].filter((e) => {
      const t = e.textContent ?? "";
      return t.length < 400 && t.includes("電気科2年") && !e.querySelector("ul, ol");
    });
    const head = cands[0];
    if (!head) return null;
    mark(head);
    const picked = [];
    const next = head.nextElementSibling;
    if ((head.textContent ?? "").length < 80 && next && next.tagName === "UL") {
      for (const li of [...next.children].slice(0, 2)) {
        mark(li);
        picked.push(li.textContent);
      }
    }
    head.scrollIntoView({ block: "center" });
    window.scrollBy(0, 160);
    return `${head.textContent} | ${picked.join(" / ")}`;
  });
  log("highlight:", hl);
  await sleep(400);
  await shot("docs-handover-highlight");
  log("done");
} finally {
  await browser.close();
}
