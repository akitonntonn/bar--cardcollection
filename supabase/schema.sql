-- =========================================================================
-- BAR & — STAFF CARD COLLECTION : Supabase スキーマ
-- -------------------------------------------------------------------------
-- 適用方法: Supabase ダッシュボード → SQL Editor に貼り付けて Run。
-- 順番:  1) schema.sql（このファイル） → 2) seed_cards.sql → 3) functions.sql
--
-- 方針:
--   * 認証は Supabase Auth（メールのマジックリンク）。ユーザー本体は auth.users。
--   * public.profiles が auth.users と 1:1 のアプリ用プロフィール＋ガチャ状態。
--   * カード原本(cards)は全員が閲覧可。所持(user_cards)・履歴(pulls)は本人だけ閲覧可。
--   * 所持やガチャ回数の「書き込み」はRLSで塞ぎ、サーバ関数(draw_gacha 等)経由のみ許可。
--     → ブラウザから直接いじって増やす不正を防ぐ（サーバ権威）。
-- =========================================================================

-- ---------------------------------------------------------------------------
-- 1) profiles : ユーザー本体（＋デイリー/ボーナス/被り貯金の状態）
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id              uuid primary key references auth.users (id) on delete cascade,
  display_name    text,
  is_admin        boolean     not null default false,          -- 管理者フラグ
  last_daily_date date,                                         -- 最後にデイリーを使った日(JST)
  bonus_pulls     int         not null default 0 check (bonus_pulls >= 0),
  dupe_stock      int         not null default 0 check (dupe_stock >= 0),
  created_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 2) cards : カード原本（data/cards.js のマスタをDB化。seed_cards.sql で投入）
-- ---------------------------------------------------------------------------
create table if not exists public.cards (
  id               text primary key,                            -- 例 "akito-n01"
  no               text not null,                               -- 表示No "001"
  name             text not null,
  variant          text,
  rarity           text not null check (rarity in ('NORMAL','RARE','SR','SSR','SECRET')),
  art              text,                                        -- "full" 等
  image_url        text,
  obtain_condition text,
  gacha            boolean not null default false,              -- 通常ガチャ対象に明示追加
  gacha_bucket     text,                                        -- 排出枠上書き（"SR"など）
  months           int[],                                       -- 期間限定の月（[7,8]等 / NULL=常時）
  sort             int not null default 0
);

-- ---------------------------------------------------------------------------
-- 3) user_cards : 誰が何を何枚持っているか
-- ---------------------------------------------------------------------------
create table if not exists public.user_cards (
  user_id           uuid not null references public.profiles (id) on delete cascade,
  card_id           text not null references public.cards (id)    on delete cascade,
  count             int  not null default 0 check (count >= 0),
  first_obtained_at timestamptz not null default now(),
  primary key (user_id, card_id)
);
create index if not exists user_cards_user_idx on public.user_cards (user_id);

-- ---------------------------------------------------------------------------
-- 4) pulls : ガチャ履歴（監査・不正検知・演出履歴）
-- ---------------------------------------------------------------------------
create table if not exists public.pulls (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  card_id    text not null references public.cards (id),
  source     text not null default 'daily' check (source in ('daily','bonus','grant','visit')),
  was_new    boolean not null,
  created_at timestamptz not null default now()
);
create index if not exists pulls_user_idx on public.pulls (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 5) visits : 来店記録（誕生日SSR/来店解放の根拠。管理者が登録）
-- ---------------------------------------------------------------------------
create table if not exists public.visits (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  visited_on date not null default (now() at time zone 'Asia/Tokyo')::date,
  note       text,
  created_by uuid references public.profiles (id),               -- 付与した管理者
  created_at timestamptz not null default now()
);
create index if not exists visits_user_idx on public.visits (user_id, visited_on desc);

-- ---------------------------------------------------------------------------
-- 6) pull_grants : 課金→ガチャ付与など管理者操作の台帳
-- ---------------------------------------------------------------------------
create table if not exists public.pull_grants (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  amount     int  not null check (amount > 0),                   -- 付与したガチャ回数
  reason     text,                                               -- "5,000円ご利用" など
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

-- ===========================================================================
-- 新規ユーザー登録時に profiles を自動作成するトリガー
-- ===========================================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ===========================================================================
-- 行レベルセキュリティ（RLS）
-- ===========================================================================
alter table public.profiles    enable row level security;
alter table public.cards       enable row level security;
alter table public.user_cards  enable row level security;
alter table public.pulls       enable row level security;
alter table public.visits      enable row level security;
alter table public.pull_grants enable row level security;

-- cards : 全員が閲覧可（原本の読み取り）。書き込みは付けない＝サービス/管理者のみ。
drop policy if exists cards_read_all on public.cards;
create policy cards_read_all on public.cards
  for select using (true);

-- profiles : 本人のみ閲覧・更新（display_name などの編集用）。
drop policy if exists profiles_read_own on public.profiles;
create policy profiles_read_own on public.profiles
  for select using (auth.uid() = id);

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update using (auth.uid() = id)
  with check (auth.uid() = id);

-- user_cards / pulls / visits / pull_grants : 本人は閲覧のみ。
-- 書き込みは security definer 関数（draw_gacha など）が担うのでポリシーを付けない
-- ＝ お客さんのブラウザから直接 INSERT/UPDATE できない（不正防止）。
drop policy if exists user_cards_read_own on public.user_cards;
create policy user_cards_read_own on public.user_cards
  for select using (auth.uid() = user_id);

drop policy if exists pulls_read_own on public.pulls;
create policy pulls_read_own on public.pulls
  for select using (auth.uid() = user_id);

drop policy if exists visits_read_own on public.visits;
create policy visits_read_own on public.visits
  for select using (auth.uid() = user_id);

drop policy if exists grants_read_own on public.pull_grants;
create policy grants_read_own on public.pull_grants
  for select using (auth.uid() = user_id);
