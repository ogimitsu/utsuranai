# デモ動画の作り方（スライド＋合成音声）

実機の画面録画はせず、アプリの画面キャプチャをスライドに貼り、合成音声でナレーションを付けた 3 分動画を生成する。

```
npm run dev -- --port 3210          # 開発サーバー（APIキーあり＝AIモード）
node video/capture.mjs              # 画面キャプチャ → video/frames/*.png（約3分。記録・承認を本当に実行する）
node video/capture-docs.mjs         # 年度末の引継ぎ文書だけ撮り直したいとき
git show HEAD:data/incidents.json > data/incidents.json   # テスト記録を戻す
git show HEAD:data/devices.json   > data/devices.json
python video/build.py               # 音声合成 → スライド描画 → mp4（video/out/utsuranai-demo.mp4 と .srt）
python video/build.py --dry         # 音声と長さだけ確認
```

- ナレーションと画面の割り当ては `video/script.json`。文を直したら `build.py` を再実行（音声は文ごとにキャッシュ）
- 音声は Microsoft Edge の読み上げ（edge-tts、`ja-JP-KeitaNeural`）。`pip install edge-tts imageio-ffmpeg`
- スライドは HTML を Chrome のヘッドレスで 1920×1080 に描画。フォントは BIZ UDPGothic（Windows 標準）
- 合計が 180 秒を超えると `build.py` が警告する
- 生成物（frames / build / out）は git に入れない
