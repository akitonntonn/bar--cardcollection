-- =========================================================================
-- BAR & — アップグレード v3 : ウェルカム特典 ＋ 付与履歴（管理画面用）
-- -------------------------------------------------------------------------
-- 適用方法: upgrade_v2.sql の後に、SQL Editor に貼り付けて Run。
--
-- 追加されるもの:
--   * 新規登録ウェルカム特典 … 会員登録した瞬間にボーナスガチャ3回付与
--   * admin_activity_log()   … 付与・引換・来店の履歴一覧（管理画面用）
-- =========================================================================

-- ---------------------------------------------------------------------------
-- 1) ウェルカム特典: 新規ユーザーの profiles 作成時に bonus_pulls = 3
--    （既存ユーザーには影響しない。回数を変えたい時は下の「3」を書き換えて再Run）
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, bonus_pulls)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)),
    3  -- ★ウェルカム特典：登録した瞬間にボーナスガチャ3回
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2) admin_activity_log : 付与・QR引換・来店の直近50件（新しい順）
--    種類: 'ガチャ付与' / 'カード付与' / 'カード付与(来店)' / '来店記録'
-- ---------------------------------------------------------------------------
create or replace function public.admin_activity_log()
returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_admin();
  return coalesce((
    select jsonb_agg(to_jsonb(t)) from (
      -- ガチャ回数の付与（管理画面・QR引換どちらも pull_grants に記録される）
      select g.created_at,
             'ガチャ付与'::text as kind,
             au.email,
             p.display_name,
             (g.amount || '回') as what,
             g.reason as note
        from public.pull_grants g
        join public.profiles p on p.id = g.user_id
        join auth.users au on au.id = g.user_id

      union all

      -- カードの付与（source='grant' は管理画面、'visit' は来店記念/QR）
      select pu.created_at,
             case pu.source when 'visit' then 'カード付与(来店)' else 'カード付与' end,
             au.email,
             p.display_name,
             (c.name || coalesce('／' || c.variant, '') || '（' || c.rarity || '）'),
             case when pu.was_new then 'NEW!' else '被り' end
        from public.pulls pu
        join public.cards c on c.id = pu.card_id
        join public.profiles p on p.id = pu.user_id
        join auth.users au on au.id = pu.user_id
       where pu.source in ('grant', 'visit')

      union all

      -- 来店記録
      select v.created_at,
             '来店記録'::text,
             au.email,
             p.display_name,
             to_char(v.visited_on, 'YYYY-MM-DD'),
             v.note
        from public.visits v
        join public.profiles p on p.id = v.user_id
        join auth.users au on au.id = v.user_id

      order by created_at desc
      limit 50
    ) t
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.admin_activity_log() from public, anon;
grant execute on function public.admin_activity_log() to authenticated;
