# & STAFF CARD COLLECTION（BAR & スタッフカード図鑑）

BAR & のスタッフ・常連・イベント限定カードを集めるWeb図鑑です。
**画像がまだ無くても、カード外枠だけで「集めたくなる」** ことを目指した Neobrutalism デザイン。

- デザイン: `typeui.sh` の **neobrutalism**（`DESIGN.md` にトークンを保存）
  太い黒線 / ベタ塗りの強い色 / ズレた黒い影 / 角ばったカード / 夜のBAR感
- 構成: **Vanilla JS**（ビルド不要・静的ファイルのみ）— 既存プロジェクトに合わせています

---

## 画面

1. **Hero** — タイトル `& STAFF CARD COLLECTION` ＋ ガチャボタン「今日の1枚を引く」
2. **Stats** — 所持枚数 / コンプリート率 / 最高レアリティ
3. **Filter** — ALL / NORMAL / RARE / SR / SSR / SECRET
4. **Collection grid** — カード一覧（未所持は暗く `LOCKED`）
5. **Detail modal** — カードの大きい表示＋スキル＋入手条件
6. **ガチャ** — 押すとランダムで1枚めくる簡易演出（未所持なら解放）

## レアリティ

| レアリティ | 意味 | 見た目 |
|---|---|---|
| NORMAL | 通常スタッフ | 白・グレー・黒 |
| RARE | 誕生日月 | 黄色・ピンク |
| SR | イベント限定衣装 | 青・紫＋斜めライン |
| SSR | シャンパン開封・周年・伝説の日 | 金・黒・赤＋王冠/星/きらめき |
| SECRET | 本人しか知らないネタ | 黒・紫・蛍光グリーン＋グリッチ/伏せ字 |

---

## ファイル構成

```
and-card-game/
├── index.html          … 画面の骨組み（Hero / Stats / Filter / Grid / Modal）
├── styles.css          … Neobrutalism × 夜バーの全スタイル（レアリティ別カード外枠）
├── app.js              … 描画・フィルター・モーダル・ガチャ・localStorage
├── data/
│   └── cards.js        … ★カードデータ（ここだけ編集すればOK）
├── assets/
│   └── cards/          … ★カード画像の置き場所（下記参照）
├── DESIGN.md           … typeui.sh から取得した neobrutalism 仕様
└── README.md
```

## 起動方法

ビルド不要です。ローカルサーバで開くだけ（`file://` でも動きますが、サーバ推奨）。

```bash
cd and-card-game
python3 -m http.server 5178
# → http://localhost:5178 を開く
```

---

## 画像の追加方法（後から差し替え）

画像は2パターンで扱えます。

### A. 完成カード画像を全面表示（`art: "full"`）
外枠込みの完成カード（あきと・かける・しょうまの実カード）は、
カード画像そのものを外枠いっぱいに表示します。図鑑側は Neobrutalism の
黒枠＋影で“スリーブ”のように囲み、レアリティ／No.／LOCKED を重ねます。

```js
{
  id: "akito-sr01",
  variant: "忍・チャクラ",       // テーマ名（同名キャラの見分け用）
  art: "full",
  imageUrl: "./assets/cards/akito-sr01.png",
}
```

実カードは `assets/cards/` に配置済み（あきと11・かける11・しょうま11＝計33枚）。
ファイル名一覧・テーマ名は [assets/cards/README.md](assets/cards/README.md) を参照。

### B. 人物ポートレートを中央枠に表示（デフォルト）
`art` を指定しなければ、中央の画像枠にだけ画像が入ります。

```js
{
  id: "ryo-normal-006",
  imageUrl: "./assets/cards/ryo-normal.png", // ← null から差し替えるだけ
}
```

- どちらも `imageUrl: null`（未設定）や読み込み失敗時は
  自動で **「IMAGE COMING SOON」** のフォールバック枠になります。
- 推奨比率は **縦長（5:7 くらい）**。`object-fit: cover` で収めます。

## カードの追加方法

`data/cards.js` の配列に1件足すだけ。`rarity` は
`NORMAL / RARE / SR / SSR / SECRET` のいずれか。

---

## 今後の拡張ポイント（構造だけ用意済み）

- **来店QR**: URLに `?unlock=<cardId>` を付けて開いた時に該当カードを解放、など
  （解放は `app.js` の `unlockedSet` / `saveUnlocked()` を利用）
- **1日1回ガチャ**: `localStorage["and-card:lastGacha"]` に日付を保存済み。
  当日分を引いたら `drawGacha()` の先頭で弾く実装を足すだけ
- **Instagram導線**: モーダルに共有ボタンを追加し、カード情報からシェアURLを生成

## 所持状態について

- ガチャで引いたカードは `localStorage`（キー `and-card:owned`）に保存されます。
- リセットしたい場合はブラウザのサイトデータを削除してください。
