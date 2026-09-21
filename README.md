# ふたりのお財布

夫婦の貸し借り・部分返済・買い出しを、AndroidとiPhoneから共有できるPWAです。

## Features

- 夫婦それぞれのメール・パスワードログイン
- RLSによる登録済み2ユーザー限定アクセス
- 貸し借り、部分返済、返済取消、差引精算額
- 家計簿、非公開レシート画像、端末内OCRによる確認入力
- 買い出しリスト、カテゴリ、購入済み管理
- 家の在庫管理と不足品の買い物追加
- Wishリストと人生ToDo
- 人間確認型のポイ活Todo・公式キャンペーン候補
- Supabase Realtimeによる端末間の自動同期
- Android / iPhoneのホーム画面に追加できるPWA
- オフライン時の直近データ表示
- 日本時間に基づく購入日

レシートOCRは画像を外部OCRサービスへ送信せず、ブラウザ内で処理します。初回のみ文字認識モデルの取得に時間がかかることがあります。抽出した店名・日付・金額・品目は候補として表示し、利用者が確認・修正してから保存します。

## Local development

```bash
cp .env.example .env.local
npm ci
npm run dev
```

`.env.local`にSupabaseのProject URLとPublishable Keyを設定します。Publishable Keyはクライアント用ですが、データ保護は必ずSupabase AuthとRLSで行います。

## Verification

```bash
npm test
npm run lint
npm run build
```

## Supabase

本番反映前に[`supabase/README.md`](supabase/README.md)の手順で、マイグレーション、夫婦2ユーザー、メンバー登録を設定してください。

Freeプランでの漏洩パスワード保護の扱い、端末キャッシュ、レシート画像の運用は[`docs/security-operations.md`](docs/security-operations.md)を正本とします。

### YouTubeレシピ取込

`import-recipe` Edge Functionは、`youtube.com`/`www.youtube.com`/`m.youtube.com`の共有URLを受け取り、元動画へのリンクをレシピに残します。概要欄から材料・手順を自動入力するには、YouTube Data API v3を有効化したGoogle CloudプロジェクトのAPIキーを、Supabase Edge FunctionsのSecret `YOUTUBE_API_KEY`として登録してください。キーはブラウザ側の環境変数に置かないでください。

キーがない場合やYouTube側で概要欄を取得できない場合も、タイトルと元リンクだけで入力画面へ進めます。概要欄に明確な「材料」「作り方」等の見出しがない場合は内容を推測せず、利用者が確認・追記します。第三者の動画の字幕・音声は取得しません。

## Deployment order

1. Supabaseの準備マイグレーションを適用
2. Supabase Authで2ユーザーを作成
3. `app_members`へ2人のUUIDを登録
4. ローカルまたはPreview環境でログイン・既存データを確認
5. RLS有効化マイグレーションを適用
6. Vercelへデプロイ
7. Android Chrome / iPhone Safariからホーム画面へ追加し直す
