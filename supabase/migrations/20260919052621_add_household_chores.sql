begin;

create table public.household_appliances (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  catalog_key text unique,
  name text not null,
  manufacturer text not null,
  model_number text,
  support_url text,
  note text,
  is_active boolean not null default true,
  created_by uuid default auth.uid()
    references public.app_members(user_id) on delete set null,
  constraint household_appliances_name_check
    check (char_length(btrim(name)) between 1 and 100),
  constraint household_appliances_manufacturer_check
    check (char_length(btrim(manufacturer)) between 1 and 100),
  constraint household_appliances_model_number_check
    check (model_number is null or char_length(btrim(model_number)) between 1 and 100),
  constraint household_appliances_support_url_check
    check (
      support_url is null
      or (char_length(support_url) <= 2000 and support_url ~ '^https://')
    ),
  constraint household_appliances_note_check
    check (note is null or char_length(note) <= 1000)
);

create table public.household_chores (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  catalog_key text unique,
  title text not null,
  category text not null default 'その他',
  assigned_to text not null default 'ふたり',
  schedule_type text not null default 'interval',
  interval_value smallint,
  interval_unit text,
  weekday smallint,
  day_of_month smallint,
  month_of_year smallint,
  next_due_on date,
  last_completed_on date,
  appliance_id bigint references public.household_appliances(id) on delete restrict,
  note text,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_by uuid default auth.uid()
    references public.app_members(user_id) on delete set null,
  constraint household_chores_title_check
    check (char_length(btrim(title)) between 1 and 100),
  constraint household_chores_category_check
    check (category in (
      'キッチン', '浴室・洗面', 'トイレ', '洗濯', 'リビング・寝室',
      '家電', '玄関・屋外', '防災・季節', 'その他'
    )),
  constraint household_chores_assigned_to_check
    check (assigned_to in ('夫', '妻', 'ふたり')),
  constraint household_chores_schedule_type_check
    check (schedule_type in ('interval', 'weekly', 'monthly', 'yearly', 'once')),
  constraint household_chores_interval_value_check
    check (interval_value is null or interval_value between 1 and 365),
  constraint household_chores_interval_unit_check
    check (interval_unit is null or interval_unit in ('days', 'weeks', 'months', 'years')),
  constraint household_chores_weekday_check
    check (weekday is null or weekday between 0 and 6),
  constraint household_chores_day_of_month_check
    check (day_of_month is null or day_of_month between 1 and 31),
  constraint household_chores_month_of_year_check
    check (month_of_year is null or month_of_year between 1 and 12),
  constraint household_chores_schedule_fields_check
    check (
      (schedule_type = 'interval' and interval_value is not null and interval_unit is not null
        and weekday is null and day_of_month is null and month_of_year is null)
      or (schedule_type = 'weekly' and weekday is not null
        and interval_value is null and interval_unit is null and day_of_month is null and month_of_year is null)
      or (schedule_type = 'monthly' and day_of_month is not null
        and interval_value is null and interval_unit is null and weekday is null and month_of_year is null)
      or (schedule_type = 'yearly' and month_of_year is not null and day_of_month is not null
        and interval_value is null and interval_unit is null and weekday is null)
      or (schedule_type = 'once' and interval_value is null and interval_unit is null
        and weekday is null and day_of_month is null and month_of_year is null)
    ),
  constraint household_chores_note_check
    check (note is null or char_length(note) <= 1000),
  constraint household_chores_active_due_check
    check (not is_active or next_due_on is not null)
);

create table public.household_chore_completions (
  id bigint generated always as identity primary key,
  chore_id bigint not null references public.household_chores(id) on delete restrict,
  completed_on date not null,
  completed_at timestamptz not null default now(),
  completed_by uuid not null default auth.uid()
    references public.app_members(user_id) on delete restrict,
  note text,
  constraint household_chore_completions_note_check
    check (note is null or char_length(note) <= 500),
  constraint household_chore_completions_unique_day
    unique (chore_id, completed_on)
);

create index household_chores_due_idx
  on public.household_chores (is_active, next_due_on, sort_order);
create index household_chores_category_idx
  on public.household_chores (category, is_active, sort_order);
create index household_chores_appliance_idx
  on public.household_chores (appliance_id, is_active, sort_order);
