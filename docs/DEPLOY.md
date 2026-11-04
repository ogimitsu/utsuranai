# 公開手順（Vercel）

11/7 の「安全なデプロイ」セッションを見てから実行する。それまでは準備だけ。

## 先に決めること

**公開URLにAPIキーを載せるか。** 載せると、URLを知る誰でもこの学校の分の Claude 呼び出しを使える（1回あたり数円だが、無制限）。選択肢は3つ。

| 案 | 公開URLの状態 | 動画 | 向き不向き |
|---|---|---|---|
| A | APIキーなし（手順集モード） | ローカルのAIモードで撮る | 安全。審査員が触っても費用ゼロ。AIバッジは「手順集」になる |
| B | APIキーあり | 公開URLで撮ってもよい | 審査員が AI の返答を体験できる。利用上限を Anthropic コンソールで設定しておく |
| C | B を審査期間だけ。終わったらキーを外す | 同上 | 現実的な落とし所 |

推奨は **C**。コンソールの Usage limits で月額の上限（例：$20）を入れてから公開する。

## 公開しても変わらないもの・変わるもの

- 変わらない：教室ページ、ダッシュボード、書類、QR、日付シミュレーター（cookie）
- 変わる：**書き込みが残らない**。Vercel のファイルシステムは読み取り専用なので、記録・承認・却下はサーバーの一時メモリに入るだけ（`src/lib/store.ts`）。数分〜数十分で消える。審査員が触る分には問題ないが、**動画はローカルで撮る**（履歴が増える場面を確実に見せるため）
- QRカードのURLは開いたホストから作られる。公開後に `/admin/qr` を**本番URLで開き直して**印刷する

## 手順

1. Vercel にログイン（GitHub 連携）→ Add New Project → `ogimitsu/utsuranai` を Import
2. Framework は Next.js のまま。Root Directory はリポジトリ直下（`utsuranai/` ではない。リポジトリのルートが Next プロジェクト）
3. Environment Variables：案 B/C なら `ANTHROPIC_API_KEY` を入れる（Production のみ）。案 A なら何も入れない
4. Deploy。2〜3分
5. 確認する順：`/room/r-e2`（手順が出る）→ `/admin`（数字が出る）→ `/admin/docs` で引継ぎを1回生成 → `/admin/qr`
6. ヘッダーの「今日」を 2027-03-31 にして `/admin/docs` の引継ぎを見る → 戻す
7. README の冒頭に公開URLを書いて push（Vercel が自動で再デプロイ）

## 公開後にやること

- Anthropic コンソールで Usage を1日1回見る。想定外に増えていたらキーを Vercel から外して Redeploy
- 審査が終わったら（11/10 以降）キーを外す

## うまくいかないとき

- 教室ページが 500：`data/*.json` がバンドルに入っていない。`next.config.ts` の `outputFileTracingIncludes` を確認。ローカルで `npx next build` のあと `.next/server/app/room/[id]/page.js.nft.json` に `data/` が含まれるか見る
- 書類が「手順集モード」のまま：環境変数が Production に入っていない、または入れたあと Redeploy していない
- QRの先が localhost：ローカルで印刷した。本番URLで `/admin/qr` を開き直す
