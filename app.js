/* =========================================================================
 * BAR & — STAFF CARD COLLECTION / アプリロジック（Vanilla JS）
 * -------------------------------------------------------------------------
 * 依存: data/cards.js（window.AND_CARDS）
 * 主な責務:
 *   - カードグリッド / レアリティフィルター / ステータスの描画
 *   - カード詳細モーダル（アクセシビリティ対応）
 *   - デイリーガチャ（1日1回・被りあり・排出率・被り5枚で無料ガチャ）
 *   - 所持枚数・ガチャ回数を localStorage に保存（体験版）
 *
 * ▼ ガチャ経済（体験版はlocalStorage、本番はSupabaseの想定）
 *   排出率  : GACHA_RATES（SSR=来店記念/SECRET=特殊条件なので対象外）
 *   デイリー: dailyDate（今日ぶんを使ったか）＋ bonus（被り救済で貯まる無料ガチャ）
 *   所持枚数: counts { cardId: 枚数 }（被り対応）
 *
 * ▼ 今後の拡張ポイント
 *   - お客さんアカウント : counts/bonus/dailyDate を user_cards テーブルへ移すだけ
 *   - 来店QR/来店SSR    : 店舗トークン付きURL or 管理者ポータルから付与
 *   - Instagram導線      : 公開プロフィール＋シェア画像生成
 * ========================================================================= */

