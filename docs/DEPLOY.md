# 公開手順（Vercel）

**公開済み（11/8 14:55）**：https://utsuranai.vercel.app（案 A＝APIキーなし。先生の決定「公開してよい。キーは載せない」）。Vercel CLI でデプロイ（`npx vercel login` → `npx vercel link --yes --project utsuranai` → `npx vercel --prod --yes`）。GitHub 連携は Vercel 側の Login Connection が無く未設定なので、更新は同じ `npx vercel --prod --yes` を手で実行する。注意：`vercel link` は `.env.local` に `VERCEL_OIDC_TOKEN` 行を追記する（API キーの行はそのまま）。`.vercelignore` で `.env*`・`video/`・`.next/` を除外。

以下は 11/7 の「安全なデプロイ」セッション前に書いた手順。

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

## 公開前チェック（11/7 セッション5 吉田真吾さんのチェックリスト。11/8 点検）

| # | 項目 | 結果（11/8 朝） | 残り |
|---|---|---|---|
| 0 | README を整える | アプリ名・概要・課題・機能・技術・手順・動画欄あり。動作環境と `.env.example` の説明、LICENSE ファイルを 11/8 に追加 | 動画 URL と公開 URL を提出時に記入 |
| 1 | 公開ファイルに API キー等が無い | 追跡ファイルに `sk-ant-`・`ANTHROPIC_API_KEY=値` なし。`.env*` は .gitignore 済み、`.env.local` は未追跡。`.env.example` は値が空。`process.env` の参照は `src/lib/llm/client.ts` の1か所（サーバー側）だけ。`NEXT_PUBLIC_` なし | — |
| 2 | Git 履歴にも無い | 全コミット（26）の差分を `sk-ant-`・AWS・GitHub トークン・秘密鍵の形で検索し 0 件。`.env` 系ファイルが追加された履歴なし | — |
| 3 | GitHub の設定 | API で `visibility: public`、既定ブランチ `main` を確認 | **先生が Settings で確認**：Collaborators が自分だけ／Advanced Security の secret scanning と push protection を ON／Topics（任意） |
| 4 | 仕様・コードの点検 | 11/8 にサブエージェントで API ルート・store・LLM 入口を点検（結果は BUILD_LOG 11/8） | Claude Security プラグインは先生が `/plugin install claude-security@claude-plugins-official` → `/claude-security` で実行できる（使用量に計上）。必須ではない |
| 5 | 動かして確認 | ローカル :3210 で全画面を 11/6 に確認。ブラウザに届くのは手順・記録・文書の文面だけ（API キーは返さない） | 公開後に本番 URL で同じ順に確認（上の「手順」5〜6） |
| 動画 | 提出動画を見返す | 画面はすべて架空校のダミーデータ。API キー・実在の人物名・連絡先は映らない。エラー画面なし | — |

公開は先生の「公開してよい」を待って実行する。
