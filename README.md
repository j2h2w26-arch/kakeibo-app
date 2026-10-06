# ふたりの暮らし

夫婦2人でお金・買い物・家事・未来の計画を共有するReact + Vite + SupabaseのPWAです。スマホ・タブレット・PCから同じデータを使います。

## 正本と公開状態

[作業ルール](AGENTS.md)、[現行仕様](docs/PRODUCT_SPEC.md)、[構成・権限](docs/ARCHITECTURE.md)、[決定記録](docs/DECISIONS.md)を参照してください。

このブランチには未マージの改善が含まれます。2026-10-02時点で認証調査はDraft PR #19、キャッシュ分離と2人の権限検証は#20、PWA更新通知は#21です。本番適用済みという意味ではありません。実機ログイン・端末間同期の未確認項目は[チェックリスト](docs/two-member-verification.md)に記録しています。

## Features

- 夫婦それぞれのメール・パスワードログイン
- RLSによる登録済み2ユーザー限定アクセス
- 貸し借り、部分返済、返済取消、差引精算額
- 家計簿、非公開レシート画像、端末内OCRによる確認入力
- 買い出しリスト、カテゴリ、購入済み管理
- 家の在庫管理と不足品の買い物追加
- Wishリストと人生ToDo
- 家事の周期、期限超過、完了履歴、検索・分類、家電との関連
- 目標マップ、ルート・フェーズ・節目、年月タイムライン、共通ToDo
- レシピの材料・手順・元投稿リンク保存、在庫照合と買い物連携
- 人間確認型のポイ活Todo・公式キャンペーン候補
- Supabase Realtimeによる端末間の自動同期
- Android / iPhoneのホーム画面に追加できるPWA
- オフライン時の直近データ表示
- 日本時間に基づく購入日

ホームはお金・暮らし・未来・ポイントの4機能選択です。暮らしには買い物/在庫・家事・レシピがあります。現行の朝夕通知はアプリが動いている間の確認であり、閉じたアプリへのバックグラウンドPushではありません。自動送金・キャンペーン自動応募もありません。

バックグラウンドPushは[登録土台](docs/push-subscription-foundation.md)と[端末設定・受信](docs/push-device-controls.md)をDraftで実装中です。配信処理は未実装、本番未反映。`VITE_PUSH_ENABLED`は未設定/falseのままとし、公開鍵`VITE_PUSH_PUBLIC_KEY`も配信準備・承認前に設定しないでください。VAPID秘密鍵を`VITE_`やGitへ置いてはいけません。

レシートOCRは画像を外部OCRサービスへ送信せず、ブラウザ内で処理します。初回のみ文字認識モデルの取得に時間がかかることがあります。抽出した店名・日付・金額・品目は候補として表示し、利用者が確認・修正してから保存します。

## Local development

Node.js 22.12以降のVite対応版を使用します（検証: Node 24.19.0）。既存の`.env.local`は上書きしないでください。

```powershell
Copy-Item .env.example .env.local
npm ci
npm run dev
```

`.env.local`にSupabaseのProject URLとPublishable Keyを設定します。Publishable Keyはクライアント用ですが、データ保護は必ずSupabase AuthとRLSで行います。

`VITE_SUPABASE_URL`と`VITE_SUPABASE_ANON_KEY`を設定します。service_role・秘密鍵・YouTube APIキーをVITE_変数へ入れないでください。設定なしでもビルドは通りますが、実行時は白画面になるため画面まで確認します。OCRのWorker/WASMはpredev/prebuildでpublic/ocrへ準備し、言語モデルは別途取得します。

## Verification

```bash
npm test
npm run lint
npm run build
npm run preview
```

通常のdevではSWを登録しません。更新・オフライン確認にはbuild + previewを使います。npm testはNode単体テストと隔離PGliteのSQLテストで、実Auth/Realtime/実機の検証とは別です。

## Supabase

既存本番は認証・RLS設定済みです。[`supabase/README.md`](supabase/README.md)の旧導入手順を再実行しないでください。移行は名前・内容も照合し、日付IDの違いだけで二重適用しません。初期3テーブルはマイグレーション以前のため、空DBの完全再構築手順は未整備です。

Freeプランでの漏洩パスワード保護の扱い、端末キャッシュ、レシート画像の運用は[`docs/security-operations.md`](docs/security-operations.md)を正本とします。

### YouTubeレシピ取込

`import-recipe` Edge Functionは、`youtube.com`/`www.youtube.com`/`m.youtube.com`の共有URLを受け取り、元動画へのリンクをレシピに残します。概要欄から材料・手順を自動入力するには、YouTube Data API v3を有効化したGoogle CloudプロジェクトのAPIキーを、Supabase Edge FunctionsのSecret `YOUTUBE_API_KEY`として登録してください。キーはブラウザ側の環境変数に置かないでください。

キーがない場合やYouTube側で概要欄を取得できない場合も、タイトルと元リンクだけで入力画面へ進めます。概要欄に明確な「材料」「作り方」等の見出しがない場合は内容を推測せず、利用者が確認・追記します。第三者の動画の字幕・音声は取得しません。

一般Webは対応ページのRecipe構造化データを使用します。Instagramは元リンク保存と手入力です。第三者動画のコメント、Instagram本文の自動取得は未実装です。

## Deployment order

1. 現行コード・docs・未コミット差分・サービス状態を確認。
2. codex/ブランチで小さく変更し、test/lint/buildを実行。DB変更時はRLS・匿名/非メンバー拒否も検証。
3. Draft PRとPreviewを作成。積み上げPRの親を明記。
4. Previewの接続先を確認。本番DB接続ならPreview操作も本番データを変えるため、無断でテストデータを書き込まない。
5. 利用者のPR/Preview確認と明示承認後のみ、マージ・本番DB/Functions/アプリ反映。mainへ直接pushしない。

戻す場合も利用者データや追加テーブルを削除しません。PWA更新時に再インストールや全データ削除を通常手順とせず、[更新手順](docs/pwa-updates.md)を使います。Free継続、課金・外部画像送信・Push仕様は事前判断を必須とします。