(function () {
  "use strict";

  /* ----------------------------- 定数 ----------------------------- */
  const RARITIES = ["NORMAL", "RARE", "SR", "SSR", "SECRET"];
  const RARITY_ORDER = { NORMAL: 0, RARE: 1, SR: 2, SSR: 3, SECRET: 4 };
  const RARITY_LABEL_JP = {
    NORMAL: "通常",
    RARE: "誕生日",
    SR: "イベント限定",
    SSR: "伝説級",
    SECRET: "シークレット",
  };
  /* --- デイリーガチャ設定（体験版 / localStorageのみ・後でSupabaseへ） ---
   * 排出率（%）。SSR=来店記念のみ / SECRET=特殊条件 なのでガチャ対象外。
   * ※ Rカードが0枚の間は、Rの17%は在庫のあるレア(NORMAL/SR)へ自動で再配分されます。 */
  const GACHA_RATES = { NORMAL: 78, RARE: 17, SR: 5 };
  const DUPE_BONUS_THRESHOLD = 5; // 被り“合計”5枚で無料ガチャ1回

  const STORAGE_KEYS = {
    counts: "and-card:counts", // { cardId: 所持枚数 }
    dailyDate: "and-card:dailyDate", // 今日のデイリーを使った日付(YYYY-MM-DD)
    bonus: "and-card:bonus", // ボーナスガチャ残数
    dupeStock: "and-card:dupeStock", // 被り貯金(0..4)
  };

  /* ----------------------------- 状態 ----------------------------- */
  const baseCards = Array.isArray(window.AND_CARDS) ? window.AND_CARDS : [];
  let counts = loadJSON(STORAGE_KEYS.counts, {}); // 所持枚数マップ（被り対応）
  let bonusPulls = loadInt(STORAGE_KEYS.bonus, 0); // ボーナスガチャ残
  let dupeStock = loadInt(STORAGE_KEYS.dupeStock, 0); // 被り貯金 0..4
  let dailyDate = localStorage.getItem(STORAGE_KEYS.dailyDate) || null; // 最後にデイリーを使った日
  let activeFilter = "ALL";
  let newlyUnlockedId = null; // ガチャ直後に NEW! を付けるID
  let lastFocused = null; // モーダルを開く前のフォーカス要素

  /* ----------------------------- DOM ----------------------------- */
  const els = {
    stats: document.getElementById("stats"),
    filters: document.getElementById("filters"),
    grid: document.getElementById("grid"),
    gachaBtn: document.getElementById("gachaBtn"),
    gachaStatus: document.getElementById("gachaStatus"),
    modal: document.getElementById("modal"),
    modalBody: document.getElementById("modalBody"),
    modalClose: document.getElementById("modalClose"),
    toast: document.getElementById("toast"),
    demoControls: document.getElementById("demoControls"),
    demoNextDay: document.getElementById("demoNextDay"),
    demoReset: document.getElementById("demoReset"),
  };

  // デモ操作は ?demo=1 の時だけ有効（本番のお客さんには見せない）
  const DEMO_MODE = /[?&]demo=1\b/.test(location.search);

  /* ====================================================================
   * ユーティリティ
   * ================================================================== */
  function loadJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }
  function loadInt(key, fallback) {
    const n = parseInt(localStorage.getItem(key), 10);
    return isNaN(n) ? fallback : n;
  }
  function save(key, val) {
    try {
      localStorage.setItem(key, typeof val === "string" ? val : JSON.stringify(val));
    } catch (e) {
      /* localStorage不可でも動作は継続 */
    }
  }

  // ローカル日付 YYYY-MM-DD（タイムゾーンずれ防止）
  function todayStr() {
    const d = new Date();
    return (
      d.getFullYear() +
      "-" +
      String(d.getMonth() + 1).padStart(2, "0") +
      "-" +
      String(d.getDate()).padStart(2, "0")
    );
  }
  function hasDailyToday() {
    return dailyDate !== todayStr();
  }
  function pullsAvailable() {
    return (hasDailyToday() ? 1 : 0) + bonusPulls;
  }

  // 所持枚数（初期データ owned:true は1枚として扱う）＋所持判定
  function cardCount(card) {
    const c = counts[card.id];
    return c != null ? c : card.owned ? 1 : 0;
  }
  function isOwned(card) {
    return cardCount(card) > 0;
  }
  // HTMLエスケープ（データ由来テキストの安全な差し込み）
  function esc(str) {
    return String(str == null ? "" : str).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  // SECRETの名前を一部伏せ字化（先頭と末尾だけ残す）
  function maskSecretName(name) {
    const chars = [...name];
    if (chars.length <= 2) return esc(name);
    const head = esc(chars[0]);
    const tail = esc(chars[chars.length - 1]);
    const mid = chars.slice(1, -1).map(() => "▮").join("");
    return head + '<span class="redacted">' + mid + "</span>" + tail;
  }

  /* ====================================================================
   * カード外枠のHTML（グリッド / モーダル共通）
   * options.big = true でモーダル用の非インタラクティブ表示
   * ================================================================== */
  function cardMarkup(card, options) {
    const opts = options || {};
    const owned = isOwned(card);
    const locked = !owned;
    const isSecret = card.rarity === "SECRET";

    // 名前（未所持SECRETだけ伏せ字。所持したら堂々と表示）
    let nameHtml;
    if (isSecret && !owned) {
      nameHtml = maskSecretName(card.name);
    } else {
      nameHtml = esc(card.name);
    }

    // 画像 or プレースホルダー（画像未設定/読み込み失敗で自動フォールバック）
    let imageInner;
    if (card.imageUrl) {
      imageInner =
        '<img src="' +
        esc(card.imageUrl) +
        '" alt="' +
        esc(card.name) +
        ' のカード画像" ' +
        "onerror=\"this.style.display='none';this.nextElementSibling.hidden=false;\" />" +
        placeholderMarkup(true);
    } else {
      imageInner = placeholderMarkup(false);
    }

    const isBig = opts.big ? " card--big" : "";
    const lockedClass = locked ? " is-locked" : "";
    const newClass = !opts.big && card.id === newlyUnlockedId ? " is-new" : "";

    // NEW! はモーダルでは付けない
    return (
      '<article class="card card--' +
      card.rarity +
      isBig +
      lockedClass +
      newClass +
      '">' +
      '<div class="card__frame">' +
      // 上部
      '<div class="card__top">' +
      '<span class="card__rarity">' +
      card.rarity +
      "</span>" +
      '<span class="card__no">No.' +
      esc(card.no) +
      "</span>" +
      "</div>" +
      // 画像枠 + 属性（属性が無ければバリアント名を表示）
      '<div class="card__image">' +
      '<span class="card__attr">' +
      esc(card.attribute || card.variant || "") +
      "</span>" +
      imageInner +
      "</div>" +
      // 本文
      '<div class="card__body">' +
      '<h3 class="card__name">' +
      nameHtml +
      (card.variant ? ' <span class="card__variant">' + esc(card.variant) + "</span>" : "") +
      "</h3>" +
      (card.catchCopy ? '<p class="card__catch">' + esc(card.catchCopy) + "</p>" : "") +
      "</div>" +
      // スキル（データがある時だけ）
      (card.skillName
        ? '<div class="card__skill">' +
          '<span class="card__skill-name">' +
          (isSecret && !owned ? '<span class="redacted">' + esc(card.skillName) + "</span>" : esc(card.skillName)) +
          "</span>" +
          (card.skillDescription ? '<p class="card__skill-desc">' + esc(card.skillDescription) + "</p>" : "") +
          "</div>"
        : "") +
      // フッター
      '<div class="card__foot">' +
      '<span class="card__logo">BAR <span class="amp">&amp;</span></span>' +
      '<span class="card__seal">STAFF CARD</span>' +
      "</div>" +
      "</div>" +
      // カード画像そのもの（art:"full"）を全面表示。読み込み失敗時は上のフォールバック枠に自動で戻る
      (card.art === "full" && card.imageUrl ? coverMarkup(card) : "") +
      // LOCKED オーバーレイ
      (locked ? lockMarkup(card) : "") +
      "</article>"
    );
  }

  // フルアート（完成カード画像）を外枠の上に重ねる。onerrorでcoverごと消えてフォールバック枠が見える
  function coverMarkup(card) {
    const alt =
      esc(card.name) + (card.variant ? "（" + esc(card.variant) + "）" : "") + " のカード";
    return (
      '<div class="card__cover">' +
      '<img class="card__cover-img" src="' +
      esc(card.imageUrl) +
      '" alt="' +
      alt +
      '" onerror="this.closest(\'.card__cover\').remove()" />' +
      '<span class="card__badge card__badge--rarity">' +
      card.rarity +
      "</span>" +
      '<span class="card__badge card__badge--no">No.' +
      esc(card.no) +
      "</span>" +
      "</div>"
    );
  }

  function placeholderMarkup(hidden) {
    return (
      '<div class="card__placeholder"' +
      (hidden ? " hidden" : "") +
      ">" +
      '<span class="ph-mark" aria-hidden="true">🖼️</span>' +
      '<span class="ph-text">IMAGE<br />COMING SOON</span>' +
      "</div>"
    );
  }

  function lockMarkup(card) {
    return (
      '<div class="card__lock">' +
      '<span class="lock-icon" aria-hidden="true">🔒</span>' +
      '<span class="lock-text">LOCKED</span>' +
      '<span class="lock-hint">' +
      esc(card.obtainCondition) +
      "</span>" +
      "</div>"
    );
  }

  /* ====================================================================
   * グリッド描画
   * ================================================================== */
  function renderGrid() {
    const list =
      activeFilter === "ALL"
        ? baseCards
        : baseCards.filter((c) => c.rarity === activeFilter);

    if (!list.length) {
      els.grid.innerHTML =
        '<p class="grid__empty">このレアリティのカードはまだありません。</p>';
      return;
    }

    els.grid.innerHTML = list
      .map(function (card) {
        const owned = isOwned(card);
        const label =
          card.rarity +
          " " +
          (owned
            ? esc(card.name) + (card.variant ? " " + esc(card.variant) : "")
            : "未所持のカード") +
          "、詳細を開く";
        return (
          '<button type="button" class="card-hit" data-id="' +
          esc(card.id) +
          '" aria-label="' +
          label +
          '" style="all:unset;display:block;cursor:pointer;">' +
          cardMarkup(card, {}) +
          "</button>"
        );
      })
      .join("");
  }

  /* ====================================================================
   * ステータス描画
   * ================================================================== */
  function renderStats() {
    const total = baseCards.length;
    const ownedCards = baseCards.filter(isOwned);
    const ownedCount = ownedCards.length;
    const pct = total ? Math.round((ownedCount / total) * 100) : 0;

    let top = "–";
    ownedCards.forEach(function (c) {
      if (top === "–" || RARITY_ORDER[c.rarity] > RARITY_ORDER[top]) top = c.rarity;
    });

    els.stats.innerHTML =
      statBox("所持枚数", ownedCount + " / " + total, "枚 コンプ") +
      statBox("コンプリート率", pct + "%", "COMPLETE") +
      statBox("最高レアリティ", top, top === "–" ? "未所持" : RARITY_LABEL_JP[top]);
  }
  function statBox(label, value, sub) {
    return (
      '<div class="stat">' +
      '<div class="stat__label">' +
      label +
      "</div>" +
      '<div class="stat__value">' +
      value +
      "</div>" +
      '<div class="stat__sub">' +
      sub +
      "</div>" +
      "</div>"
    );
  }

  /* ====================================================================
   * フィルター描画
   * ================================================================== */
  function renderFilters() {
    const defs = [{ key: "ALL", label: "ALL" }].concat(
      RARITIES.map((r) => ({ key: r, label: r }))
    );

    els.filters.innerHTML = defs
      .map(function (d) {
        const count =
          d.key === "ALL"
            ? baseCards.length
            : baseCards.filter((c) => c.rarity === d.key).length;
        const pressed = activeFilter === d.key;
        return (
          '<button type="button" class="chip" data-filter="' +
          d.key +
          '" aria-pressed="' +
          pressed +
          '">' +
          d.label +
          '<span class="chip__count">' +
          count +
          "</span>" +
          "</button>"
        );
      })
      .join("");
  }

  /* ====================================================================
   * モーダル
   * ================================================================== */
  function modalMarkup(card, opts) {
    opts = opts || {};
    const owned = isOwned(card);
    const isSecret = card.rarity === "SECRET";
    // 未所持SECRETは情報を伏せる
    const revealSecret = owned || !isSecret;

    const nameForTitle = isSecret && !owned ? "シークレットカード" : card.name;

    const n = cardCount(card);
    const statusHtml = owned
      ? '<div class="modal__status owned">✔ 所持済み' +
        (n > 1 ? "（" + n + "枚）" : "") +
        "</div>"
      : '<div class="modal__status locked">🔒 未所持 — LOCKED</div>';

    // バリアント名（テーマ）を見出しの下に表示
    const subtitle =
      card.variant && revealSecret
        ? '<p class="modal__subtitle">' + esc(card.variant) + "</p>"
        : "";

    // 属性タグ（あれば）
    const attrTag = card.attribute
      ? '<span class="tag tag--attr">属性: ' + esc(card.attribute) + "</span>"
      : "";

    // キャッチコピー（あれば）
    const catchBlock =
      card.catchCopy && revealSecret
        ? '<div class="modal__block">' +
          '<div class="modal__label">Catch Copy</div>' +
          '<p class="modal__catch">' +
          esc(card.catchCopy) +
          "</p>" +
          "</div>"
        : "";

    // スキル（データがある時／SECRET未所持は伏せる）
    let skillBlock = "";
    if (card.skillName || (isSecret && !owned)) {
      const skillName = revealSecret ? esc(card.skillName) : "？？？";
      const skillDesc = revealSecret
        ? esc(card.skillDescription || "")
        : "所持すると解放される、本人しか知らないネタ。";
      skillBlock =
        '<div class="modal__block">' +
        '<div class="modal__label">Skill</div>' +
        '<div class="modal__skillcard">' +
        '<div class="s-name">' +
        skillName +
        "</div>" +
        (skillDesc ? '<p class="s-desc">' + skillDesc + "</p>" : "") +
        "</div>" +
        "</div>";
    }

    return (
      '<div class="modal__grid">' +
      '<div class="modal__cardwrap">' +
      cardMarkup(card, { big: true }) +
      "</div>" +
      '<div class="modal__info">' +
      '<h3 id="modalTitle">' +
      esc(nameForTitle) +
      "</h3>" +
      subtitle +
      '<div class="modal__meta">' +
      '<span class="tag tag--no">No.' +
      esc(card.no) +
      "</span>" +
      '<span class="tag tag--rarity">' +
      card.rarity +
      " / " +
      RARITY_LABEL_JP[card.rarity] +
      "</span>" +
      attrTag +
      "</div>" +
      catchBlock +
      skillBlock +
      // 入手条件
      '<div class="modal__block">' +
      '<div class="modal__label">How to get</div>' +
      '<div class="modal__obtain">' +
      '<span class="o-icon" aria-hidden="true">🎯</span>' +
      "<span>" +
      esc(card.obtainCondition) +
      "</span>" +
      "</div>" +
      "</div>" +
      statusHtml +
      "</div>" +
      "</div>"
    );
  }

  function openModal(card, opts) {
    opts = opts || {};
    lastFocused = document.activeElement;
    els.modalBody.innerHTML = modalMarkup(card, opts);
    els.modal.hidden = false;
    document.body.style.overflow = "hidden";
    // フォーカスを閉じるボタンへ
    els.modalClose.focus();
    document.addEventListener("keydown", onModalKeydown);
  }

  function closeModal() {
    els.modal.hidden = true;
    els.modal.classList.remove("is-drawing");
    document.body.style.overflow = "";
    document.removeEventListener("keydown", onModalKeydown);
    if (lastFocused && typeof lastFocused.focus === "function") {
      lastFocused.focus();
    }
  }

  function onModalKeydown(e) {
    if (e.key === "Escape") {
      closeModal();
      return;
    }
    // 簡易フォーカストラップ（Tabをモーダル内に留める）
    if (e.key === "Tab") {
      const focusables = els.modal.querySelectorAll(
        'button, [href], input, [tabindex]:not([tabindex="-1"])'
      );
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }

  /* ====================================================================
   * ガチャ（デイリー1回 + 被り救済 / 体験版）
   * ================================================================== */
  // 現在の月（1-12）
  function currentMonth() {
    return new Date().getMonth() + 1;
  }

  // このカードが「今」通常ガチャの排出対象か？
  //  - card.gacha === true         : レアリティに関わらず対象（夏限定シークレット等）
  //  - card.gacha 未指定           : rarity が GACHA_RATES にあれば対象（NORMAL/RARE/SR）
  //                                  → SSR/SECRET は既定では対象外
  //  - card.months があるとき       : 現在の月がその配列に含まれる時だけ対象（期間限定）
  function isGachaCard(card) {
    const eligible =
      card.gacha === true ||
      (card.gacha == null && Object.prototype.hasOwnProperty.call(GACHA_RATES, card.rarity));
    if (!eligible) return false;
    if (Array.isArray(card.months) && card.months.length) {
      return card.months.indexOf(currentMonth()) !== -1;
    }
    return true;
  }

  // 排出枠（gachaBucket 優先。無ければ rarity）。夏限定シークレットは "SR" 枠を共有する。
  function gachaBucketOf(card) {
    return card.gachaBucket || card.rarity;
  }

  // 今このタイミングで引ける対象カード一覧
  function activeGachaCards() {
    return baseCards.filter(isGachaCard);
  }

  // 対象カードを枠(NORMAL/RARE/SR)ごとに束ね、設定%で重み付き抽選 → その枠から1枚。
  // 在庫の無い枠（例: R 0枚）の%は、在庫のある枠へ自動で再配分される。
  function pickGachaCard() {
    const pool = activeGachaCards();
    if (!pool.length) return null;

    const buckets = {};
    pool.forEach((c) => {
      const b = gachaBucketOf(c);
      (buckets[b] = buckets[b] || []).push(c);
    });

    const keys = Object.keys(buckets).filter((b) =>
      Object.prototype.hasOwnProperty.call(GACHA_RATES, b)
    );
    const total = keys.reduce((sum, b) => sum + GACHA_RATES[b], 0);
    if (!keys.length || total <= 0) return null;

    let roll = Math.random() * total;
    let chosen = keys[keys.length - 1];
    for (const b of keys) {
      roll -= GACHA_RATES[b];
      if (roll <= 0) {
        chosen = b;
        break;
      }
    }
    const group = buckets[chosen];
    return group[Math.floor(Math.random() * group.length)];
  }

  // 夏限定シークレットが今出現しているか（ステータス表示用）
  function summerSecretsActive() {
    return baseCards.some(
      (c) => c.rarity === "SECRET" && c.gacha === true && isGachaCard(c)
    );
  }

  function drawGacha() {
    // 引ける回数チェック（デイリー + ボーナス）
    if (pullsAvailable() <= 0) {
      showToast("今日のガチャは引き切りました。また明日！🌙");
      renderGachaStatus();
      return;
    }

    const card = pickGachaCard();
    if (!card) {
      showToast("ガチャ対象のカードがありません。");
      return;
    }
    const wasNew = !isOwned(card);

    // 回数を消費（デイリー優先→ボーナス）
    if (hasDailyToday()) {
      dailyDate = todayStr();
      save(STORAGE_KEYS.dailyDate, dailyDate);
    } else {
      bonusPulls = Math.max(0, bonusPulls - 1);
      save(STORAGE_KEYS.bonus, bonusPulls);
    }

    // 所持枚数を加算
    counts[card.id] = cardCount(card) + 1;
    save(STORAGE_KEYS.counts, counts);

    // 被り救済（合計5枚でボーナス1回）
    let gotBonus = false;
    if (!wasNew) {
      dupeStock += 1;
      if (dupeStock >= DUPE_BONUS_THRESHOLD) {
        dupeStock -= DUPE_BONUS_THRESHOLD;
        bonusPulls += 1;
        gotBonus = true;
        save(STORAGE_KEYS.bonus, bonusPulls);
      }
      save(STORAGE_KEYS.dupeStock, dupeStock);
    } else {
      newlyUnlockedId = card.id;
    }

    // 抽選演出 → 結果表示
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    lastFocused = document.activeElement;
    els.modalBody.innerHTML =
      '<div class="modal__grid"><div class="modal__cardwrap">' +
      '<span class="drawing-badge">抽選中…</span>' +
      cardMarkup(card, { big: true }) +
      '</div><div class="modal__info"><h3 id="modalTitle">ガチャを引いています…</h3>' +
      '<p style="opacity:.7;font-weight:700">🎴 めくると、誰が出るかな？</p></div></div>';
    els.modal.hidden = false;
    els.modal.classList.add("is-drawing");
    document.body.style.overflow = "hidden";
    els.modalClose.focus();
    document.addEventListener("keydown", onModalKeydown);

    const reveal = function () {
      els.modal.classList.remove("is-drawing");
      renderStats();
      renderGrid();
      renderGachaStatus();
      if (wasNew) {
        showToast("NEW! " + card.rarity + " " + card.name + " を入手！🎉");
      } else if (gotBonus) {
        showToast("被り5枚達成！ボーナスガチャ +1 🎁");
      } else {
        showToast(
          "被り… " +
            card.name +
            "（所持" +
            cardCount(card) +
            "枚）｜あと" +
            (DUPE_BONUS_THRESHOLD - dupeStock) +
            "枚で無料ガチャ"
        );
      }
      openModal(card);
    };

    if (reduceMotion) reveal();
    else window.setTimeout(reveal, 850);
  }

  /* ====================================================================
   * ガチャ状態パネル（引ける回数・被りメーター）
   * ================================================================== */
  function renderGachaStatus() {
    if (!els.gachaStatus) return;
    const avail = pullsAvailable();
    const dailyLeft = hasDailyToday() ? 1 : 0;

    // ボタンの状態・ラベル
    els.gachaBtn.disabled = avail <= 0;
    const btnLabel = els.gachaBtn.querySelector("span:last-child");
    if (btnLabel) {
      btnLabel.textContent =
        avail <= 0
          ? "また明日引ける"
          : dailyLeft
          ? "今日の1枚を引く"
          : "ボーナスガチャを引く（残り" + bonusPulls + "）";
    }

    const pct = Math.round((dupeStock / DUPE_BONUS_THRESHOLD) * 100);
    const seasonHtml = summerSecretsActive()
      ? '<div class="gs-season">🌴 夏限定シークレット出現中（7・8月／SRと同確率）</div>'
      : "";
    els.gachaStatus.innerHTML =
      seasonHtml +
      '<div class="gs-row">' +
      '<span class="gs-pill' + (dailyLeft ? " on" : "") + '">デイリー ' +
      (dailyLeft ? "1回" : "済") +
      "</span>" +
      '<span class="gs-pill' + (bonusPulls > 0 ? " on" : "") + '">ボーナス ' +
      bonusPulls +
      "回</span>" +
      '<span class="gs-pill big">引ける回数 ' + avail + "</span>" +
      "</div>" +
      '<div class="gs-dupe">' +
      '<div class="gs-dupe-label">被り貯金 <b>' + dupeStock + " / " + DUPE_BONUS_THRESHOLD +
      "</b>（5枚で無料ガチャ）</div>" +
      '<div class="gs-bar"><span style="width:' + pct + '%"></span></div>' +
      "</div>";
  }

  /* ====================================================================
   * トースト
   * ================================================================== */
  let toastTimer = null;
  function showToast(msg) {
    els.toast.textContent = msg;
    els.toast.hidden = false;
    if (toastTimer) window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(function () {
      els.toast.hidden = true;
    }, 2600);
  }

  /* ====================================================================
   * イベント
   * ================================================================== */
  function bindEvents() {
    // フィルター（イベント委譲）
    els.filters.addEventListener("click", function (e) {
      const btn = e.target.closest(".chip");
      if (!btn) return;
      activeFilter = btn.dataset.filter;
      newlyUnlockedId = null; // フィルター操作でNEW表示はリセット
      renderFilters();
      renderGrid();
    });

    // カードクリック → モーダル（イベント委譲）
    els.grid.addEventListener("click", function (e) {
      const hit = e.target.closest(".card-hit");
      if (!hit) return;
      const card = baseCards.find((c) => c.id === hit.dataset.id);
      if (card) openModal(card);
    });

    // ガチャ
    els.gachaBtn.addEventListener("click", drawGacha);

    // モーダルを閉じる（✕ / 背景）
    els.modal.addEventListener("click", function (e) {
      if (e.target.closest("[data-close]")) closeModal();
    });

    // --- デモ操作（体験版のみ / 本番では削除予定） ---
    if (els.demoNextDay) {
      els.demoNextDay.addEventListener("click", function () {
        // デイリーを回復（＝翌日相当）
        dailyDate = null;
        localStorage.removeItem(STORAGE_KEYS.dailyDate);
        renderGachaStatus();
        showToast("デモ：デイリーを回復しました（翌日相当）");
      });
    }
    if (els.demoReset) {
      els.demoReset.addEventListener("click", function () {
        if (!window.confirm("コレクションとガチャ状況をすべてリセットします。よろしいですか？")) return;
        Object.values(STORAGE_KEYS).forEach((k) => localStorage.removeItem(k));
        counts = {};
        bonusPulls = 0;
        dupeStock = 0;
        dailyDate = null;
        newlyUnlockedId = null;
        renderStats();
        renderGrid();
        renderGachaStatus();
        showToast("デモ：リセットしました");
      });
    }
  }

  /* ====================================================================
   * 初期化
   * ================================================================== */
  function init() {
    if (!baseCards.length) {
      els.grid.innerHTML =
        '<p class="grid__empty">カードデータが読み込めませんでした。</p>';
      return;
    }
    // デモ操作は ?demo=1 の時だけ表示（本番のお客さんには出さない）
    if (DEMO_MODE && els.demoControls) els.demoControls.hidden = false;
    renderStats();
    renderFilters();
    renderGrid();
    renderGachaStatus();
    bindEvents();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
