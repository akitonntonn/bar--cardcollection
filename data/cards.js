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
 *   owned: true  … 所持（初期1枚） / false … 未所持（暗く LOCKED）
 *   ※ ガチャの所持枚数・回数は localStorage に保存されます。
 *
 * ▼ レアリティ： NORMAL / RARE / SR / SSR / SECRET
 *   ガチャ排出は NORMAL(78%) / RARE(17%) / SR(5%)。
 *   SSR=来店記念（誕生日・周年など）/ SECRET=特殊条件。どちらもガチャ対象外。
 *   variant … カードのテーマ名（同名キャラの見分け用ラベル）
 * ========================================================================= */

window.AND_CARDS = [
  /* ============================ あきと ============================ */
  { id: "akito-n01", no: "001", name: "あきと", variant: "実験ラボ", rarity: "NORMAL", art: "full", imageUrl: "./assets/cards/akito-n01.png", obtainCondition: "通常ガチャで入手", owned: true },
  { id: "akito-n02", no: "002", name: "あきと", variant: "サッカー", rarity: "NORMAL", art: "full", imageUrl: "./assets/cards/akito-n02.png", obtainCondition: "通常ガチャで入手", owned: true },
  { id: "akito-n03", no: "003", name: "あきと", variant: "烈火バー", rarity: "NORMAL", art: "full", imageUrl: "./assets/cards/akito-n03.png", obtainCondition: "通常ガチャで入手", owned: true },
  { id: "akito-n04", no: "004", name: "あきと", variant: "野球", rarity: "NORMAL", art: "full", imageUrl: "./assets/cards/akito-n04.png", obtainCondition: "通常ガチャで入手", owned: true },
  { id: "akito-n05", no: "005", name: "あきと", variant: "バレー", rarity: "NORMAL", art: "full", imageUrl: "./assets/cards/akito-n05.png", obtainCondition: "通常ガチャで入手", owned: true },
  { id: "akito-n06", no: "006", name: "あきと", variant: "おだやか", rarity: "NORMAL", art: "full", imageUrl: "./assets/cards/akito-n06.png", obtainCondition: "通常ガチャで入手", owned: false },
  { id: "akito-n07", no: "007", name: "あきと", variant: "バスケ", rarity: "NORMAL", art: "full", imageUrl: "./assets/cards/akito-n07.png", obtainCondition: "通常ガチャで入手", owned: true },
  { id: "akito-n08", no: "008", name: "あきと", variant: "のんびり夏", rarity: "NORMAL", art: "full", imageUrl: "./assets/cards/akito-n08.png", obtainCondition: "通常ガチャで入手", owned: true },
  { id: "akito-n09", no: "009", name: "あきと", variant: "夜の支配者", rarity: "NORMAL", art: "full", imageUrl: "./assets/cards/akito-n09.png", obtainCondition: "通常ガチャで入手", owned: false },
  { id: "akito-r01", no: "010", name: "あきと", variant: "紅月の影忍", rarity: "RARE", art: "full", imageUrl: "./assets/cards/akito-r01.png", obtainCondition: "通常ガチャ（低確率）で入手", owned: true },
  { id: "akito-r02", no: "011", name: "あきと", variant: "鎖のハンター", rarity: "RARE", art: "full", imageUrl: "./assets/cards/akito-r02.png", obtainCondition: "通常ガチャ（低確率）で入手", owned: false },
  { id: "akito-sr01", no: "012", name: "あきと", variant: "忍・チャクラ", rarity: "SR", art: "full", imageUrl: "./assets/cards/akito-sr01.png", obtainCondition: "イベント・特別ガチャで入手", owned: true },
  { id: "akito-sr02", no: "013", name: "あきと", variant: "夜のAKITO BAR", rarity: "SR", art: "full", imageUrl: "./assets/cards/akito-sr02.png", obtainCondition: "イベント・特別ガチャで入手", owned: false },
  { id: "akito-ssr01", no: "014", name: "あきと", variant: "誕生日シャンパン", rarity: "SSR", art: "full", imageUrl: "./assets/cards/akito-ssr01.png", obtainCondition: "来店記念（誕生日・周年）で入手", owned: false },

  /* ============================ かける ============================ */
  { id: "kakeru-n01", no: "015", name: "かける", variant: "居酒屋サムズアップ", rarity: "NORMAL", art: "full", imageUrl: "./assets/cards/kakeru-n01.png", obtainCondition: "通常ガチャで入手", owned: true },
  { id: "kakeru-n02", no: "016", name: "かける", variant: "うさぎふれあい", rarity: "NORMAL", art: "full", imageUrl: "./assets/cards/kakeru-n02.png", obtainCondition: "通常ガチャで入手", owned: true },
  { id: "kakeru-n03", no: "017", name: "かける", variant: "バスケ", rarity: "NORMAL", art: "full", imageUrl: "./assets/cards/kakeru-n03.png", obtainCondition: "通常ガチャで入手", owned: true },
  { id: "kakeru-n04", no: "018", name: "かける", variant: "バレー", rarity: "NORMAL", art: "full", imageUrl: "./assets/cards/kakeru-n04.png", obtainCondition: "通常ガチャで入手", owned: true },
  { id: "kakeru-n05", no: "019", name: "かける", variant: "旅の剣豪", rarity: "NORMAL", art: "full", imageUrl: "./assets/cards/kakeru-n05.png", obtainCondition: "通常ガチャで入手", owned: false },
  { id: "kakeru-n06", no: "020", name: "かける", variant: "クールバー", rarity: "NORMAL", art: "full", imageUrl: "./assets/cards/kakeru-n06.png", obtainCondition: "通常ガチャで入手", owned: true },
  { id: "kakeru-n07", no: "021", name: "かける", variant: "ダークフレイム", rarity: "NORMAL", art: "full", imageUrl: "./assets/cards/kakeru-n07.png", obtainCondition: "通常ガチャで入手", owned: true },
  { id: "kakeru-n08", no: "022", name: "かける", variant: "高校野球", rarity: "NORMAL", art: "full", imageUrl: "./assets/cards/kakeru-n08.png", obtainCondition: "通常ガチャで入手", owned: true },
  { id: "kakeru-n09", no: "023", name: "かける", variant: "サッカー", rarity: "NORMAL", art: "full", imageUrl: "./assets/cards/kakeru-n09.png", obtainCondition: "通常ガチャで入手", owned: true },
  { id: "kakeru-r01", no: "024", name: "かける", variant: "稲妻ステップ", rarity: "RARE", art: "full", imageUrl: "./assets/cards/kakeru-r01.png", obtainCondition: "通常ガチャ（低確率）で入手", owned: true },
  { id: "kakeru-r02", no: "025", name: "かける", variant: "クールドリブル", rarity: "RARE", art: "full", imageUrl: "./assets/cards/kakeru-r02.png", obtainCondition: "通常ガチャ（低確率）で入手", owned: true },
  { id: "kakeru-sr01", no: "026", name: "かける", variant: "海賊BAR", rarity: "SR", art: "full", imageUrl: "./assets/cards/kakeru-sr01.png", obtainCondition: "イベント・特別ガチャで入手", owned: false },
  { id: "kakeru-sr02", no: "027", name: "かける", variant: "いたずら忍者", rarity: "SR", art: "full", imageUrl: "./assets/cards/kakeru-sr02.png", obtainCondition: "イベント・特別ガチャで入手", owned: true },
  { id: "kakeru-ssr01", no: "028", name: "かける", variant: "誕生日シャンパン", rarity: "SSR", art: "full", imageUrl: "./assets/cards/kakeru-ssr01.png", obtainCondition: "誕生日の来店記念で入手（7/8）", owned: false },

  /* ============================ しょうま ============================ */
  { id: "shoma-n01", no: "029", name: "しょうま", variant: "かていモンスター", rarity: "NORMAL", art: "full", imageUrl: "./assets/cards/shoma-n01.png", obtainCondition: "通常ガチャで入手", owned: true },
  { id: "shoma-n02", no: "030", name: "しょうま", variant: "バレー", rarity: "NORMAL", art: "full", imageUrl: "./assets/cards/shoma-n02.png", obtainCondition: "通常ガチャで入手", owned: true },
  { id: "shoma-n03", no: "031", name: "しょうま", variant: "肉塊バッター", rarity: "NORMAL", art: "full", imageUrl: "./assets/cards/shoma-n03.png", obtainCondition: "通常ガチャで入手", owned: true },
  { id: "shoma-n04", no: "032", name: "しょうま", variant: "バスケ", rarity: "NORMAL", art: "full", imageUrl: "./assets/cards/shoma-n04.png", obtainCondition: "通常ガチャで入手", owned: true },
  { id: "shoma-n05", no: "033", name: "しょうま", variant: "サッカー", rarity: "NORMAL", art: "full", imageUrl: "./assets/cards/shoma-n05.png", obtainCondition: "通常ガチャで入手", owned: true },
  { id: "shoma-n06", no: "034", name: "しょうま", variant: "おどけムード", rarity: "NORMAL", art: "full", imageUrl: "./assets/cards/shoma-n06.png", obtainCondition: "通常ガチャで入手", owned: false },
  { id: "shoma-n07", no: "035", name: "しょうま", variant: "全力バレー", rarity: "NORMAL", art: "full", imageUrl: "./assets/cards/shoma-n07.png", obtainCondition: "通常ガチャで入手", owned: true },
  { id: "shoma-n08", no: "036", name: "しょうま", variant: "しずかな圧", rarity: "NORMAL", art: "full", imageUrl: "./assets/cards/shoma-n08.png", obtainCondition: "通常ガチャで入手", owned: true },
  { id: "shoma-r01", no: "037", name: "しょうま", variant: "ブレイブオーラ", rarity: "RARE", art: "full", imageUrl: "./assets/cards/shoma-r01.png", obtainCondition: "通常ガチャ（低確率）で入手", owned: false },
  { id: "shoma-r02", no: "038", name: "しょうま", variant: "天才メカニック", rarity: "RARE", art: "full", imageUrl: "./assets/cards/shoma-r02.png", obtainCondition: "通常ガチャ（低確率）で入手", owned: true },
  { id: "shoma-sr01", no: "039", name: "しょうま", variant: "Good Vibes Only", rarity: "SR", art: "full", imageUrl: "./assets/cards/shoma-sr01.png", obtainCondition: "イベント・特別ガチャで入手", owned: true },
  { id: "shoma-sr02", no: "040", name: "しょうま", variant: "ナイトライフ", rarity: "SR", art: "full", imageUrl: "./assets/cards/shoma-sr02.png", obtainCondition: "イベント・特別ガチャで入手", owned: true },
  { id: "shoma-sr03", no: "041", name: "しょうま", variant: "カリスマオーラ", rarity: "SR", art: "full", imageUrl: "./assets/cards/shoma-sr03.png", obtainCondition: "イベント・特別ガチャで入手", owned: false },
  { id: "shoma-ssr01", no: "042", name: "しょうま", variant: "誕生日シャンパン", rarity: "SSR", art: "full", imageUrl: "./assets/cards/shoma-ssr01.png", obtainCondition: "来店記念（誕生日・周年）で入手", owned: false },

  /* ===================== ユウタ（画像は今後 / 枠フォールバック） =====================
   * ユウタは SSR と SECRET を持つキャラ。画像が入ったら art:"full" と imageUrl を設定。 */
  {
    id: "yuta-ssr-043",
    no: "043",
    name: "ユウタ",
    rarity: "SSR",
    attribute: "ゲーム",
    catchCopy: "勝っても負けても、飲み干せ。",
    skillName: "勝負師",
    skillDescription: "飲みゲーの場を読み切り、一気に温度を上げる伝説の仕掛け人。",
    obtainCondition: "来店記念（周年・特別な日）で入手",
    imageUrl: null,
    owned: false,
  },
  {
    id: "yuta-secret-044",
    no: "044",
    name: "ユウタ",
    rarity: "SECRET",
    attribute: "伝説",
    catchCopy: "その一杯は、記録に残らない。",
    skillName: "朝まで確定",
    skillDescription: "気づけば閉店まで。本人しか知らないネタが眠っている。",
    obtainCondition: "？？？（本人しか知らない条件）",
    imageUrl: null,
    owned: false,
  },
];
