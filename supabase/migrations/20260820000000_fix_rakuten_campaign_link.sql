update public.point_activities
set
  title = '楽天キャンペーン・エントリー確認',
  official_url = 'https://point.rakuten.co.jp/campaign/',
  conditions = '楽天公式の開催中キャンペーンを確認し、必要なものだけ本人が条件を確認してエントリーします。エントリー済みかは同ページの「キャンペーンエントリー履歴」から確認できます。',
  source_checked_at = now(),
  updated_at = now()
where origin = 'manual'
  and title = '楽天市場のキャンペーン・エントリー確認'
  and official_url = 'https://event.rakuten.co.jp/campaign/';
