begin;

alter table public.point_sources
  add column feed_url text,
  add constraint point_sources_feed_url_check
    check (feed_url is null or (feed_url like 'https://%' and char_length(feed_url) <= 2000));

update public.point_sources
set
  feed_url = case source_key
    when 'rakuten_pointclub' then 'https://point.rakuten.co.jp/_assets/json/app_navi/earn/campaign.json'
    when 'rakuten_pay' then 'https://common-service.payment.rakuten.co.jp/ptcms/campaign-medias/common-campaign-list.json'
    else feed_url
  end,
  updated_at = now()
where source_key in ('rakuten_pointclub', 'rakuten_pay');

commit;
