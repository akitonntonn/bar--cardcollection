/* =========================================================================
 * BAR & — STAFF CARD COLLECTION / カードデータ
 * -------------------------------------------------------------------------
 * ここだけ編集すればカードを追加・修正できます。
 *
 * ▼ 画像モード
 *   art: "full"  … 完成カード画像を外枠いっぱいに全面表示（実カード）
 *   （art 省略）  … 人物ポートレートを中央の画像枠だけに表示（ユウタの枠カードなど）
 *   imageUrl が null / 読み込み失敗なら、自動で外枠＋「IMAGE COMING SOON」に戻ります。
 *
 * ▼ 所持状態
 *   owned: true … 所持（初期1枚） / false … 未所持（暗く LOCKED）
 *   ※ 公開版はお客さんがゼロから集めるため、全カード owned:false（＝全ロック）が既定。
 *   ※ ガチャの所持枚数・回数は localStorage に保存されます。
 *
 * ▼ レアリティ： NORMAL / RARE / SR / SSR / SECRET
 *   ガチャ排出は NORMAL(78%) / RARE(17%) / SR(5%)。
 *   SSR=来店記念（誕生日・周年など）。基本はガチャ対象外。
 *   SECRET=特殊条件。基本はガチャ対象外だが、下記フラグで期間限定排出も可能。
 *   variant … カードのテーマ名（同名キャラの見分け用ラベル）
 *
 * ▼ ガチャ排出の上書き（任意フィールド。夏限定シークレットなどで使用）
 *   gacha: true        … レアリティに関わらず通常ガチャの対象にする
 *   gachaBucket: "SR"  … 排出枠を指定（"SR"ならSRと同じ5%枠を共有＝SRと同確率帯）
 *   months: [7, 8]     … この月（1-12）だけ排出（期間外は未所持ならLOCKEDのまま）
 * ========================================================================= */

