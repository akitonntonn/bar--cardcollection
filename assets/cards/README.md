# カード画像の置き場所

`art: "full"` のカードは、**完成カード画像をそのまま外枠いっぱい**に表示します
（図鑑側は Neobrutalism の黒枠＋影で“スリーブ”のように囲み、角にレアリティ／No.、
未所持なら LOCKED を重ねます）。

## 現在入っている実カード（あきと・かける・しょうま）

`data/cards.js` から下記ファイル名を参照しています。差し替え・追加はファイルを
同名で置き換えるだけ。ファイル名を変えたい場合は `data/cards.js` の `imageUrl` を編集。

| キャラ | ノーマル | R | SR |
|---|---|---|---|
| あきと | `akito-n01.png` 〜 `akito-n09.png` | `akito-r01.png`, `akito-r02.png` | `akito-sr01.png`, `akito-sr02.png` |
| かける | `kakeru-n01.png` 〜 `kakeru-n09.png` | `kakeru-r01.png`, `kakeru-r02.png` | `kakeru-sr01.png`, `kakeru-sr02.png` |
| しょうま | `shoma-n01.png` 〜 `shoma-n08.png` | `shoma-r01.png`, `shoma-r02.png` | `shoma-sr01.png` 〜 `shoma-sr03.png` |

各カードの「テーマ名（variant）」は `data/cards.js` に記載済み（例: あきと n01＝実験ラボ、
かける sr01＝海賊BAR、しょうま sr01＝Good Vibes Only）。自由に編集できます。

## ユウタ（画像は今後）

ユウタは **SSR** と **SECRET** の枠だけ用意しています（`yuta-ssr-034` / `yuta-secret-035`）。
画像が用意できたら、`data/cards.js` の該当カードに次を追加するだけで全面表示に切り替わります。

```js
art: "full",
imageUrl: "./assets/cards/yuta-ssr.png",
```

## 推奨仕様

- 比率: **縦長 5:7 前後**（今回の実カードは約 1060×1484 でぴったり）
- 形式: PNG / JPG / WebP（`imageUrl` の拡張子と実ファイルを一致させる）
- `imageUrl` が `null` または読み込み失敗時は、自動で外枠＋「IMAGE COMING SOON」に戻ります
