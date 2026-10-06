# 認証レビューと残開発の現状

確認日: 2026-09-30。段階①の調査記録。漏洩パスワード保護の有効化完了を示す文書ではない。

## 現行状態

| 対象 | 確認結果 |
| --- | --- |
| コード | ローカルとGitHub `main`は`d3b4419164f8638d6a74d8ccac6eb7748fc620d5`。着手時の未コミット変更なし、開いているPRなし |
| 指定の正本 | `AGENTS.md`、`docs/PRODUCT_SPEC.md`、`docs/ARCHITECTURE.md`、`docs/DECISIONS.md`は着手時にローカルおよびGitHub `main`で見つからない。本PRで決定記録を開始し、製品・構成文書は段階④で現行実装から整備する |
| Vercel | Git連携の本番デプロイは同コミット、`READY`。本番URLは`https://kakeibo-app-pi-umber.vercel.app/`。既存ブランチのPreview作成履歴も確認 |
| Supabase | プロジェクト`ACTIVE_HEALTHY`、組織プラン`free`。適用済みマイグレーション20件、最新は`add_recipe_library` |
| 認証 | Authユーザー2件、`app_members`2件、メール確認済みのメンバー2件。件数だけを照合し、メール・パスワード・トークンは取得しない |
| RLS | `public`の通常テーブル31件すべてでRLS有効、各テーブルにポリシーあり。ポリシーの全操作試験が完了したという意味ではない |
| レシート | `receipts`バケットは`public=false` |
| Security Advisor | `auth_leaked_password_protection`警告1件。その他のセキュリティ警告は今回の応答にはなし。全安全性の保証ではない |

Vercelの個別プロジェクト取得ツールは引数検証エラーとなったため、プロジェクト一覧・デプロイ一覧・本番デプロイ詳細で照合した。環境変数の値やPreview専用DBの有無は未確認。

## ① 漏洩パスワード保護

[公式Password security](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)とSupabaseドキュメント検索で、HaveIBeenPwnedを利用する標準の保護機能はPro以上であることを確認した。本番Freeプランでは有効化できない。契約・課金の判断を伴うため、設定変更を保留する。

警告が示すのは「保護機能が無効」であり、この家族のパスワードの漏洩が検出されたという意味ではない。パスワード自体の漏洩照合は行っていない。

公式FAQによると、パスワード強度要件を強化しても既存ユーザーは現在のパスワードでログインできる。新規登録・変更時には強化後の条件が適用され、ログイン時には弱いパスワードの情報が返る場合がある。使用中の`@supabase/auth-js`の`signInWithPassword`実装も、成功時にセッションを保存し、`data.weakPassword`を付けて返す構造である。今回、設定変更後の実ユーザーログインは未検証。

外部メールサービスはこの照合機能の必須条件として公式手順に記載されていない。SMTPやパスワード再設定メールの調査・追加を有効化の前提にしない。

[公式変更履歴](https://supabase.com/changelog.md)も確認した。直近にはDBマイナー更新やログAPIの変更があるが、漏洩パスワード保護をFreeに開放する変更は今回確認できなかった。DBアップグレードは本PRの対象外。

### このPRの変更と影響

認証の調査根拠、Freeプランの制約、段階的な承認手順を文書へ記録する。アプリコード・依存関係・DB・Auth設定は変更しないため、このPRによるログインや保存データへの動作変更はない。警告は残り、①の有効化は未完了のまま。

### 検証結果

- `npm test`: 85件成功、失敗・スキップ0件。既存の隔離Postgresテストで在庫・人生設計・レシピの匿名／非メンバー拒否とデータ保持も検証。
- `npm run lint`: 成功。
- `npm run build`: 成功。PWA precache 11件、Service Worker生成を確認。既存の500 kB超チャンク警告あり（メインJS約560.53 kB）。
- 実行環境: Node.js 24.19.0 / npm 11.6.0。標準PATHにnpmがないため、pnpm dlxで一時取得したnpmから同じscriptsを実行。アプリの依存関係・lockfileは変更なし。
- DB変更なし。今回の本番DB確認は件数・RLS設定・バケット公開設定の読み取りのみ。
- 実ユーザー2人のログイン、各機能の操作、端末間同期は段階②の未確認項目。
- Draft PRとPreviewの状態はPR本文で報告する。ドキュメントのみのPreviewは既存アプリのビルド・表示確認に用い、漏洩パスワード保護の動作確認にはならない。

## 残開発の順序

| 段階 | 現行コードの根拠 | 次の対応・未確認範囲 |
| --- | --- | --- |
| ① 認証 | 本番Free、Advisor警告あり、`docs/security-operations.md`にFree継続方針 | 有料化を実施せず、有効化は保留として結果を提示 |
| ② 2人での検証 | `src/components/LoginScreen.jsx`、`src/hooks/useHouseholdData.js`、各機能画面、RLSマイグレーション | 買い物・在庫・お金・Wish・人生ToDo・ポイ活・家事・人生設計のログイン、読み書き、同期、権限分離。実機はiPhone・Android・Surface用チェックリストを用意し、実施者・結果を記録。未確認を完了扱いにしない |
| ③ PWA更新 | `vite.config.js`に`autoUpdate`と`cleanupOutdatedCaches`、`src/main.jsx`に更新通知処理なし | 旧Service Worker・キャッシュの再現、編集中データを考慮した更新導線、オフライン維持、新旧切替を検証 |
| ④ 文書 | READMEは旧名称「ふたりのお財布」、一部機能記述不足。製品・構成の正本が欠落 | 現行機能・セットアップ・認証・RLS・運用制約を整理。既存の機能別文書から正本へリンクし、矛盾を解消 |
| ⑤ OCR | `src/lib/receiptOcr.js`のTesseract.js、`ExpensePanel.jsx`の店名・日付・金額候補と確認保存、非公開Storage保存 | 基本実装は重複作成しない。認識モデル取得先、ネットワーク通信、保存期間、実画像の認識・修正保存・閲覧権限を検証。新しい外部画像送信・有料化が必要なら事前に判断を求める |
| ⑥ Push | `src/hooks/useDailyReminder.js`はアプリ起動中の通知。Push購読・バックグラウンド配信基盤は未実装 | iPhone/Android対応、端末別許可と解除、配信基盤・費用・失敗時処理の仕様案を提示し、承認後に実装 |

①の保留判断・PR内容を報告してから次の段階へ区切る。本番反映は各PRとPreviewに対する利用者の明示的な承認後に行う。
