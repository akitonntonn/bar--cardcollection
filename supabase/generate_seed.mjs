/* =========================================================================
 * カードマスタ seed 生成スクリプト
 * -------------------------------------------------------------------------
 * data/cards.js（window.AND_CARDS）を読み、public.cards への upsert SQL を
 * supabase/seed_cards.sql に書き出します。カードを増やしたら再実行するだけ。
 *
 *   実行:  node supabase/generate_seed.mjs
 * ========================================================================= */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

// data/cards.js は「window.AND_CARDS = [...]」形式。疑似 window を渡して評価する。
const src = readFileSync(join(root, "data", "cards.js"), "utf8");
const win = {};
new Function("window", src)(win);
const cards = win.AND_CARDS;
if (!Array.isArray(cards) || !cards.length) {
  console.error("カードデータが読めませんでした。data/cards.js を確認してください。");
  process.exit(1);
}

// --- SQL リテラル化ヘルパ ---
const s = (v) => (v == null ? "null" : "'" + String(v).replace(/'/g, "''") + "'");
const b = (v) => (v ? "true" : "false");
const months = (m) => (Array.isArray(m) && m.length ? "array[" + m.join(",") + "]::int[]" : "null");

const rows = cards.map(
  (c, i) =>
    "  (" +
    [
      s(c.id),
      s(c.no),
      s(c.name),
      s(c.variant),
      s(c.rarity),
      s(c.art),
      s(c.imageUrl),
      s(c.obtainCondition),
      b(c.gacha),
      s(c.gachaBucket),
      months(c.months),
      i,
    ].join(", ") +
    ")"
);

const sql =
  "-- ⚠ 自動生成ファイル。手で編集しないでください。\n" +
  "-- 再生成: node supabase/generate_seed.mjs（data/cards.js が正）\n" +
  "-- カードマスタ（" +
  cards.length +
  "枚）を public.cards に upsert します。\n\n" +
  "insert into public.cards\n" +
  "  (id, no, name, variant, rarity, art, image_url, obtain_condition, gacha, gacha_bucket, months, sort)\n" +
  "values\n" +
  rows.join(",\n") +
  "\n" +
  "on conflict (id) do update set\n" +
  "  no = excluded.no,\n" +
  "  name = excluded.name,\n" +
  "  variant = excluded.variant,\n" +
  "  rarity = excluded.rarity,\n" +
  "  art = excluded.art,\n" +
  "  image_url = excluded.image_url,\n" +
  "  obtain_condition = excluded.obtain_condition,\n" +
  "  gacha = excluded.gacha,\n" +
  "  gacha_bucket = excluded.gacha_bucket,\n" +
  "  months = excluded.months,\n" +
  "  sort = excluded.sort;\n";

writeFileSync(join(here, "seed_cards.sql"), sql);
console.log("✔ seed_cards.sql を書き出しました（" + cards.length + "枚）");
