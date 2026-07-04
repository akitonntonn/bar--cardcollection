-- =========================================================================
-- BAR & — アップグレード v4 : コンプ報酬（セット達成でボーナスガチャ）
-- -------------------------------------------------------------------------
-- 適用方法: upgrade_v3.sql の後に、SQL Editor に貼り付けて Run（再Run安全）。
--
-- 仕組み:
--   * comp_rewards … 報酬セットの定義（誰でも閲覧可。達成判定はサーバ側）
--       rule_type 'limited' = 期間限定カード全種（今は夏限定10種）
--       rule_type 'rarity'  = そのレアリティ全種（期間限定は含まない）
--       rule_type 'ids'     = card_ids で個別指定（将来用）
--   * comp_claims  … 受け取り記録（1人1セット1回）
--   * claim_comp() … 達成をサーバで検証してボーナスガチャを付与
--     → 付与は pull_grants にも記録されるので管理画面の付与履歴に載る
-- =========================================================================

-- ---------------------------------------------------------------------------
-- 1) テーブル
-- ---------------------------------------------------------------------------
create table if not exists public.comp_rewards (
  id           text primary key,           -- 例 'summer-2026'
  title        text not null,
  description  text,
  rule_type    text not null check (rule_type in ('limited', 'rarity', 'ids')),
  rarity       text,                       -- rule_type='rarity' の時に使用
  card_ids     text[],                     -- rule_type='ids' の時に使用
  reward_pulls int  not null check (reward_pulls > 0),
  active       boolean not null default true,
  sort         int not null default 0
);

create table if not exists public.comp_claims (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  comp_id    text not null references public.comp_rewards (id) on delete cascade,
  claimed_at timestamptz not null default now(),
  primary key (user_id, comp_id)
);

alter table public.comp_rewards enable row level security;
alter table public.comp_claims  enable row level security;

-- 定義は全員が閲覧可（進捗表示用）。書き込みポリシーは無し＝管理者/SQLのみ。
drop policy if exists comp_rewards_read_all on public.comp_rewards;
create policy comp_rewards_read_all on public.comp_rewards
  for select using (true);

-- 受け取り記録は本人だけ閲覧可。書き込みは claim_comp() 経由のみ。
drop policy if exists comp_claims_read_own on public.comp_claims;
create policy comp_claims_read_own on public.comp_claims
  for select using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 2) セット定義（変えたい時はここを編集して再Run）
-- ---------------------------------------------------------------------------
insert into public.comp_rewards (id, title, description, rule_type, rarity, reward_pulls, sort) values
  ('summer-2026',   '🌴 夏限定コンプ 2026', '夏限定カードを全種類あつめる（7・8月だけのチャンス！）', 'limited', null,     5, 0),
  ('normal-master', 'NORMALマスター',       '通常のNORMALを全種あつめる（夏限定はふくまない）',       'rarity',  'NORMAL', 3, 1),
  ('rare-master',   'RAREマスター',         'RAREを全種あつめる',                                     'rarity',  'RARE',   2, 2),
  ('sr-master',     'SRマスター',           'SRを全種あつめる（夏限定はふくまない）',                 'rarity',  'SR',     3, 3)
on conflict (id) do update set
  title = excluded.title,
  description = excluded.description,
  rule_type = excluded.rule_type,
  rarity = excluded.rarity,
  reward_pulls = excluded.reward_pulls,
  sort = excluded.sort;

-- ---------------------------------------------------------------------------
-- 3) セットに必要なカードID一覧（ルールをサーバ側で解決）
-- ---------------------------------------------------------------------------
create or replace function public.comp_required_ids(c public.comp_rewards)
returns setof text
language sql stable as $$
  select ca.id from public.cards ca
  where case c.rule_type
    when 'limited' then ca.months is not null
    when 'rarity'  then ca.rarity = c.rarity and ca.months is null
    else ca.id = any (coalesce(c.card_ids, array[]::text[]))
  end;
$$;

-- ---------------------------------------------------------------------------
-- 4) claim_comp : 達成していれば報酬を付与（1人1回）
--    戻り: { ok:true, reward_pulls, bonus_pulls }
--        | { ok:false, reason:'not_found'|'already_claimed'|'incomplete', missing }
-- ---------------------------------------------------------------------------
create or replace function public.claim_comp(p_comp_id text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  uid       uuid := auth.uid();
  comp      public.comp_rewards%rowtype;
  total_req int;
  missing   int;
  new_bonus int;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  select * into comp from public.comp_rewards
    where id = p_comp_id and active for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  if exists (select 1 from public.comp_claims where user_id = uid and comp_id = comp.id) then
    return jsonb_build_object('ok', false, 'reason', 'already_claimed');
  end if;

  select count(*) into total_req from public.comp_required_ids(comp) t(id);
  select count(*) into missing
    from public.comp_required_ids(comp) t(id)
   where not exists (
     select 1 from public.user_cards uc
      where uc.user_id = uid and uc.card_id = t.id and uc.count > 0
   );

  if total_req = 0 or missing > 0 then
    return jsonb_build_object('ok', false, 'reason', 'incomplete', 'missing', missing);
  end if;

  insert into public.comp_claims (user_id, comp_id) values (uid, comp.id);
  update public.profiles
     set bonus_pulls = bonus_pulls + comp.reward_pulls
   where id = uid
   returning bonus_pulls into new_bonus;
  insert into public.pull_grants (user_id, amount, reason)
    values (uid, comp.reward_pulls, 'コンプ報酬: ' || comp.title);

  return jsonb_build_object('ok', true, 'reward_pulls', comp.reward_pulls, 'bonus_pulls', new_bonus);
end;
$$;

revoke all on function public.claim_comp(text) from public, anon;
grant execute on function public.claim_comp(text) to authenticated;
