-- =========================================================================
-- BAR & — アップグレード v2 : QRコード引換 ＋ 管理者ポータル用RPC
-- -------------------------------------------------------------------------
-- 適用方法: schema.sql / seed_cards.sql / functions.sql の後に、
--           SQL Editor に貼り付けて Run（再Runしても安全な書き方）。
--
-- 追加されるもの:
--   * redeem_codes / redeem_uses … QRコード引換（来店QR・誕生日SSR・ガチャ配布）
--   * create_redeem_code()       … 管理者がコードを発行
--   * redeem_code()              … お客さんがコードを使う（?redeem=CODE）
--   * admin_find_user()          … メールでお客さんを検索（管理画面用）
--   * admin_list_codes()         … 最近の発行コード一覧（管理画面用）
-- =========================================================================

-- ---------------------------------------------------------------------------
-- 1) 引換コード（QRの中身）。kind='card'なら特定カード、'pulls'ならガチャ回数。
-- ---------------------------------------------------------------------------
create table if not exists public.redeem_codes (
  code       text primary key,                    -- 8桁の英数字（自動生成）
  kind       text not null check (kind in ('card','pulls')),
  card_id    text references public.cards (id),
  pulls      int  check (pulls is null or pulls > 0),
  note       text,                                -- 用途メモ（例: かける誕生日SSR）
  expires_at timestamptz,                         -- 期限（NULL=無期限）
  max_uses   int  not null default 1 check (max_uses > 0),
  used_count int  not null default 0,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  constraint redeem_kind_payload check (
    (kind = 'card'  and card_id is not null) or
    (kind = 'pulls' and pulls   is not null)
  )
);

-- 同じ人が同じコードを2回使えないようにする記録
create table if not exists public.redeem_uses (
  code    text not null references public.redeem_codes (code) on delete cascade,
  user_id uuid not null references public.profiles (id)       on delete cascade,
  used_at timestamptz not null default now(),
  primary key (code, user_id)
);

-- RLS: ポリシーを一切付けない＝ブラウザから直接は読めない/書けない。
-- アクセスはすべて下の security definer 関数経由。
alter table public.redeem_codes enable row level security;
alter table public.redeem_uses  enable row level security;

-- ---------------------------------------------------------------------------
-- 2) create_redeem_code : 管理者がコードを発行
--    例) select create_redeem_code('card',  'kakeru-ssr01', null, 7, 1, 'かける誕生日');
--        select create_redeem_code('pulls', null, 5, 30, 10, '5000円利用キャンペーン');
-- ---------------------------------------------------------------------------
create or replace function public.create_redeem_code(
  p_kind         text,
  p_card_id      text default null,
  p_pulls        int  default null,
  p_expires_days int  default 7,
  p_max_uses     int  default 1,
  p_note         text default null
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  new_code text;
begin
  perform public.assert_admin();
  if p_kind not in ('card','pulls') then
    raise exception 'kind must be card or pulls';
  end if;
  if p_kind = 'card' and (p_card_id is null
      or not exists (select 1 from public.cards where id = p_card_id)) then
    raise exception 'card not found: %', coalesce(p_card_id, '(null)');
  end if;
  if p_kind = 'pulls' and (p_pulls is null or p_pulls <= 0) then
    raise exception 'pulls must be positive';
  end if;

  -- 8桁コード生成（重複したら作り直し）
  loop
    new_code := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));
    exit when not exists (select 1 from public.redeem_codes where code = new_code);
  end loop;

  insert into public.redeem_codes (code, kind, card_id, pulls, note, expires_at, max_uses, created_by)
  values (
    new_code, p_kind,
    case when p_kind = 'card'  then p_card_id else null end,
    case when p_kind = 'pulls' then p_pulls   else null end,
    p_note,
    case when p_expires_days is null then null
         else now() + make_interval(days => p_expires_days) end,
    coalesce(p_max_uses, 1),
    auth.uid()
  );

  return jsonb_build_object('ok', true, 'code', new_code);
end;
$$;