window.AND_CARDS = [
  /* ============================ あきと ============================ */
  { id: "akito-n01", no: "001", name: "あきと", variant: "実験ラボ", rarity: "NORMAL", art: "full", imageUrl: "./assets/cards/akito-n01.png", obtainCondition: "通常ガチャで入手", owned: false},
  { id: "akito-n02", no: "002", name: "あきと", variant: "サッカー", rarity: "NORMAL", art: "full", imageUrl: "./assets/cards/akito-n02.png", obtainCondition: "通常ガチャで入手", owned: false},
  { id: "akito-n03", no: "003", name: "あきと", variant: "烈火バー", rarity: "NORMAL", art: "full", imageUrl: "./assets/cards/akito-n03.png", obtainCondition: "通常ガチャで入手", owned: false},
  { id: "akito-n04", no: "004", name: "あきと", variant: "野球", rarity: "NORMAL", art: "full", imageUrl: "./assets/cards/akito-n04.png", obtainCondition: "通常ガチャで入手", owned: false},
  { id: "akito-n05", no: "005", name: "あきと", variant: "バレー", rarity: "NORMAL", art: "full", imageUrl: "./assets/cards/akito-n05.png", obtainCondition: "通常ガチャで入手", owned: false},
  { id: "akito-n06", no: "006", name: "あきと", variant: "おだやか", rarity: "NORMAL", art: "full", imageUrl: "./assets/cards/akito-n06.png", obtainCondition: "通常ガチャで入手", owned: false },
  { id: "akito-n07", no: "007", name: "あきと", variant: "バスケ", rarity: "NORMAL", art: "full", imageUrl: "./assets/cards/akito-n07.png", obtainCondition: "通常ガチャで入手", owned: false},
  { id: "akito-n08", no: "008", name: "あきと", variant: "のんびり夏", rarity: "NORMAL", art: "full", imageUrl: "./assets/cards/akito-n08.png", obtainCondition: "通常ガチャで入手", owned: false},
  { id: "akito-n09", no: "009", name: "あきと", variant: "夜の支配者", rarity: "NORMAL", art: "full", imageUrl: "./assets/cards/akito-n09.png", obtainCondition: "通常ガチャで入手", owned: false },
  { id: "akito-r01", no: "010", name: "あきと", variant: "紅月の影忍", rarity: "RARE", art: "full", imageUrl: "./assets/cards/akito-r01.png", obtainCondition: "通常ガチャ（低確率）で入手", owned: false},
  { id: "akito-r02", no: "011", name: "あきと", variant: "鎖のハンター", rarity: "RARE", art: "full", imageUrl: "./assets/cards/akito-r02.png", obtainCondition: "通常ガチャ（低確率）で入手", owned: false },
  { id: "akito-sr01", no: "012", name: "あきと", variant: "忍・チャクラ", rarity: "SR", art: "full", imageUrl: "./assets/cards/akito-sr01.png", obtainCondition: "イベント・特別ガチャで入手", owned: false},
  { id: "akito-sr02", no: "013", name: "あきと", variant: "夜のAKITO BAR", rarity: "SR", art: "full", imageUrl: "./assets/cards/akito-sr02.png", obtainCondition: "イベント・特別ガチャで入手", owned: false },
  { id: "akito-ssr01", no: "014", name: "あきと", variant: "誕生日シャンパン", rarity: "SSR", art: "full", imageUrl: "./assets/cards/akito-ssr01.png", obtainCondition: "誕生日の来店記念で入手（9月・オリシャンを注文）", owned: false },

  /* ============================ かける ============================ */
  { id: "kakeru-n01", no: "015", name: "かける", variant: "居酒屋サムズアップ", rarity: "NORMAL", art: "full", imageUrl: "./assets/cards/kakeru-n01.png", obtainCondition: "通常ガチャで入手", owned: false},
  { id: "kakeru-n02", no: "016", name: "かける", variant: "うさぎふれあい", rarity: "NORMAL", art: "full", imageUrl: "./assets/cards/kakeru-n02.png", obtainCondition: "通常ガチャで入手", owned: false},
  { id: "kakeru-n03", no: "017", name: "かける", variant: "バスケ", rarity: "NORMAL", art: "full", imageUrl: "./assets/cards/kakeru-n03.png", obtainCondition: "通常ガチャで入手", owned: false},
  { id: "kakeru-n04", no: "018", name: "かける", variant: "バレー", rarity: "NORMAL", art: "full", imageUrl: "./assets/cards/kakeru-n04.png", obtainCondition: "通常ガチャで入手", owned: false},
  { id: "kakeru-n05", no: "019", name: "かける", variant: "旅の剣豪", rarity: "NORMAL", art: "full", imageUrl: "./assets/cards/kakeru-n05.png", obtainCondition: "通常ガチャで入手", owned: false },
  { id: "kakeru-n06", no: "020", name: "かける", variant: "クールバー", rarity: "NORMAL", art: "full", imageUrl: "./assets/cards/kakeru-n06.png", obtainCondition: "通常ガチャで入手", owned: false},
  { id: "kakeru-n07", no: "021", name: "かける", variant: "ダークフレイム", rarity: "NORMAL", art: "full", imageUrl: "./assets/cards/kakeru-n07.png", obtainCondition: "通常ガチャで入手", owned: false},
  { id: "kakeru-n08", no: "022", name: "かける", variant: "高校野球", rarity: "NORMAL", art: "full", imageUrl: "./assets/cards/kakeru-n08.png", obtainCondition: "通常ガチャで入手", owned: false},
  { id: "kakeru-n09", no: "023", name: "かける", variant: "サッカー", rarity: "NORMAL", art: "full", imageUrl: "./assets/cards/kakeru-n09.png", obtainCondition: "通常ガチャで入手", owned: false},
  { id: "kakeru-r01", no: "024", name: "かける", variant: "稲妻ステップ", rarity: "RARE", art: "full", imageUrl: "./assets/cards/kakeru-r01.png", obtainCondition: "通常ガチャ（低確率）で入手", owned: false},
  { id: "kakeru-r02", no: "025", name: "かける", variant: "クールドリブル", rarity: "RARE", art: "full", imageUrl: "./assets/cards/kakeru-r02.png", obtainCondition: "通常ガチャ（低確率）で入手", owned: false},
  { id: "kakeru-sr01", no: "026", name: "かける", variant: "海賊BAR", rarity: "SR", art: "full", imageUrl: "./assets/cards/kakeru-sr01.png", obtainCondition: "イベント・特別ガチャで入手", owned: false },
  { id: "kakeru-sr02", no: "027", name: "かける", variant: "いたずら忍者", rarity: "SR", art: "full", imageUrl: "./assets/cards/kakeru-sr02.png", obtainCondition: "イベント・特別ガチャで入手", owned: false},
  { id: "kakeru-ssr01", no: "028", name: "かける", variant: "誕生日シャンパン", rarity: "SSR", art: "full", imageUrl: "./assets/cards/kakeru-ssr01.png", obtainCondition: "誕生日の来店記念で入手（7/8・オリシャンを注文）", owned: false },

  /* ============================ しょうま ============================ */
  { id: "shoma-n01", no: "029", name: "しょうま", variant: "かていモンスター", rarity: "NORMAL", art: "full", imageUrl: "./assets/cards/shoma-n01.png", obtainCondition: "通常ガチャで入手", owned: false},
  { id: "shoma-n02", no: "030", name: "しょうま", variant: "バレー", rarity: "NORMAL", art: "full", imageUrl: "./assets/cards/shoma-n02.png", obtainCondition: "通常ガチャで入手", owned: false},
  { id: "shoma-n03", no: "031", name: "しょうま", variant: "肉塊バッター", rarity: "NORMAL", art: "full", imageUrl: "./assets/cards/shoma-n03.png", obtainCondition: "通常ガチャで入手", owned: false},
  { id: "shoma-n04", no: "032", name: "しょうま", variant: "バスケ", rarity: "NORMAL", art: "full", imageUrl: "./assets/cards/shoma-n04.png", obtainCondition: "通常ガチャで入手", owned: false},
  { id: "shoma-n05", no: "033", name: "しょうま", variant: "サッカー", rarity: "NORMAL", art: "full", imageUrl: "./assets/cards/shoma-n05.png", obtainCondition: "通常ガチャで入手", owned: false},
  { id: "shoma-n06", no: "034", name: "しょうま", variant: "おどけムード", rarity: "NORMAL", art: "full", imageUrl: "./assets/cards/shoma-n06.png", obtainCondition: "通常ガチャで入手", owned: false },
  { id: "shoma-n07", no: "035", name: "しょうま", variant: "全力バレー", rarity: "NORMAL", art: "full", imageUrl: "./assets/cards/shoma-n07.png", obtainCondition: "通常ガチャで入手", owned: false},
  { id: "shoma-n08", no: "036", name: "しょうま", variant: "しずかな圧", rarity: "NORMAL", art: "full", imageUrl: "./assets/cards/shoma-n08.png", obtainCondition: "通常ガチャで入手", owned: false},
  { id: "shoma-r01", no: "037", name: "しょうま", variant: "ブレイブオーラ", rarity: "RARE", art: "full", imageUrl: "./assets/cards/shoma-r01.png", obtainCondition: "通常ガチャ（低確率）で入手", owned: false },
  { id: "shoma-r02", no: "038", name: "しょうま", variant: "天才メカニック", rarity: "RARE", art: "full", imageUrl: "./assets/cards/shoma-r02.png", obtainCondition: "通常ガチャ（低確率）で入手", owned: false},
  { id: "shoma-sr01", no: "039", name: "しょうま", variant: "Good Vibes Only", rarity: "SR", art: "full", imageUrl: "./assets/cards/shoma-sr01.png", obtainCondition: "イベント・特別ガチャで入手", owned: false},
  { id: "shoma-sr02", no: "040", name: "しょうま", variant: "ナイトライフ", rarity: "SR", art: "full", imageUrl: "./assets/cards/shoma-sr02.png", obtainCondition: "イベント・特別ガチャで入手", owned: false},
  { id: "shoma-sr03", no: "041", name: "しょうま", variant: "カリスマオーラ", rarity: "SR", art: "full", imageUrl: "./assets/cards/shoma-sr03.png", obtainCondition: "イベント・特別ガチャで入手", owned: false },
  { id: "shoma-ssr01", no: "042", name: "しょうま", variant: "誕生日シャンパン", rarity: "SSR", art: "full", imageUrl: "./assets/cards/shoma-ssr01.png", obtainCondition: "誕生日の来店記念で入手（3月・オリシャンを注文）", owned: false },

  /* ============================ ゆうた ============================ */
  { id: "yuta-ssr01", no: "043", name: "ゆうた", variant: "誕生日シャンパン", rarity: "SSR", art: "full", imageUrl: "./assets/cards/yuta-ssr01.png", obtainCondition: "誕生日の来店記念で入手（3/10・オリシャンを注文）", owned: false },

  /* ===================== 夏限定シークレット（7・8月だけ通常ガチャに出現／SRと同確率） =====================
   * gacha:true で通常ガチャ対象に。gachaBucket:"SR" でSRと同じ5%枠を共有（＝SRと同確率帯）。
   * months:[7,8] で7月・8月だけ排出。期間外は未所持ならLOCKEDのまま図鑑に並ぶ。 */
  { id: "akito-secret01", no: "044", name: "あきと", variant: "夏夜の影", rarity: "SECRET", art: "full", imageUrl: "./assets/cards/akito-secret01.png", obtainCondition: "夏限定ガチャ（7・8月）でSRと同確率で入手", owned: false, gacha: true, gachaBucket: "SR", months: [7, 8] },
  { id: "kakeru-secret01", no: "045", name: "かける", variant: "夏夜のスピードスター", rarity: "SECRET", art: "full", imageUrl: "./assets/cards/kakeru-secret01.png", obtainCondition: "夏限定ガチャ（7・8月）でSRと同確率で入手", owned: false, gacha: true, gachaBucket: "SR", months: [7, 8] },
  { id: "yuta-secret01", no: "046", name: "ゆうた", variant: "夏夜の支配者", rarity: "SECRET", art: "full", imageUrl: "./assets/cards/yuta-secret01.png", obtainCondition: "夏限定ガチャ（7・8月）でSRと同確率で入手", owned: false, gacha: true, gachaBucket: "SR", months: [7, 8] },
  { id: "shoma-secret01", no: "047", name: "しょうま", variant: "夏夜のジェントルマン", rarity: "SECRET", art: "full", imageUrl: "./assets/cards/shoma-secret01.png", obtainCondition: "夏限定ガチャ（7・8月）でSRと同確率で入手", owned: false, gacha: true, gachaBucket: "SR", months: [7, 8] },
];
