-- =========================================================================
-- BAR & — STAFF CARD COLLECTION : サーバ側ロジック（RPC関数）
-- -------------------------------------------------------------------------
-- schema.sql → seed_cards.sql の後に、SQL Editor で Run してください。
--
-- ここが「サーバ権威」の要。ガチャ抽選・回数消費・被り救済・付与を
-- すべてDB側で行い、ブラウザからは結果だけ受け取る（＝改ざん不可）。
-- フロントからは supabase.rpc('draw_gacha') のように呼び出します。
-- =========================================================================

-- 排出率（%）。SR枠は SR実カード＋夏限定シークレット(gacha_bucket='SR') が共有する。
-- 変更したい時はここだけ直す。
create or replace function public.gacha_rates()
returns jsonb language sql immutable as $$
  select '{"NORMAL":78,"RARE":17,"SR":5}'::jsonb;
$$;

-- ---------------------------------------------------------------------------
-- draw_gacha() : デイリー1回＋ボーナス＋被り救済＋月ゲート＋バケット抽選
--   戻り値(jsonb):
--     { ok:true, card:{...}, was_new, got_bonus, bonus_pulls, dupe_stock,
--       daily_available, pulls_available }
--     { ok:false, reason:'no_pulls' | 'no_cards' }
-- ---------------------------------------------------------------------------
create or replace function public.draw_gacha()
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  uid          uuid := auth.uid();
  prof         public.profiles%rowtype;
  today        date := (now() at time zone 'Asia/Tokyo')::date;
  cur_month    int  := extract(month from (now() at time zone 'Asia/Tokyo'))::int;
  rates        jsonb := public.gacha_rates();
  has_daily    boolean;
  avail        int;
  use_source   text;
  total_weight numeric;
  roll         numeric;
  chosen_bucket text;
  chosen       public.cards%rowtype;
  had_count    int;
  was_new      boolean;
  got_bonus    boolean := false;
  DUPE_THRESHOLD constant int := 3;  -- 被り“合計”3枚で無料ガチャ1回（app.js と一致）
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  -- 行ロックで同時多重引きを防止
  select * into prof from public.profiles where id = uid for update;
  if not found then
    raise exception 'profile not found';
  end if;

  has_daily := (prof.last_daily_date is distinct from today);
  avail     := (case when has_daily then 1 else 0 end) + prof.bonus_pulls;
  if avail <= 0 then
    return jsonb_build_object('ok', false, 'reason', 'no_pulls');
  end if;

  -- 有効な枠の合計重み（在庫のある枠のみ／月ゲート考慮）
  select coalesce(sum(weight), 0) into total_weight
  from (
    select distinct coalesce(c.gacha_bucket, c.rarity) as bucket,
           (rates ->> coalesce(c.gacha_bucket, c.rarity))::numeric as weight
    from public.cards c
    where (c.gacha or c.rarity in ('NORMAL','RARE','SR'))
      and (c.months is null or cur_month = any (c.months))
      and rates ? coalesce(c.gacha_bucket, c.rarity)
  ) b;

  if total_weight is null or total_weight <= 0 then
    return jsonb_build_object('ok', false, 'reason', 'no_cards');
  end if;

  -- 枠を重み付き抽選（累積和で選ぶ）
  roll := random() * total_weight;
  select bucket into chosen_bucket
  from (
    select bucket,
           sum(weight) over (order by bucket rows between unbounded preceding and current row) as cum
    from (
      select distinct coalesce(c.gacha_bucket, c.rarity) as bucket,
             (rates ->> coalesce(c.gacha_bucket, c.rarity))::numeric as weight
      from public.cards c
      where (c.gacha or c.rarity in ('NORMAL','RARE','SR'))
        and (c.months is null or cur_month = any (c.months))
        and rates ? coalesce(c.gacha_bucket, c.rarity)
    ) w
  ) x
  where roll <= cum
  order by cum
  limit 1;

  -- その枠の中からランダムに1枚
  select * into chosen
  from public.cards c
  where coalesce(c.gacha_bucket, c.rarity) = chosen_bucket
    and (c.gacha or c.rarity in ('NORMAL','RARE','SR'))
    and (c.months is null or cur_month = any (c.months))
  order by random()
  limit 1;

  if chosen.id is null then
    return jsonb_build_object('ok', false, 'reason', 'no_cards');
  end if;

  -- 所持状況（新規判定→加算）
  select uc.count into had_count from public.user_cards uc where uc.user_id = uid and uc.card_id = chosen.id;
  was_new := (had_count is null or had_count = 0);
  insert into public.user_cards (user_id, card_id, count)
    values (uid, chosen.id, 1)
    on conflict (user_id, card_id) do update set count = public.user_cards.count + 1;

  -- 回数消費（デイリー優先 → ボーナス）
  if has_daily then
    use_source := 'daily';
    update public.profiles set last_daily_date = today where id = uid;
  else
    use_source := 'bonus';
    update public.profiles set bonus_pulls = bonus_pulls - 1 where id = uid;
  end if;

  -- 被り救済（合計3枚でボーナス+1）
  if not was_new then
    update public.profiles set dupe_stock = dupe_stock + 1 where id = uid;
    select dupe_stock into prof.dupe_stock from public.profiles where id = uid;
    if prof.dupe_stock >= DUPE_THRESHOLD then
      update public.profiles
        set dupe_stock = dupe_stock - DUPE_THRESHOLD,
            bonus_pulls = bonus_pulls + 1
        where id = uid;
      got_bonus := true;
    end if;
  end if;

  insert into public.pulls (user_id, card_id, source, was_new)
    values (uid, chosen.id, use_source, was_new);

  -- 最新状態を返す
  select * into prof from public.profiles where id = uid;
  return jsonb_build_object(
    'ok', true,
    'card', to_jsonb(chosen),
    'was_new', was_new,
    'got_bonus', got_bonus,
    'bonus_pulls', prof.bonus_pulls,
    'dupe_stock', prof.dupe_stock,
    'daily_available', (prof.last_daily_date is distinct from today),
    'pulls_available', (case when prof.last_daily_date is distinct from today then 1 else 0 end) + prof.bonus_pulls
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 管理者ヘルパ: 呼び出し元が管理者か確認して例外を投げる
-- ---------------------------------------------------------------------------
create or replace function public.assert_admin()
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and is_admin) then
    raise exception 'admin only';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- grant_pulls(target, amount, reason) : 管理者が「◯円利用→ガチャ+N回」を付与