create index household_chore_completions_history_idx
  on public.household_chore_completions (completed_on desc, completed_at desc);
create index household_chore_completions_chore_idx
  on public.household_chore_completions (chore_id, completed_on desc);

revoke all on table
  public.household_appliances,
  public.household_chores,
  public.household_chore_completions
from public, anon, authenticated;

grant select, insert on table public.household_appliances to authenticated;
grant update (
  updated_at,
  name,
  manufacturer,
  model_number,
  support_url,
  note,
  is_active
) on table public.household_appliances to authenticated;
grant select, insert on table public.household_chores to authenticated;
grant update (
  updated_at,
  title,
  category,
  assigned_to,
  schedule_type,
  interval_value,
  interval_unit,
  weekday,
  day_of_month,
  month_of_year,
  next_due_on,
  last_completed_on,
  appliance_id,
  note,
  is_active,
  sort_order
) on table public.household_chores to authenticated;
grant select, insert on table public.household_chore_completions to authenticated;
grant usage, select on sequence
  public.household_appliances_id_seq,
  public.household_chores_id_seq,
  public.household_chore_completions_id_seq
to authenticated;

alter table public.household_appliances enable row level security;
alter table public.household_chores enable row level security;
alter table public.household_chore_completions enable row level security;

create policy "Household members read appliances"
  on public.household_appliances for select to authenticated
  using ((select public.is_app_member()));

create policy "Household members create appliances"
  on public.household_appliances for insert to authenticated
  with check (
    (select public.is_app_member())
    and created_by = (select auth.uid())
  );

create policy "Household members update appliances"
  on public.household_appliances for update to authenticated
  using ((select public.is_app_member()))
  with check ((select public.is_app_member()));

create policy "Household members read chores"
  on public.household_chores for select to authenticated
  using ((select public.is_app_member()));

create policy "Household members create chores"
  on public.household_chores for insert to authenticated
  with check (
    (select public.is_app_member())
    and created_by = (select auth.uid())
  );

create policy "Household members update chores"
  on public.household_chores for update to authenticated
  using ((select public.is_app_member()))
  with check ((select public.is_app_member()));

create policy "Household members read chore completions"
  on public.household_chore_completions for select to authenticated
  using ((select public.is_app_member()));

create policy "Household members record chore completions"
  on public.household_chore_completions for insert to authenticated
  with check (
    (select public.is_app_member())
    and completed_by = (select auth.uid())
  );

create or replace function public.complete_household_chore(
  p_chore_id bigint,
  p_completed_on date default (timezone('Asia/Tokyo', now()))::date,
  p_note text default null
)
returns public.household_chore_completions
language plpgsql
security invoker
set search_path = public
as $$
declare
  target_chore public.household_chores;
  inserted_completion public.household_chore_completions;
  calculated_due date;
  target_month date;
  target_year integer;
  last_day integer;
  weekday_delta integer;
