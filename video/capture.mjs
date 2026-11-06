// デモ動画用の画面キャプチャ（開発サーバー http://localhost:3210 に対して実行）
// 使い方: node video/capture.mjs
// 注意: 一次対応の記録・提案の承認／却下を本当に実行するので、終わったら data/*.json を git で戻すこと
import puppeteer from "puppeteer-core";
import fs from "node:fs";
import path from "node:path";

const BASE = "http://localhost:3210";
const OUT = path.resolve("video/frames");
const CHROME = process.env.CHROME ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
fs.mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

async function shot(page, name, opts = {}) {
  const file = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: file, ...opts });
  log("shot", name);
}

async function hideDevOverlay(page) {
  await page.evaluate(() => document.querySelectorAll("nextjs-portal").forEach((n) => n.remove()));
}

/** テキストを含むボタンをクリック */
async function clickText(page, text, tag = "button") {
  const ok = await page.evaluate(
    (text, tag) => {
      const els = [...document.querySelectorAll(tag)];
      const el = els.find((e) => (e.textContent ?? "").includes(text));
      if (!el) return false;
      el.click();
      return true;
    },
    text,
    tag,
  );
  if (!ok) throw new Error(`button not found: ${text}`);
}

async function hasText(page, text) {
  return page.evaluate((t) => document.body.innerText.includes(t), text);
}

/** そのテキストのボタンがあるか（本文に同じ語が出ても誤検知しない） */
async function hasButton(page, text) {
  return page.evaluate((t) => [...document.querySelectorAll("button")].some((b) => (b.textContent ?? "").trim() === t), text);
}

async function waitTriage(page) {
  await page.waitForFunction(() => !document.body.innerText.includes("確認しています"), { timeout: 60000 });
  await sleep(300);
  await hideDevOverlay(page);
}