-- ---------------------------------------------------------------------------
create or replace function public.grant_pulls(target uuid, amount int, reason text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_admin();
  if amount is null or amount <= 0 then
    raise exception 'amount must be positive';
  end if;
  update public.profiles set bonus_pulls = bonus_pulls + amount where id = target;
  insert into public.pull_grants (user_id, amount, reason, created_by)
    values (target, amount, reason, auth.uid());
  return jsonb_build_object('ok', true, 'granted', amount);
end;
$$;

-- ---------------------------------------------------------------------------
-- grant_card(target, card_id, source) : 特定カードを直接付与
--   （誕生日SSR・来店記念など。source は 'grant' か 'visit'）
-- ---------------------------------------------------------------------------
create or replace function public.grant_card(target uuid, p_card_id text, p_source text default 'grant')
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  had_count int;
  was_new   boolean;
begin
  perform public.assert_admin();
  if not exists (select 1 from public.cards where id = p_card_id) then
    raise exception 'card not found: %', p_card_id;
  end if;
  if p_source not in ('grant','visit') then
    raise exception 'invalid source';
  end if;

  select uc.count into had_count from public.user_cards uc where uc.user_id = target and uc.card_id = p_card_id;
  was_new := (had_count is null or had_count = 0);
  insert into public.user_cards (user_id, card_id, count)
    values (target, p_card_id, 1)
    on conflict (user_id, card_id) do update set count = public.user_cards.count + 1;
  insert into public.pulls (user_id, card_id, source, was_new)
    values (target, p_card_id, p_source, was_new);

  return jsonb_build_object('ok', true, 'card_id', p_card_id, 'was_new', was_new);
end;
$$;

-- ---------------------------------------------------------------------------
-- record_visit(target, note) : 来店を記録（誕生日オリシャン等の根拠）
-- ---------------------------------------------------------------------------
create or replace function public.record_visit(target uuid, note text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_admin();
  insert into public.visits (user_id, note, created_by)
    values (target, note, auth.uid());
  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- 実行権限：ログイン済みユーザーのみ。管理チェックは関数内で行う。
-- ---------------------------------------------------------------------------
revoke all on function public.draw_gacha()                          from public, anon;
revoke all on function public.grant_pulls(uuid, int, text)          from public, anon;
revoke all on function public.grant_card(uuid, text, text)          from public, anon;
revoke all on function public.record_visit(uuid, text)              from public, anon;

grant execute on function public.draw_gacha()                       to authenticated;
grant execute on function public.grant_pulls(uuid, int, text)       to authenticated;
grant execute on function public.grant_card(uuid, text, text)       to authenticated;
grant execute on function public.record_visit(uuid, text)           to authenticated;