begin
  if not public.is_app_member() then
    raise exception 'Not an app member' using errcode = '42501';
  end if;
  if p_completed_on is null then
    raise exception 'Completion date is required' using errcode = '22023';
  end if;
  if p_note is not null and char_length(p_note) > 500 then
    raise exception 'Completion note is too long' using errcode = '22023';
  end if;

  select * into target_chore
  from public.household_chores
  where id = p_chore_id
  for update;

  if not found then
    raise exception 'Chore not found' using errcode = 'P0002';
  end if;
  if not target_chore.is_active then
    raise exception 'Chore is inactive' using errcode = '22023';
  end if;

  insert into public.household_chore_completions (
    chore_id,
    completed_on,
    completed_by,
    note
  )
  values (
    p_chore_id,
    p_completed_on,
    (select auth.uid()),
    nullif(btrim(p_note), '')
  )
  returning * into inserted_completion;

  case target_chore.schedule_type
    when 'interval' then
      case target_chore.interval_unit
        when 'days' then calculated_due := p_completed_on + target_chore.interval_value;
        when 'weeks' then calculated_due := p_completed_on + (target_chore.interval_value * 7);
        when 'months' then
          target_month := (date_trunc('month', p_completed_on) + make_interval(months => target_chore.interval_value))::date;
          last_day := extract(day from (date_trunc('month', target_month) + interval '1 month - 1 day'))::integer;
          calculated_due := make_date(
            extract(year from target_month)::integer,
            extract(month from target_month)::integer,
            least(extract(day from p_completed_on)::integer, last_day)
          );
        when 'years' then
          target_year := extract(year from p_completed_on)::integer + target_chore.interval_value;
          last_day := extract(day from (
            date_trunc('month', make_date(target_year, extract(month from p_completed_on)::integer, 1))
            + interval '1 month - 1 day'
          ))::integer;
          calculated_due := make_date(
            target_year,
            extract(month from p_completed_on)::integer,
            least(extract(day from p_completed_on)::integer, last_day)
          );
      end case;
    when 'weekly' then
      weekday_delta := (target_chore.weekday - extract(dow from p_completed_on)::integer + 7) % 7;
      calculated_due := p_completed_on + case when weekday_delta = 0 then 7 else weekday_delta end;
    when 'monthly' then
      target_month := date_trunc('month', p_completed_on)::date;
      last_day := extract(day from (date_trunc('month', target_month) + interval '1 month - 1 day'))::integer;
      calculated_due := make_date(
        extract(year from target_month)::integer,
        extract(month from target_month)::integer,
        least(target_chore.day_of_month, last_day)
      );
      if calculated_due <= p_completed_on then
        target_month := (date_trunc('month', p_completed_on) + interval '1 month')::date;
        last_day := extract(day from (date_trunc('month', target_month) + interval '1 month - 1 day'))::integer;
        calculated_due := make_date(
          extract(year from target_month)::integer,
          extract(month from target_month)::integer,
          least(target_chore.day_of_month, last_day)
        );
      end if;
    when 'yearly' then
      target_year := extract(year from p_completed_on)::integer;
      last_day := extract(day from (
        date_trunc('month', make_date(target_year, target_chore.month_of_year, 1))
        + interval '1 month - 1 day'
      ))::integer;
      calculated_due := make_date(
        target_year,
        target_chore.month_of_year,
        least(target_chore.day_of_month, last_day)
      );
      if calculated_due <= p_completed_on then
        target_year := target_year + 1;
        last_day := extract(day from (
          date_trunc('month', make_date(target_year, target_chore.month_of_year, 1))
          + interval '1 month - 1 day'
        ))::integer;
        calculated_due := make_date(
          target_year,
          target_chore.month_of_year,
          least(target_chore.day_of_month, last_day)
        );
      end if;
    when 'once' then
      calculated_due := null;
  end case;

  update public.household_chores
  set
    last_completed_on = p_completed_on,
    next_due_on = calculated_due,
    is_active = case when schedule_type = 'once' then false else is_active end,
    updated_at = now()
  where id = p_chore_id;

  return inserted_completion;
end;
$$;

revoke all on function public.complete_household_chore(bigint, date, text) from public, anon;
grant execute on function public.complete_household_chore(bigint, date, text) to authenticated;

insert into public.household_appliances (
  catalog_key,
  name,
  manufacturer,
  model_number,
  support_url,
  note,
  created_by
)
values
  (
    'panasonic_cs255dfl', 'エアコン', 'Panasonic', 'CS-255DFL-W',
    'https://panasonic.jp/housing-aircon/products/CS-255DFL/support.html',
    '実機写真で型番確認済み', null
  ),
  (
    'panasonic_nptsp1', '食器洗い乾燥機', 'Panasonic', 'NP-TSP1',
    'https://panasonic.jp/dish/products/NP-TSP1/support.html',
    '実機写真で型番確認済み', null
  ),
  (
    'toshiba_tw127xp3', 'ドラム式洗濯乾燥機', 'TOSHIBA', 'TW-127XP3',
    'https://www.toshiba-lifestyle.com/jp/laundries/tw-127xp3/',
    '実機写真で型番確認済み', null
  ),
  (
    'eufy_omni_c28', 'ロボット掃除機', 'eufy', 'Omni C28 / T291X',
    'https://service.eufy.com/ca/product-description/a08e200000AO5onAAD',
    '本体はOmni C28、ステーションはT291X。細かな頻度は仮設定', null
  ),
  (
    'dyson_cordless_unknown', 'コードレス掃除機', 'Dyson', null, null,
    '型番未確認。型番確認まではフィルターの水洗い方法を確定しない', null
  ),
  (
    'dyson_purifier_unknown', '空気清浄ファン', 'Dyson', null, null,
    '型番未確認。型番確認まではフィルターの洗浄・交換方法を確定しない', null
  )
