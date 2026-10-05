# Push登録・解除の土台（⑥-1）

2026-10-05。方針承認後の最初の小変更。ローカル実装・隔離検証のみで、本番DBへ未適用。利用者の画面はまだ変わらない。

## 変更

- CLIが生成した`20261001223840_add_private_push_subscriptions.sql`。既存データ/通知設定/公開31テーブルを変更しない。通知先の初期登録や配信もない。
- 非公開schema `push_private`に購読を保存。`user_id`はapp_membersへの外部キー（メンバー削除時に購読を削除）。配送先URLは一意、本人ごと10件上限。登録時にメンバー行をロックし、上限の確認と登録を同一トランザクションで行う。
- `register_push_subscription(endpoint, p256dh, auth, device_name, consent)`は同意trueが必須。同じ本人/endpointは同じIDで更新。他人のendpointを奪わない。任意のuser_idを引数に取らない。
- `list_push_subscriptions()`は本人の端末ID/表示名/日時だけを返す。鍵やURLは本人にも返さない。
- `remove_push_subscription(id)`は本人の行だけを削除。すでに削除済み/他人のIDでも同じtrueを返し、存在を漏らさない。ブラウザーunsubscribeは後続のUI実装で別に実行するため、DB削除だけをOSでの停止完了と扱わない。
- private表はRLS有効、クライアントの直接権限なし。policyを置かないdeny-allが意図した仕様。限定definerはprivate schemaだけ、search_path空、全関数からPUBLIC/anon権限を剥奪。入口の公開RPCはinvoker。

## 入力・秘密情報

FCM/Apple/Microsoft/Mozillaの限定host/path形式のみ受け付ける。http、IP、userinfo、独自port、紛らわしいhost、空白/過長/パス遡りを拒否。形式チェックだけで配信の安全性/互換性を保証せず、後続の配信側でDNS/リダイレクト対策を必須とする。**iPhone/Android/Surfaceの実購読URLは未確認**。必要な許可パターンは実機で確認してから最小限追加し、未知URLを無条件に許可しない。

P-256公開鍵は65byteの非圧縮形式、authは16byteの正規base64url形式をチェック。P-256曲線上の点の検証やWeb Push暗号化は後続。購読鍵と送信用VAPID秘密鍵は別物で、このPRではVAPID鍵を生成/保存しない。配信先・購読鍵を家計キャッシュ、ログ、Realtime、レスポンスへ追加しない。

HTTPゲートウェイによるJWT検証を前提に、DB側でも`auth.uid()`と現メンバー資格を照合。引数consent=trueだけで実際のOS許可を証明できるわけではないため、後続ブラウザー実装で直接のユーザー操作・Notification.permission・実PushSubscription確認が必要。

## 検証範囲

2026-10-05: `npm test` 118/118成功、`npm run lint`成功、`npm run build`成功。既存の500kB超チャンク警告は残る。外部配信なし。

`tests/push-subscriptions-db.test.mjs`はPGliteの使い捨てDB、夫/妻/第三者の合成ID、合成購読鍵・URLで検証。外部への通知送信はない。

- 既存設定保持、空の購読初期状態、RLS/表権限/関数権限/search_pathを検査
- 同意なし拒否、本人登録/更新、レスポンスの秘密情報除外
- 配偶者の一覧非表示/解除無効/付け替え拒否
- 匿名・非メンバー・空UID・メンバー削除後の公開/内部RPC拒否
- URL/鍵/端末名の不正形式拒否、10件上限、更新・解除の再実行
- 仮に直接の表権限を追加してもRLSで閲覧/書込み拒否
- メンバー削除時の購読情報除去ともう一人の購読保持

既存の全機能DBテストにもこの移行を追加適用し、データ保持・RLSの回帰を確認する。PGliteは実Auth/HTTP API/OS許可/同時接続の並列競合を再現しない。実環境の並列登録試験・Security Advisor・Data API非公開設定の確認は本番適用前に隔離Supabase環境で別途必要。本番Advisorの結果をこの未適用migrationの合格証明にしない。

## 後続PR

1. 端末別オプトインUI、失敗時の表示、ログアウト/アカウント変更/解除の制御、受信SWと更新回帰。
2. VAPID・認証付き配信・朝夕の対象抽出・重複/期限/再試行台帳・無効状態でのCron導入手順。
3. 許可された隔離環境の実配信、iPhone/Android/Surfaceの実機確認、PR/Previewレビュー、本番承認。

DBだけ適用しても通知は届かない。送信者の権限や機能フラグはこの段階では未作成。秘密鍵をVITE_変数やGitへ置かない。schemaを公開せず、公開RPCからの本人操作のみを使う。

根拠: [Supabaseの関数権限とsearch_path](https://supabase.com/docs/guides/database/functions)、[RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)。