async function gotoWait(page, url) {
  await page.goto(url, { waitUntil: "networkidle0", timeout: 60000 });
  await sleep(300);
  await hideDevOverlay(page);
}

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--lang=ja-JP"] });
try {
  // ---------- スマホ（先生） ----------
  const m = await browser.newPage();
  await m.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });

  await gotoWait(m, `${BASE}/room/r-e2`);
  await shot(m, "room-e2-top");
  await shot(m, "room-e2-full", { fullPage: true });

  // 質問→手順 の流れが出るまで最大3回試す
  let gotQuestion = false;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await gotoWait(m, `${BASE}/room/r-e2`);
    await clickText(m, "映らない");
    await waitTriage(m);
    if (await hasButton(m, "いいえ")) {
      gotQuestion = true;
      break;
    }
    log("steps came first (attempt", attempt + 1, ")");
  }
  if (gotQuestion) {
    await shot(m, "room-e2-question");
    await clickText(m, "いいえ");
    await waitTriage(m);
    // まれにもう1問
    if (await hasButton(m, "いいえ")) {
      await clickText(m, "わからない");
      await waitTriage(m);
    }
  }
  await shot(m, "room-e2-steps");
  await shot(m, "room-e2-steps-full", { fullPage: true });

  await clickText(m, "直った");
  await sleep(400);
  await hideDevOverlay(m);
  await shot(m, "room-e2-cause");
  await clickText(m, "ケーブル・アダプタ");
  await m.waitForFunction(() => document.body.innerText.includes("記録しました"), { timeout: 30000 });
  await sleep(300);
  await hideDevOverlay(m);
  await shot(m, "room-e2-done");

  // 直らない → 予備機
  await gotoWait(m, `${BASE}/room/r-e2`);
  await clickText(m, "映らない");
  await waitTriage(m);
  await clickText(m, "急ぐ");
  await sleep(500);
  await hideDevOverlay(m);
  await shot(m, "room-e2-escalate");
  await shot(m, "room-e2-escalate-full", { fullPage: true });
  await clickText(m, "予備機で続ける");
  await m.waitForFunction(() => document.body.innerText.includes("知らせました"), { timeout: 30000 });
  await sleep(300);
  await hideDevOverlay(m);
  await shot(m, "room-e2-spare-done");

  // ---------- PC（ICT担当） ----------
  const d = await browser.newPage();
  await d.setViewport({ width: 1280, height: 860, deviceScaleFactor: 1.5 });

  await gotoWait(d, `${BASE}/admin`);
  await shot(d, "admin-top");
  await shot(d, "admin-full", { fullPage: true });

  const proposalsSel = async () => {
    const h = await d.evaluateHandle(() => {
      const h2 = [...document.querySelectorAll("h2")].find((e) => e.textContent?.includes("確認ポイントの提案"));
      return h2?.closest("section") ?? null;
    });
    return h.asElement();
  };
  let sec = await proposalsSel();
  await sec.screenshot({ path: path.join(OUT, "admin-proposals.png") });
  log("shot admin-proposals");

  // 承認：機械科3年
  const beforeCount = await d.evaluate(() => document.querySelectorAll("li button").length);
  await d.evaluate(() => {
    const li = [...document.querySelectorAll("li")].find((e) => e.textContent?.includes("機械科3年"));
    const btn = [...li.querySelectorAll("button")].find((b) => b.textContent?.includes("承認"));
    btn.click();
  });
  await d.waitForFunction((n) => document.querySelectorAll("li button").length < n, { timeout: 30000 }, beforeCount);
  await sleep(500);
  await hideDevOverlay(d);
  sec = await proposalsSel();
  await sec.screenshot({ path: path.join(OUT, "admin-proposals-approved.png") });
  log("shot admin-proposals-approved");

  // 却下：建築科2年（要確認）
  const before2 = await d.evaluate(() => document.querySelectorAll("li button").length);
  await d.evaluate(() => {
    const li = [...document.querySelectorAll("li")].find((e) => e.textContent?.includes("建築科2年"));
    const btn = [...li.querySelectorAll("button")].find((b) => b.textContent?.includes("却下"));
    btn.click();
  });
  await d.waitForFunction((n) => document.querySelectorAll("li button").length < n, { timeout: 30000 }, before2);
  await sleep(500);
  await hideDevOverlay(d);
  sec = await proposalsSel();
  await sec.screenshot({ path: path.join(OUT, "admin-proposals-rejected.png") });
  log("shot admin-proposals-rejected");

  // 承認が教室ページに出る
  await gotoWait(m, `${BASE}/room/r-m3`);
  await shot(m, "room-m3-top");
  await shot(m, "room-m3-full", { fullPage: true });

  // ---------- 年度末の書類 ----------
  await d.setCookie({ name: "sim_today", value: "2027-03-31", url: BASE });
  await gotoWait(d, `${BASE}/admin/docs`);
  await shot(d, "docs-top");
  await clickText(d, "下書きを作る");
  // ストリーミング中のフレーム
  for (let i = 1; i <= 14; i++) {
    await sleep(1500);
    await hideDevOverlay(d);
    await d.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    const busy = await hasText(d, "止める");
    await shot(d, `docs-handover-s${String(i).padStart(2, "0")}`);
    if (!busy) break;
  }
  await d.waitForFunction(() => !document.body.innerText.includes("止める"), { timeout: 180000 });
  await sleep(500);
  await hideDevOverlay(d);
  await shot(d, "docs-handover-final");
  await shot(d, "docs-handover-full", { fullPage: true });
  // 電気科2年の行を強調
  const hl = await d.evaluate(() => {
    const art = document.querySelector("article");
    const all = [...art.querySelectorAll("li, td, p, tr")];
    const pick = (a, b) =>
      all.filter((e) => e.textContent?.includes(a) && e.textContent?.includes(b) && e.textContent.length < 400);
    const cands = [...pick("電気科2年", "ケーブル・アダプタ"), ...pick("電気科2年", "ケーブル"), ...pick("電気科2年", "件")];
    cands.sort((x, y) => x.textContent.length - y.textContent.length);
    const el = cands[0];
    if (!el) return false;
    el.style.background = "#fef08a";
    el.style.outline = "3px solid #ca8a04";
    el.style.borderRadius = "6px";
    el.scrollIntoView({ block: "center" });
    return el.textContent;
  });
  log("highlight:", hl);
  await sleep(400);
  await shot(d, "docs-handover-highlight");

  // 購入計画
  await d.evaluate(() => window.scrollTo(0, 0));
  await clickText(d, "備品購入計画");
  await sleep(300);
  await clickText(d, "作り直す");
  await d.waitForFunction(() => !document.body.innerText.includes("止める") && document.querySelector("article table"), {
    timeout: 180000,
  });
  await sleep(500);
  await hideDevOverlay(d);
  await d.evaluate(() => document.querySelector("article table")?.scrollIntoView({ block: "center" }));
  await sleep(300);
  await shot(d, "docs-purchase-table");
  await shot(d, "docs-purchase-full", { fullPage: true });

  // ---------- QR とリポジトリ ----------
  await d.deleteCookie({ name: "sim_today", url: BASE });
  await gotoWait(d, `${BASE}/admin/qr`);
  await d.evaluate(() => {
    for (const el of document.querySelectorAll("main article *")) {
      if (el.children.length === 0 && (el.textContent ?? "").startsWith("http://localhost")) el.remove();
    }
  });
  await shot(d, "qr-page");
  const card = await d.$("main article");
  if (card) {
    await card.screenshot({ path: path.join(OUT, "qr-card.png") });
    log("shot qr-card");
  }

  try {
    await d.goto("https://github.com/ogimitsu/utsuranai", { waitUntil: "networkidle2", timeout: 90000 });
    await sleep(1000);
    await shot(d, "repo");
  } catch (e) {
    log("repo screenshot skipped:", e.message);
  }
  log("done");
} finally {
  await browser.close();
}