on conflict (catalog_key) do nothing;

insert into public.household_chores (
  catalog_key,
  title,
  category,
  assigned_to,
  schedule_type,
  interval_value,
  interval_unit,
  next_due_on,
  appliance_id,
  note,
  sort_order,
  created_by
)
values
  ('toilet_weekly', 'トイレ全体を掃除', 'トイレ', 'ふたり', 'interval', 1, 'weeks', current_date + 1, null, null, 10, null),
  ('bathroom_weekly', '浴室の床・壁・排水口を掃除', '浴室・洗面', 'ふたり', 'interval', 1, 'weeks', current_date + 2, null, null, 20, null),
  ('floor_weekly', '床とラグを掃除', 'リビング・寝室', 'ふたり', 'interval', 1, 'weeks', current_date + 3, null, null, 30, null),
  ('sheets_biweekly', 'シーツ・枕カバーを交換', 'リビング・寝室', 'ふたり', 'interval', 2, 'weeks', current_date + 4, null, null, 40, null),
  ('sink_weekly', 'シンク・排水口を掃除', 'キッチン', 'ふたり', 'interval', 1, 'weeks', current_date + 5, null, null, 50, null),
  ('microwave_weekly', '電子レンジ庫内を拭く', '家電', 'ふたり', 'interval', 1, 'weeks', current_date + 6, null, null, 60, null),
  ('fridge_monthly', '冷蔵庫の棚・野菜室を掃除', 'キッチン', 'ふたり', 'interval', 1, 'months', current_date + 7, null, null, 70, null),
  ('bathroom_deep_monthly', '浴室排水口を分解して掃除', '浴室・洗面', 'ふたり', 'interval', 1, 'months', current_date + 8, null, null, 80, null),
  ('vent_filter_quarterly', '室内換気口のフィルターを掃除', 'リビング・寝室', 'ふたり', 'interval', 3, 'months', current_date + 9, null, null, 90, null),
  ('range_hood_quarterly', 'レンジフード・換気扇を掃除', 'キッチン', 'ふたり', 'interval', 3, 'months', current_date + 10, null, null, 100, null),
  ('windows_quarterly', '窓・窓枠・サッシを掃除', 'リビング・寝室', 'ふたり', 'interval', 3, 'months', current_date + 11, null, null, 110, null),
  ('balcony_quarterly', 'ベランダ・排水口を掃除', '玄関・屋外', 'ふたり', 'interval', 3, 'months', current_date + 12, null, null, 120, null),
  ('disaster_stock_halfyear', '防災備蓄・非常食の期限を確認', '防災・季節', 'ふたり', 'interval', 6, 'months', current_date + 13, null, null, 130, null),
  ('fridge_back_halfyear', '冷蔵庫の背面・下のほこりを取る', '家電', 'ふたり', 'interval', 6, 'months', current_date + 14, null, '電源・設置条件に注意し取扱説明書を確認', 140, null),
  ('alarm_halfyear', '火災報知器の作動を確認', '防災・季節', 'ふたり', 'interval', 6, 'months', current_date + 15, null, null, 150, null),
  ('manuals_yearly', '家電の取扱説明書・保証期間を確認', '家電', 'ふたり', 'interval', 1, 'years', current_date + 16, null, null, 160, null),
  ('panasonic_aircon_filter_biweekly', 'エアコンのフィルターを掃除', '家電', 'ふたり', 'interval', 2, 'weeks', current_date + 2, (select id from public.household_appliances where catalog_key = 'panasonic_cs255dfl'), '公式サポートを基準に設定', 210, null),
  ('panasonic_dishwasher_filter_weekly', '食洗機の残さいフィルターを掃除', '家電', 'ふたり', 'interval', 1, 'weeks', current_date + 3, (select id from public.household_appliances where catalog_key = 'panasonic_nptsp1'), '公式のお手入れ目安は週1回', 220, null),
  ('panasonic_dishwasher_inside_biweekly', '食洗機の庫内を洗浄', '家電', 'ふたり', 'interval', 2, 'weeks', current_date + 4, (select id from public.household_appliances where catalog_key = 'panasonic_nptsp1'), '公式のお手入れ目安は月2～3回', 230, null),
  ('panasonic_dishwasher_drain_monthly', '食洗機の排水口カバー・パッキンを手入れ', '家電', 'ふたり', 'interval', 1, 'months', current_date + 5, (select id from public.household_appliances where catalog_key = 'panasonic_nptsp1'), '公式説明書を確認して作業する', 240, null),
  ('toshiba_washer_60c_quarterly', '洗濯機の60℃温水槽クリーン', '洗濯', 'ふたり', 'interval', 3, 'months', current_date + 6, (select id from public.household_appliances where catalog_key = 'toshiba_tw127xp3'), '公式機能に合わせて設定', 250, null),
  ('toshiba_washer_autodose_quarterly', '洗剤・柔軟剤の自動投入タンクと経路を手入れ', '洗濯', 'ふたり', 'interval', 3, 'months', current_date + 7, (select id from public.household_appliances where catalog_key = 'toshiba_tw127xp3'), '公式目安は2～3か月。3か月で設定', 260, null),
  ('eufy_water_mop_tray_weekly', '水タンク・モップ・洗浄トレイを手入れ', '家電', 'ふたり', 'interval', 1, 'weeks', current_date + 1, (select id from public.household_appliances where catalog_key = 'eufy_omni_c28'), '仮頻度。使用状況と公式説明書に合わせて調整', 270, null),
  ('eufy_brush_wheels_biweekly', 'ブラシ・車輪を手入れ', '家電', 'ふたり', 'interval', 2, 'weeks', current_date + 8, (select id from public.household_appliances where catalog_key = 'eufy_omni_c28'), '仮頻度。使用状況と公式説明書に合わせて調整', 280, null),
  ('eufy_sensors_monthly', 'センサーと充電端子を拭く', '家電', 'ふたり', 'interval', 1, 'months', current_date + 9, (select id from public.household_appliances where catalog_key = 'eufy_omni_c28'), '仮頻度。乾いた柔らかい布を使う', 290, null),
  ('eufy_consumables_quarterly', '消耗品の状態を確認', '家電', 'ふたり', 'interval', 3, 'months', current_date + 10, (select id from public.household_appliances where catalog_key = 'eufy_omni_c28'), '仮頻度。アプリの残量表示と使用状況も確認', 300, null),
  ('dyson_vacuum_bin_weekly', '掃除機のクリアビンを手入れ', '家電', 'ふたり', 'interval', 1, 'weeks', current_date + 2, (select id from public.household_appliances where catalog_key = 'dyson_cordless_unknown'), '使用状況に応じて実施。型番確認後に手順を確定', 310, null),
  ('dyson_vacuum_head_monthly', '掃除機ヘッドの絡まりを取り除く', '家電', 'ふたり', 'interval', 1, 'months', current_date + 11, (select id from public.household_appliances where catalog_key = 'dyson_cordless_unknown'), '型番確認後に公式手順へ更新', 320, null),
  ('dyson_vacuum_filter_monthly', '掃除機フィルターの状態を確認', '家電', 'ふたり', 'interval', 1, 'months', current_date + 12, (select id from public.household_appliances where catalog_key = 'dyson_cordless_unknown'), '型番確認までは水洗い可否を確定しない', 330, null),
  ('dyson_purifier_inlet_monthly', '空気清浄ファンの吸込口を手入れ', '家電', 'ふたり', 'interval', 1, 'months', current_date + 13, (select id from public.household_appliances where catalog_key = 'dyson_purifier_unknown'), '型番確認後に公式手順へ更新', 340, null),
  ('dyson_purifier_filter_monthly', '空気清浄ファンのフィルター残量を確認', '家電', 'ふたり', 'interval', 1, 'months', current_date + 14, (select id from public.household_appliances where catalog_key = 'dyson_purifier_unknown'), '型番確認までは洗浄・交換方法を確定しない', 350, null)
on conflict (catalog_key) do nothing;

do $$
declare
  table_name text;
begin
  foreach table_name in array array['household_appliances', 'household_chores', 'household_chore_completions']
  loop
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = table_name
    ) then
      execute format('alter publication supabase_realtime add table public.%I', table_name);
    end if;
  end loop;
end;
$$;

commit;
