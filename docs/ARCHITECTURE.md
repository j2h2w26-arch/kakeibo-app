# 構成・データ境界

更新: 2026-10-06。このブランチのコード（未マージの②③⑥を含む）に基づく。

## アプリと配信

- React 19 + Vite 8。App.jsxが認証・メンバー確認・共有操作、大分類を管理。components/は画面、lib/は業務関数、hooks/は取得・同期。
- Vercelがdist/を静的配信。VITE_SUPABASE_URLとVITE_SUPABASE_ANON_KEYは公開クライアントへ埋め込む。秘密鍵はVITE_に置かない。
- vite-plugin-pwaがアプリシェルをプリキャッシュ。pwaUpdaterがSWを登録・監視、PwaUpdateNoticeが保存確認。devでは登録せずbuild/previewで検証。
- SupabaseはAuth、Postgres/Data API、Realtime、非公開Storage、Edge Functions。Functionsの反映はVercelのフロント公開とは別。

## 認証・認可

ログイン→Authセッション→app_membersの本人行→useHouseholdDataの取得→テーブルごとのGRANTとRLS、という経路。UIを隠すことは認可ではない。

- is_app_memberはSECURITY INVOKER。app_membersは本人プロフィールのSELECTのみ。user_metadataを認可に使わない。
- 2026-10-01本番確認: 公開31テーブルすべてRLS有効。GRANTはRLSと別に検証。
- 貸借・買い物/在庫・支出・Wish・家事・人生設計・レシピなどは共有。全テーブルが同じ書込み権限ではない。
- 通知設定・ポイ活サービス設定/キャンペーン判断は本人のみ。完了履歴/相談コメントは共有閲覧と本人記録・削除を分離。
- 作成者や履歴を偽装させず、無効化/アーカイブ対象を物理削除へ置き換えない。point_sync_configは通常クライアントの閲覧も拒否。
- import-recipeはサーバー側でAuth tokenとメンバーを確認してURL取得。既存SSRF対策を維持。秘密鍵/YouTubeキーはEdge Functions側だけに置く。

## 取得・同期・端末保存

data.jsがSupabaseへアクセスし、fetchHouseholdSnapshotが並列取得とページングを行う。Realtime変更通知で250ms後に再取得。本番29テーブルのpublication登録を確認済みだが、実端末への配信成功とは別。

snapshotLoaderは最新リクエストだけを画面とキャッシュに反映し、ログアウト/利用者変更/アンマウントで無効化。householdCache v12はユーザーIDと24時間の期限を持つ。オフラインのメンバープロフィールもセッションのID一致が必要。端末保存は暗号化保証なし。オフライン中の権限剥奪を即時に知ることはできないため、共有端末はログアウトと端末ロックで保護する。

## データ群

| 分類 | 主なテーブル・処理 |
|---|---|
| メンバー | app_members |
| お金 | loans/repayments/household_expenses、返済/取消RPC |
| 暮らし | shopping_items/inventory_items、household_appliances/chores/chore_completions、家事完了RPC |
| レシピ | recipes/recipe_ingredients/recipe_steps、一括保存RPC |
| 未来 | wishes/wish_comments/life_tasks、life_goalsとroutes/milestones/task_links/phases/relations |
| ポイント | point_activities/completions、sources/campaigns/steps/member_states/service_preferences/sync_runs/sync_config（実名はpoint_接頭辞等） |
| 通知 | notification_preferences（Push購読ではない） |

正確なテーブル名・列・制約はsupabase/migrations/と実DBを参照する。

## レシート・OCR

画像選択→端末内Blobプレビュー→Tesseract Worker→候補入力→人が修正/保存→非公開receiptsへ送信→支出に参照保存。外部OCRサービスには送らない。Worker/WASMは自サイト/ocr、言語モデルはjsDelivrから取得しIndexedDBにキャッシュ（[調査と制約](receipt-ocr-review.md)）。認識全文はDBへ自動保存しない。画像URLは認可後に60秒の署名を発行する。期限内のURLは共有先も閲覧し得るためログやPRへ載せない。

支出削除→画像削除の順。画像削除失敗は警告し、孤立画像の自動清掃は未実装。登録失敗時も画像除去を試みるが完全な分散トランザクションではない。

## 検証と移行

### Push購読の土台（Draft・本番未適用）

`push_private.subscriptions`へ配送先と購読鍵を保存する予定。Data APIへschemaを公開せず、直接の表権限は全クライアントから剥奪、RLSも有効。公開3RPCはinvoker、privateの限定definerが`auth.uid()`と現在のapp_membersを確認する。レスポンスは端末名/ID/日時だけで鍵やURLを返さない。現在の家計スナップショットには追加しない。[詳細](push-subscription-foundation.md)。

⑥-2のDraftではPushNotificationSettings→pushDevice→本人JWTに固定したRPCを追加。ローカル同意は専用IndexedDB、同originの競合はWeb Locksで制御する。既存SWへpush-worker.jsをimportScriptsし、同意/所有者/購読ID/期限を確認して固定一般文のみ表示。標準は無効。VAPID公開鍵だけがVITE_の対象で、秘密鍵・送信者権限・Cronは後続。[検証と制約](push-device-controls.md)。

Node単体/PGlite隔離SQLテストはAuthとStorageの最小スタブを使い、実サービスの署名/ファイル配信を証明しない。最初の3テーブルはマイグレーション以前で、空DB用完全bootstrapは未整備。移行IDが本番と異なる履歴は名前・内容も照合し二重適用を防ぐ。Draft PR/Previewの承認まで本番変更しない。Previewも本番DBにつながり得る。
