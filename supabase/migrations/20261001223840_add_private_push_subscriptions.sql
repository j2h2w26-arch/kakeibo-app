begin;

-- This schema MUST NOT be added to PostgREST's exposed schemas.
create schema push_private;
revoke all on schema push_private from public, anon, authenticated;
grant usage on schema push_private to authenticated;
alter default privileges in schema push_private revoke execute on functions from public;

create table push_private.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_members(user_id) on delete cascade,
  endpoint text not null unique check (char_length(endpoint) between 1 and 2048),
  p256dh text not null,
  auth_secret text not null,
  device_name text not null check (char_length(btrim(device_name)) between 1 and 40),
  consented_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index push_subscriptions_user_idx on push_private.subscriptions(user_id);
alter table push_private.subscriptions enable row level security;
-- No direct client reads/writes, even for the owner. Only redacted RPC results.
-- No policies intentionally: RLS also denies access if a table grant is added by mistake.
revoke all on table push_private.subscriptions from public, anon, authenticated;

create function push_private.register_subscription(
  p_endpoint text, p_p256dh text, p_auth text, p_device_name text, p_consent boolean
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  existing push_private.subscriptions%rowtype;
  saved push_private.subscriptions%rowtype;
  decoded_key bytea;
begin
  if actor is null then
    raise exception '認証が必要です。' using errcode = '42501';
  end if;
  -- Lock the member row to serialize quota checks and membership removal.
  perform 1 from public.app_members where user_id = actor for update;
  if not found then
    raise exception '家族メンバーだけが利用できます。' using errcode = '42501';
  end if;
  if p_consent is distinct from true then
    raise exception 'この端末での通知への同意が必要です。' using errcode = '22023';
  end if;
  -- Exact provider hosts only. This stores a subscription; it never fetches the URL.
  -- The future sender must additionally reject redirects and private DNS results.
  if p_endpoint is null or char_length(p_endpoint) > 2048
    or p_endpoint ~ '[[:space:]]' or position('..' in p_endpoint) > 0
    or not (
      p_endpoint ~ '^https://fcm[.]googleapis[.]com/fcm/send/[A-Za-z0-9_-]+$'
      or p_endpoint ~ '^https://web[.]push[.]apple[.]com/[A-Za-z0-9/_-]+$'
      or p_endpoint ~ '^https://[a-z0-9-]+[.]notify[.]windows[.]com/[A-Za-z0-9/_?=%&.+~-]+$'
      or p_endpoint ~ '^https://updates[.]push[.]services[.]mozilla[.]com/wpush/v2/[A-Za-z0-9_-]+$'
    ) then
    raise exception '対応する通知先ではありません。' using errcode = '22023';
  end if;
  if p_device_name is null or char_length(btrim(p_device_name)) not between 1 and 40
    or p_device_name ~ '[[:cntrl:]]' then
    raise exception '端末名は1〜40文字で入力してください。' using errcode = '22023';
  end if;
  -- Unpadded base64url: 65-byte uncompressed P-256 key and 16-byte auth secret.
  -- These are subscription keys, never VAPID private keys.
  if p_p256dh is null or p_auth is null
    or p_p256dh !~ '^[A-Za-z0-9_-]{87}$' or p_auth !~ '^[A-Za-z0-9_-]{22}$' then
    raise exception '通知の鍵の形式が不正です。' using errcode = '22023';
  end if;
  decoded_key := decode(translate(p_p256dh, '-_', '+/') || '=', 'base64');
  if octet_length(decoded_key) <> 65 or get_byte(decoded_key, 0) <> 4
    or rtrim(translate(replace(encode(decoded_key, 'base64'), E'\n', ''), '+/', '-_'), '=') <> p_p256dh
    or rtrim(translate(encode(decode(translate(p_auth, '-_', '+/') || '==', 'base64'), 'base64'), '+/', '-_'), '=') <> p_auth then
    raise exception '通知の鍵の形式が不正です。' using errcode = '22023';
  end if;

  select * into existing from push_private.subscriptions where endpoint = p_endpoint for update;
  if found then
    if existing.user_id <> actor then
      raise exception 'この通知先は登録できません。' using errcode = '22023';
    end if;
    update push_private.subscriptions
      set p256dh = p_p256dh, auth_secret = p_auth, device_name = btrim(p_device_name),
          consented_at = now(), updated_at = now()
      where id = existing.id returning * into saved;
  else
    if (select count(*) from push_private.subscriptions where user_id = actor) >= 10 then
      raise exception '登録できる端末は10台までです。不要な端末を解除してください。' using errcode = '22023';
    end if;
    begin
      insert into push_private.subscriptions(user_id, endpoint, p256dh, auth_secret, device_name)
        values (actor, p_endpoint, p_p256dh, p_auth, btrim(p_device_name)) returning * into saved;
    exception when unique_violation then
      -- Never return a conflicting row, endpoint or key through database error details.
      raise exception 'この通知先は登録できません。' using errcode = '22023';
    end;
  end if;
  return jsonb_build_object('id', saved.id, 'device_name', saved.device_name,
    'consented_at', saved.consented_at, 'created_at', saved.created_at, 'updated_at', saved.updated_at);
end;
$$;

create function push_private.list_subscriptions() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare actor uuid := auth.uid();
begin
  if actor is null or not exists (select 1 from public.app_members where user_id = actor) then
    raise exception '家族メンバーの認証が必要です。' using errcode = '42501';
  end if;
  return (select coalesce(jsonb_agg(jsonb_build_object(
    'id', id, 'device_name', device_name, 'consented_at', consented_at,
    'created_at', created_at, 'updated_at', updated_at
  ) order by created_at, id), '[]'::jsonb)
  from push_private.subscriptions where user_id = actor);
end;
$$;

create function push_private.remove_subscription(p_id uuid) returns boolean
language plpgsql security definer set search_path = ''
as $$
declare actor uuid := auth.uid();
begin
  if actor is null or not exists (select 1 from public.app_members where user_id = actor) then
    raise exception '家族メンバーの認証が必要です。' using errcode = '42501';
  end if;
  -- Idempotent and does not reveal whether another user's id exists.
  delete from push_private.subscriptions where id = p_id and user_id = actor;
  return true;
end;
$$;

revoke all on function push_private.register_subscription(text,text,text,text,boolean) from public, anon, authenticated;
revoke all on function push_private.list_subscriptions() from public, anon, authenticated;
revoke all on function push_private.remove_subscription(uuid) from public, anon, authenticated;
grant execute on function push_private.register_subscription(text,text,text,text,boolean) to authenticated;
grant execute on function push_private.list_subscriptions() to authenticated;
grant execute on function push_private.remove_subscription(uuid) to authenticated;

-- The exposed entry points are invokers; privileged implementation stays private.
create function public.register_push_subscription(
  p_endpoint text, p_p256dh text, p_auth text, p_device_name text, p_consent boolean
) returns jsonb language sql security invoker set search_path = '' as $$
  select push_private.register_subscription(p_endpoint, p_p256dh, p_auth, p_device_name, p_consent);
$$;
create function public.list_push_subscriptions() returns jsonb
language sql stable security invoker set search_path = '' as $$
  select push_private.list_subscriptions();
$$;
create function public.remove_push_subscription(p_id uuid) returns boolean
language sql security invoker set search_path = '' as $$
  select push_private.remove_subscription(p_id);
$$;
revoke all on function public.register_push_subscription(text,text,text,text,boolean) from public, anon, authenticated;
revoke all on function public.list_push_subscriptions() from public, anon, authenticated;
revoke all on function public.remove_push_subscription(uuid) from public, anon, authenticated;
grant execute on function public.register_push_subscription(text,text,text,text,boolean) to authenticated;
grant execute on function public.list_push_subscriptions() to authenticated;
grant execute on function public.remove_push_subscription(uuid) to authenticated;

-- No subscription is seeded. No preferences, scheduler, sender or existing rows change.
commit;
