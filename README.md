# ふたりのお財布

夫婦の貸し借り・部分返済・買い出しを、AndroidとiPhoneから共有できるPWAです。

## Features

- 夫婦それぞれのメール・パスワードログイン
- RLSによる登録済み2ユーザー限定アクセス
- 貸し借り、部分返済、返済取消、差引精算額
- 買い出しリスト、カテゴリ、購入済み管理
- Supabase Realtimeによる端末間の自動同期
- Android / iPhoneのホーム画面に追加できるPWA
- オフライン時の直近データ表示
- 日本時間に基づく購入日

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

## Deployment order

1. Supabaseの準備マイグレーションを適用
2. Supabase Authで2ユーザーを作成
3. `app_members`へ2人のUUIDを登録
4. ローカルまたはPreview環境でログイン・既存データを確認
5. RLS有効化マイグレーションを適用
6. Vercelへデプロイ
7. Android Chrome / iPhone Safariからホーム画面へ追加し直す
