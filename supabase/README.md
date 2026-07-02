# 裏側（Supabase）セットアップ手順

このフォルダは **バックエンドの設計図（SQL）** です。Cloudflare Pages で配信される静的サイトとは別に、
Supabase 上でユーザー・所持カード・ガチャ処理を管理します。

> 秘密情報は入っていません（SQLのみ）。`service_role` キーなどは**絶対にこのリポジトリに置かない**でください。

## 中身

| ファイル | 役割 |
|---|---|
| `schema.sql` | テーブル・RLS（権限）・新規ユーザーの自動プロフィール作成 |
| `generate_seed.mjs` | `data/cards.js` から `seed_cards.sql` を生成するスクリプト |
| `seed_cards.sql` | カード47枚を `cards` テーブルへ投入（自動生成・手編集しない） |
| `functions.sql` | サーバ権威のガチャ `draw_gacha()` と管理者用の付与関数 |

## 適用手順（プロジェクト作成後）

1. [supabase.com](https://supabase.com) で New project（リージョン **Northeast Asia (Tokyo)** 推奨）
2. 左メニュー **SQL Editor** を開き、次の順で貼り付けて **Run**：
   1. `schema.sql`
   2. `seed_cards.sql`
   3. `functions.sql`
3. **Authentication → Providers → Email** で「**Email OTP / Magic Link**」を有効化
   （パスワードなしのマジックリンク運用）
4. **Authentication → URL Configuration** に、公開URL
   （例 `https://bar--cardcollection.pages.dev`）を Site URL / Redirect に登録
5. 接続情報をコピー（**Project Settings → API**）：
   - **Project URL**（公開OK）
   - **anon public key**（公開OK・フロントに埋め込む用）
   - ※ `service_role` は使いません／共有しないでください

→ この **Project URL と anon key の2つ**を教えてもらえれば、フロント側（ログイン画面＋
クラウド保存＋`draw_gacha` 呼び出し）を実装します。

## 自分を管理者にする

登録（初回ログイン）後、SQL Editor で自分のアカウントを管理者化します：

```sql
update public.profiles set is_admin = true
where id = (select id from auth.users where email = 'あなたのメール');
```

管理者になると `grant_pulls`（課金→ガチャ付与）・`grant_card`（誕生日SSR等の付与）・
`record_visit`（来店記録）が使えます。

## カードを増やしたとき

`data/cards.js` を編集したら、seed を作り直して `seed_cards.sql` を再 Run するだけ：

```bash
node supabase/generate_seed.mjs
```

## 動作確認について

`functions.sql` の PL/pgSQL（`draw_gacha` など）は、**実際の Supabase に適用してから動作確認**します
（ローカルにDBが無いため未実行）。適用後、SQL Editor で `select public.draw_gacha();` を
ログイン状態のトークンで叩くか、フロント結線後に実機で検証します。