-- ---------------------------------------------------------------------------
-- 3) redeem_code : お客さんがコードを使う（ログイン必須）
--    戻り: { ok:true, kind:'card', card:{...}, was_new } |
--          { ok:true, kind:'pulls', pulls:N } |
--          { ok:false, reason:'not_found'|'expired'|'exhausted'|'already_used' }
-- ---------------------------------------------------------------------------
create or replace function public.redeem_code(p_code text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  uid     uuid := auth.uid();
  rc      public.redeem_codes%rowtype;
  c       public.cards%rowtype;
  had     int;
  was_new boolean;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  select * into rc from public.redeem_codes
    where code = upper(trim(p_code)) for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  if rc.expires_at is not null and now() > rc.expires_at then
    return jsonb_build_object('ok', false, 'reason', 'expired');
  end if;
  if rc.used_count >= rc.max_uses then
    return jsonb_build_object('ok', false, 'reason', 'exhausted');
  end if;
  if exists (select 1 from public.redeem_uses where code = rc.code and user_id = uid) then
    return jsonb_build_object('ok', false, 'reason', 'already_used');
  end if;

  insert into public.redeem_uses (code, user_id) values (rc.code, uid);
  update public.redeem_codes set used_count = used_count + 1 where code = rc.code;

  if rc.kind = 'pulls' then
    update public.profiles set bonus_pulls = bonus_pulls + rc.pulls where id = uid;
    insert into public.pull_grants (user_id, amount, reason, created_by)
      values (uid, rc.pulls, coalesce(rc.note, 'QRコード引換'), rc.created_by);
    return jsonb_build_object('ok', true, 'kind', 'pulls', 'pulls', rc.pulls);
  else
    select * into c from public.cards where id = rc.card_id;
    select uc.count into had from public.user_cards uc
      where uc.user_id = uid and uc.card_id = c.id;
    was_new := (had is null or had = 0);
    insert into public.user_cards (user_id, card_id, count)
      values (uid, c.id, 1)
      on conflict (user_id, card_id) do update set count = public.user_cards.count + 1;
    insert into public.pulls (user_id, card_id, source, was_new)
      values (uid, c.id, 'visit', was_new);
    return jsonb_build_object('ok', true, 'kind', 'card', 'card', to_jsonb(c), 'was_new', was_new);
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4) admin_find_user : メール（部分一致）でお客さんを1人検索（管理画面用）
-- ---------------------------------------------------------------------------
create or replace function public.admin_find_user(p_email text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  u record;
begin
  perform public.assert_admin();
  select au.id,
         au.email,
         p.display_name,
         p.is_admin,
         p.bonus_pulls,
         p.dupe_stock,
         p.last_daily_date,
         (select count(*)               from public.user_cards uc where uc.user_id = au.id and uc.count > 0) as owned_kinds,
         (select coalesce(sum(uc.count), 0) from public.user_cards uc where uc.user_id = au.id)              as total_cards
    into u
    from auth.users au
    join public.profiles p on p.id = au.id
   where au.email ilike '%' || trim(p_email) || '%'
   order by au.created_at desc
   limit 1;

  if u.id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  return jsonb_build_object('ok', true, 'user', to_jsonb(u));
end;
$$;

-- ---------------------------------------------------------------------------
-- 5) admin_list_codes : 最近の発行コード20件（管理画面用）
-- ---------------------------------------------------------------------------
create or replace function public.admin_list_codes()
returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_admin();
  return coalesce((
    select jsonb_agg(to_jsonb(t)) from (
      select code, kind, card_id, pulls, note, expires_at, max_uses, used_count, created_at
        from public.redeem_codes
       order by created_at desc
       limit 20
    ) t
  ), '[]'::jsonb);
end;
$$;

-- ---------------------------------------------------------------------------
-- 実行権限：ログイン済みユーザーのみ（管理チェックは関数内 assert_admin）
-- ---------------------------------------------------------------------------
revoke all on function public.create_redeem_code(text, text, int, int, int, text) from public, anon;
revoke all on function public.redeem_code(text)                                   from public, anon;
revoke all on function public.admin_find_user(text)                               from public, anon;
revoke all on function public.admin_list_codes()                                  from public, anon;

grant execute on function public.create_redeem_code(text, text, int, int, int, text) to authenticated;
grant execute on function public.redeem_code(text)                                   to authenticated;
grant execute on function public.admin_find_user(text)                               to authenticated;
grant execute on function public.admin_list_codes()                                  to authenticated;
