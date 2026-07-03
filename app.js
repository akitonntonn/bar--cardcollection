/* =========================================================================
 * BAR & — STAFF CARD COLLECTION / アプリロジック（Vanilla JS）
 * -------------------------------------------------------------------------
 * 依存: data/cards.js（window.AND_CARDS）
 * 主な責務:
 *   - カードグリッド / レアリティフィルター / ステータスの描画
 *   - カード詳細モーダル（アクセシビリティ対応）
 *   - 認証（メールのマジックリンク）＋ ログイン/ログアウト
 *   - デイリーガチャ（1日1回・被りあり・被り3枚で無料ガチャ）＝サーバ権威
 *   - 所持枚数・ガチャ状態は Supabase（user_cards / profiles）に保存
 *
 * ▼ ガチャ経済（サーバ権威 / Supabase）
 *   抽選・回数消費・被り救済はすべて DB関数 draw_gacha() 側で完結。
 *   フロントは rpc('draw_gacha') を呼んで結果を受け取り、表示するだけ。
 *   counts      : { cardId: 枚数 }（user_cards から）
 *   serverState : bonus_pulls / dupe_stock / daily_available（profiles から）
 *   ※ DUPE_BONUS_THRESHOLD はUI表示用。実際の付与判定は functions.sql と一致させる。
 *
 * ▼ 今後の拡張ポイント
 *   - 来店QR/来店SSR : 店舗トークン付きURL or 管理者ポータル（grant_card/record_visit）
 *   - Instagram導線  : 公開プロフィール＋シェア画像生成
 * ========================================================================= */

(function () {
  "use strict";

  /* ----------------------------- 定数 ----------------------------- */
  const RARITIES = ["NORMAL", "RARE", "SR", "SSR", "SECRET"];
  const RARITY_ORDER = { NORMAL: 0, RARE: 1, SR: 2, SSR: 3, SECRET: 4 };
  const RARITY_LABEL_JP = {
    NORMAL: "通常",
    RARE: "レア（17%）",
    SR: "激レア（5%）",
    SSR: "誕生日・来店記念",
    SECRET: "シークレット",
  };
  /* --- ガチャ設定（表示用。実際の抽選・付与は Supabase の draw_gacha が権威） ---
   * 排出率（%）。SSR=来店記念のみ / SECRET=特殊条件 なので通常ガチャ対象外。 */
  const GACHA_RATES = { NORMAL: 78, RARE: 17, SR: 5 };
  // 被り“合計”3枚で無料ガチャ1回。※ functions.sql の DUPE_THRESHOLD と必ず一致させる。
  const DUPE_BONUS_THRESHOLD = 3;

  /* ----------------------------- 状態 ----------------------------- */
  const baseCards = Array.isArray(window.AND_CARDS) ? window.AND_CARDS : [];

  // Supabase クライアント（設定＆ライブラリがあれば有効）
  const cfg = window.AND_CONFIG || {};
  const sb =
    window.supabase && cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY
      ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY)
      : null;

  let session = null; // ログインセッション（null=未ログイン）
  let counts = {}; // 所持枚数マップ { cardId: 枚数 }（Supabaseの user_cards から）
  // サーバ側のガチャ状態（profiles 由来）
  let serverState = { bonus_pulls: 0, dupe_stock: 0, daily_available: false, display_name: "", is_admin: false };
  let busy = false; // ガチャ多重実行ガード
  let authReady = !sb; // 初回セッション確認が済んだか（ちらつき防止。sb無しなら即確定）
  const REDEEM_KEY = "and-card:pendingRedeem"; // QRコード（?redeem=）の一時保管

  let activeFilter = "ALL";
  let newlyUnlockedId = null; // ガチャ直後に NEW! を付けるID
  let lastFocused = null; // モーダルを開く前のフォーカス要素

  /* ----------------------------- DOM ----------------------------- */
  const els = {
    authBar: document.getElementById("authBar"),
    stats: document.getElementById("stats"),
    filters: document.getElementById("filters"),
    grid: document.getElementById("grid"),
    gachaBtn: document.getElementById("gachaBtn"),
    gachaStatus: document.getElementById("gachaStatus"),
    modal: document.getElementById("modal"),
    modalBody: document.getElementById("modalBody"),
    modalClose: document.getElementById("modalClose"),
    toast: document.getElementById("toast"),
  };

  /* ====================================================================
   * ユーティリティ
   * ================================================================== */
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
    return !!serverState.daily_available;
  }
  function pullsAvailable() {
    return (hasDailyToday() ? 1 : 0) + (serverState.bonus_pulls || 0);
  }

  // 所持枚数（Supabaseの所持マップ。未ログイン/未所持は0＝LOCKED）＋所持判定
  function cardCount(card) {
    const c = counts[card.id];
    return c != null ? c : 0;
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
        '<img loading="lazy" decoding="async" src="' +
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
      '<img class="card__cover-img" loading="lazy" decoding="async" src="' +
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
      // 期間限定カードには「◯月限定」バッジ（図鑑で見分けがつくように）
      (Array.isArray(card.months) && card.months.length
        ? '<span class="card__badge card__badge--season">🌴 ' +
          card.months.join("・") +
          "月限定</span>"
        : "") +
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

    // 期間限定タグ（monthsがあるカード）
    const seasonTag =
      Array.isArray(card.months) && card.months.length
        ? '<span class="tag tag--season">🌴 ' + card.months.join("・") + "月限定</span>"
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
      seasonTag +
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
      // シェア（所持カードのみ。スマホは共有シート/PCはコピー）
      (owned
        ? '<button type="button" class="btn share-btn" data-share-id="' +
          esc(card.id) +
          '">📤 シェアする</button>'
        : "") +
      "</div>" +
      "</div>"
    );
  }

  // モーダルの「開く」土台（中身は呼び出し側で入れる）。カード詳細・ガチャ・ログイン共通。
  function showModalShell() {
    els.modal.hidden = false;
    document.body.style.overflow = "hidden";
    els.modalClose.focus();
    document.addEventListener("keydown", onModalKeydown);
  }

  function openModal(card, opts) {
    opts = opts || {};
    lastFocused = document.activeElement;
    els.modalBody.innerHTML = modalMarkup(card, opts);
    showModalShell();
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

  // 夏限定シークレットが今出現しているか（ステータス表示用）
  function summerSecretsActive() {
    return baseCards.some(
      (c) => c.rarity === "SECRET" && c.gacha === true && isGachaCard(c)
    );
  }

  async function drawGacha() {
    if (!sb) {
      showToast("ただいま準備中です。少し待ってね🙏");
      return;
    }
    if (!session) {
      openAuthModal(); // 未ログインならログインへ誘導
      return;
    }
    if (busy) return;
    if (pullsAvailable() <= 0) {
      showToast("今日のガチャは引き切りました。また明日！🌙");
      renderGachaStatus();
      return;
    }

    busy = true;
    els.gachaBtn.disabled = true;

    // 抽選演出（結果が返るまでカードは伏せる）
    lastFocused = document.activeElement;
    els.modalBody.innerHTML =
      '<div class="modal__grid"><div class="modal__cardwrap">' +
      '<div class="draw-back"><span class="draw-back__amp">&amp;</span>' +
      '<span class="drawing-badge">抽選中…</span></div>' +
      '</div><div class="modal__info"><h3 id="modalTitle">ガチャを引いています…</h3>' +
      '<p style="opacity:.7;font-weight:700">🎴 めくると、誰が出るかな？</p></div></div>';
    showModalShell();
    els.modal.classList.add("is-drawing");

    // サーバ権威のガチャ（抽選・回数消費・被り救済は全部サーバ側）
    let data = null,
      error = null;
    try {
      const res = await sb.rpc("draw_gacha");
      data = res.data;
      error = res.error;
    } catch (e) {
      error = e;
    }

    const finish = function () {
      els.modal.classList.remove("is-drawing");
      busy = false;

      if (error) {
        closeModal();
        showToast("エラー: " + (error.message || "通信に失敗しました"));
        renderGachaStatus();
        return;
      }
      if (!data || !data.ok) {
        closeModal();
        if (data && data.reason === "no_pulls") {
          showToast("今日のガチャは引き切りました。また明日！🌙");
        } else {
          showToast("いまはガチャ対象のカードがありません。");
        }
        renderGachaStatus();
        return;
      }

      // サーバ結果を反映（原本カタログから見つけて描画）
      const card = baseCards.find((c) => c.id === data.card.id) || data.card;
      counts[card.id] = (counts[card.id] || 0) + 1;
      serverState.bonus_pulls = data.bonus_pulls;
      serverState.dupe_stock = data.dupe_stock;
      serverState.daily_available = data.daily_available;
      if (data.was_new) newlyUnlockedId = card.id;

      renderStats();
      renderGrid();
      renderGachaStatus();

      if (data.was_new) {
        showToast("NEW! " + card.rarity + " " + card.name + " を入手！🎉");
      } else if (data.got_bonus) {
        showToast("被り" + DUPE_BONUS_THRESHOLD + "枚達成！ボーナスガチャ +1 🎁");
      } else {
        showToast(
          "被り… " +
            card.name +
            "（所持" +
            counts[card.id] +
            "枚）｜あと" +
            (DUPE_BONUS_THRESHOLD - serverState.dupe_stock) +
            "枚で無料ガチャ"
        );
      }

      // 開いているモーダルの中身を結果カードへ差し替え（フォーカスは維持）
      els.modalBody.innerHTML = modalMarkup(card, {});
      els.modalClose.focus();
    };

    // ネットワーク待ちに加えて少しだけ演出を見せる
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) finish();
    else window.setTimeout(finish, 600);
  }

  /* ====================================================================
   * ガチャ状態パネル（引ける回数・被りメーター）
   * ================================================================== */
  function renderGachaStatus() {
    if (!els.gachaStatus) return;
    const btnLabel = els.gachaBtn.querySelector("span:last-child");
    // 初回セッション確認中はボタンを触らせない（ちらつき/誤タップ防止）
    if (sb && !authReady) {
      els.gachaBtn.disabled = true;
      if (btnLabel) btnLabel.textContent = "読み込み中…";
      els.gachaStatus.innerHTML = "";
      return;
    }
    const seasonHtml = summerSecretsActive()
      ? '<div class="gs-season">🌴 夏限定シークレット出現中（7・8月／SRと同確率）</div>'
      : "";

    // 未ログイン：ガチャの代わりにログイン導線を出す
    if (!session) {
      els.gachaBtn.disabled = false;
      if (btnLabel) btnLabel.textContent = "会員登録してガチャを引く";
      els.gachaStatus.innerHTML =
        seasonHtml +
        '<div class="gs-guest">🔑 ログインすると、1日1回ガチャ＆コレクションの保存ができます。</div>';
      return;
    }

    const avail = pullsAvailable();
    const dailyLeft = hasDailyToday() ? 1 : 0;
    const bonus = serverState.bonus_pulls || 0;
    const dupe = serverState.dupe_stock || 0;

    els.gachaBtn.disabled = busy || avail <= 0;
    if (btnLabel) {
      btnLabel.textContent =
        avail <= 0
          ? "また明日引ける"
          : dailyLeft
          ? "今日の1枚を引く"
          : "ボーナスガチャを引く（残り" + bonus + "）";
    }

    const pct = Math.round((dupe / DUPE_BONUS_THRESHOLD) * 100);
    els.gachaStatus.innerHTML =
      seasonHtml +
      '<div class="gs-row">' +
      '<span class="gs-pill' + (dailyLeft ? " on" : "") + '">デイリー ' +
      (dailyLeft ? "1回" : "済") +
      "</span>" +
      '<span class="gs-pill' + (bonus > 0 ? " on" : "") + '">ボーナス ' +
      bonus +
      "回</span>" +
      '<span class="gs-pill big">引ける回数 ' + avail + "</span>" +
      "</div>" +
      '<div class="gs-dupe">' +
      '<div class="gs-dupe-label">被り貯金 <b>' + dupe + " / " + DUPE_BONUS_THRESHOLD +
      "</b>（" + DUPE_BONUS_THRESHOLD + "枚で無料ガチャ）</div>" +
      '<div class="gs-bar"><span style="width:' + pct + '%"></span></div>' +
      "</div>" +
      '<button type="button" class="gs-code" id="redeemEntryBtn">🎫 お店でもらったQR・コードはこちら</button>';
  }

  /* ====================================================================
   * 認証（Supabase・メールのマジックリンク）＋クラウド保存
   * ================================================================== */
  function renderAuthBar() {
    if (!els.authBar) return;
    if (!sb) {
      els.authBar.innerHTML = '<span class="authbar__hello">オフライン表示</span>';
      return;
    }
    // 初回セッション確認が終わるまでは「ようこそ！」を出さない（ちらつき防止）
    if (!authReady) {
      els.authBar.innerHTML = '<span class="authbar__hello">読み込み中…</span>';
      return;
    }
    if (session) {
      const name = esc(
        serverState.display_name || (session.user && session.user.email) || "会員"
      );
      els.authBar.innerHTML =
        '<span class="authbar__hello">👤 ' + name + " さん</span>" +
        '<button type="button" class="authbar__btn" id="editNameBtn" title="表示名を変更">✏️ 名前</button>' +
        (serverState.is_admin
          ? '<a class="authbar__btn admin" href="./admin.html">🛠 管理</a>'
          : "") +
        '<button type="button" class="authbar__btn" id="logoutBtn">ログアウト</button>';
    } else {
      els.authBar.innerHTML =
        '<span class="authbar__hello">ようこそ！</span>' +
        '<button type="button" class="authbar__btn primary" id="loginBtn">会員登録 / ログイン</button>';
    }
  }

  // ログイン用モーダル（メール入力 → マジックリンク送信）
  function openAuthModal() {
    if (!sb) {
      showToast("ただいま準備中です🙏");
      return;
    }
    lastFocused = document.activeElement;
    els.modalBody.innerHTML =
      '<div class="auth-form">' +
      '<h3 id="modalTitle">会員登録 / ログイン</h3>' +
      '<p class="auth-lead">メールアドレスに<strong>ログイン用リンク</strong>を送ります。<br />パスワードは不要。届いたリンクを開くだけ。</p>' +
      '<button type="button" class="btn btn-google" id="googleBtn">' +
      '<span class="g-mark" aria-hidden="true">G</span> Googleでログイン</button>' +
      '<div class="auth-divider"><span>または メールで</span></div>' +
      '<form id="authForm" novalidate>' +
      '<input type="email" id="authEmail" class="auth-input" required placeholder="you@example.com" autocomplete="email" inputmode="email" aria-label="メールアドレス" />' +
      '<button type="submit" class="btn primary auth-submit">ログインリンクを送る</button>' +
      "</form>" +
      '<p class="auth-msg" id="authMsg" aria-live="polite"></p>' +
      "</div>";
    showModalShell();
    const input = document.getElementById("authEmail");
    if (input) input.focus();
  }

  async function onAuthSubmit(e) {
    e.preventDefault();
    if (!sb) return;
    const input = document.getElementById("authEmail");
    const msg = document.getElementById("authMsg");
    const email = ((input && input.value) || "").trim();
    if (!email) {
      if (msg) msg.textContent = "メールアドレスを入力してください。";
      return;
    }
    const btn = e.target.querySelector('button[type="submit"]');
    if (btn) {
      btn.disabled = true;
      btn.textContent = "送信中…";
    }
    let error = null;
    try {
      const res = await sb.auth.signInWithOtp({
        email: email,
        options: { emailRedirectTo: window.location.origin + window.location.pathname },
      });
      error = res.error;
    } catch (err) {
      error = err;
    }
    if (btn) {
      btn.disabled = false;
      btn.textContent = "ログインリンクを送る";
    }
    if (error) {
      try {
        console.error("signInWithOtp error:", error);
      } catch (e2) {}
      // 空オブジェクト{}対策：拾える情報を総当たりで表示（診断しやすく）
      const detail =
        error.message ||
        error.error_description ||
        error.msg ||
        (error.status ? "HTTP " + error.status : "") ||
        (error.name ? error.name : "") ||
        "不明なエラー（メール設定/ネットワークを確認。詳細はコンソール）";
      if (msg) {
        msg.textContent = "送信に失敗しました: " + detail;
        msg.classList.remove("is-ok");
      }
    } else if (msg) {
      msg.textContent =
        "✅ メールを送りました。届いたリンクを開いてください（迷惑メールも確認）。";
      msg.classList.add("is-ok");
    }
  }

  // Googleでログイン（Supabase側でプロバイダ有効化が必要）
  async function onGoogleLogin() {
    if (!sb) return;
    try {
      const res = await sb.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: window.location.origin + window.location.pathname },
      });
      if (res.error) throw res.error;
      // 成功時はGoogleへ画面遷移する（ここには戻ってこない）
    } catch (err) {
      const msgEl = document.getElementById("authMsg");
      const text = (err && (err.message || err.error_description)) || "";
      if (msgEl) {
        msgEl.textContent = /not enabled|disabled|unsupported/i.test(text)
          ? "Googleログインはただいま準備中です。メールでログインしてください🙏"
          : "Googleログインに失敗しました: " + (text || "不明なエラー");
        msgEl.classList.remove("is-ok");
      }
    }
  }

  /* ------------------- プロフィール（表示名の変更） ------------------- */
  function openProfileModal() {
    if (!sb || !session) return;
    lastFocused = document.activeElement;
    els.modalBody.innerHTML =
      '<div class="auth-form">' +
      '<h3 id="modalTitle">表示名の変更</h3>' +
      '<p class="auth-lead">図鑑で表示される名前です（20文字まで）。</p>' +
      '<form id="profileForm" novalidate>' +
      '<input type="text" id="profileName" class="auth-input" maxlength="20" placeholder="例：あきと" value="' +
      esc(serverState.display_name || "") +
      '" aria-label="表示名" />' +
      '<button type="submit" class="btn primary auth-submit">保存する</button>' +
      "</form>" +
      '<p class="auth-msg" id="profileMsg" aria-live="polite"></p>' +
      "</div>";
    showModalShell();
    const input = document.getElementById("profileName");
    if (input) input.focus();
  }

  async function onProfileSubmit(e) {
    e.preventDefault();
    if (!sb || !session) return;
    const input = document.getElementById("profileName");
    const msgEl = document.getElementById("profileMsg");
    const name = ((input && input.value) || "").trim();
    if (!name) {
      if (msgEl) msgEl.textContent = "名前を入力してください。";
      return;
    }
    let error = null;
    try {
      const res = await sb.from("profiles").update({ display_name: name }).eq("id", session.user.id);
      error = res.error;
    } catch (err) {
      error = err;
    }
    if (error) {
      if (msgEl) msgEl.textContent = "保存に失敗しました: " + (error.message || error);
      return;
    }
    serverState.display_name = name;
    renderAuthBar();
    closeModal();
    showToast("表示名を保存しました✅");
  }

  /* ------------------- シェア（Instagram等への導線） ------------------- */
  async function doShare(cardId) {
    const card = baseCards.find((c) => c.id === cardId);
    if (!card) return;
    const url = window.location.origin + window.location.pathname;
    const text =
      "BAR &『" +
      card.name +
      (card.variant ? "／" + card.variant : "") +
      "』(" +
      card.rarity +
      ") をゲット！ #BARand #スタッフカード図鑑";
    // スマホはOS共有シート（Instagram含む）、PCはクリップボードにコピー
    if (navigator.share) {
      try {
        await navigator.share({ title: "& STAFF CARD COLLECTION", text: text, url: url });
        return;
      } catch (e) {
        if (e && e.name === "AbortError") return; // ユーザーが閉じただけ
      }
    }
    try {
      await navigator.clipboard.writeText(text + " " + url);
      showToast("シェア用テキストをコピーしました📋 Instagram等に貼り付けてね");
    } catch (e) {
      showToast("コピーできませんでした🙏");
    }
  }

  /* ------------------- QRコード引換（?redeem=CODE） ------------------- */
  function hasPendingRedeem() {
    try {
      return !!localStorage.getItem(REDEEM_KEY);
    } catch (e) {
      return false;
    }
  }

  // URLの ?redeem=CODE を退避してURLから消す（リロードで二重実行しない）
  function checkRedeemParam() {
    const m = window.location.search.match(/[?&]redeem=([A-Za-z0-9-]+)/);
    if (!m) return;
    try {
      localStorage.setItem(REDEEM_KEY, m[1]);
    } catch (e) {}
    try {
      history.replaceState(null, "", window.location.pathname);
    } catch (e) {}
  }

  // コードをサーバで引換（QR経由・手入力どちらもここに集約）
  // 戻り値: { ok:true } | { ok:false, message:"理由" }
  async function redeemNow(code) {
    if (!sb || !session) return { ok: false, message: "ログインが必要です" };

    let res;
    try {
      res = await sb.rpc("redeem_code", { p_code: code });
    } catch (e) {
      res = { error: e };
    }
    if (res.error) {
      try {
        console.error("redeem_code error:", res.error);
      } catch (e2) {}
      return { ok: false, message: "適用に失敗しました: " + (res.error.message || "通信エラー") };
    }
    const d = res.data;
    if (!d || !d.ok) {
      const reasons = {
        not_found: "無効なコードです（入力ミスがないか確認してください）",
        expired: "期限切れのコードです",
        exhausted: "使用上限に達したコードです",
        already_used: "このコードはすでに使用済みです",
      };
      return { ok: false, message: reasons[d && d.reason] || "コードを適用できませんでした" };
    }

    if (d.kind === "pulls") {
      serverState.bonus_pulls += d.pulls;
      renderGachaStatus();
      // 見逃さないよう、トーストではなくモーダルで結果を出す
      lastFocused = document.activeElement;
      els.modalBody.innerHTML =
        '<div class="auth-form">' +
        '<h3 id="modalTitle">🎁 受け取りました！</h3>' +
        '<p class="auth-lead">ボーナスガチャ <strong>' +
        d.pulls +
        "回分</strong> を追加しました。<br />「ガチャを引く」ボタンからすぐ引けます！</p>" +
        "</div>";
      showModalShell();
    } else {
      const card = baseCards.find((c) => c.id === d.card.id) || d.card;
      counts[card.id] = (counts[card.id] || 0) + 1;
      if (d.was_new) newlyUnlockedId = card.id;
      renderStats();
      renderGrid();
      renderGachaStatus();
      showToast("🎉 特別なカードをゲット！");
      openModal(card);
    }
    return { ok: true };
  }

  // ログイン済みなら退避中のコード（?redeem= 由来）をサーバで引換
  async function consumePendingRedeem() {
    if (!sb || !session) return;
    let code = null;
    try {
      code = localStorage.getItem(REDEEM_KEY);
    } catch (e) {}
    if (!code) return;
    try {
      localStorage.removeItem(REDEEM_KEY);
    } catch (e) {}
    const res = await redeemNow(code);
    if (!res.ok) showToast("🎫 " + res.message);
  }

  // コード手入力モーダル（QRがSafari側で開いてしまった時の救済にもなる）
  function openRedeemModal() {
    if (!session) {
      openAuthModal();
      return;
    }
    lastFocused = document.activeElement;
    els.modalBody.innerHTML =
      '<div class="auth-form">' +
      '<h3 id="modalTitle">🎫 コードで受け取る</h3>' +
      '<p class="auth-lead">お店でもらったQRコードの下に書いてある<strong>8桁のコード</strong>を入力してください。</p>' +
      '<form id="redeemForm" novalidate>' +
      '<input type="text" id="redeemCode" class="auth-input" maxlength="12" placeholder="例：A1B2C3D4" ' +
      'autocapitalize="characters" autocomplete="off" spellcheck="false" aria-label="引換コード" />' +
      '<button type="submit" class="btn primary auth-submit">受け取る</button>' +
      "</form>" +
      '<p class="auth-msg" id="redeemMsg" aria-live="polite"></p>' +
      "</div>";
    showModalShell();
    const input = document.getElementById("redeemCode");
    if (input) input.focus();
  }

  async function onRedeemSubmit(e) {
    e.preventDefault();
    const input = document.getElementById("redeemCode");
    const msgEl = document.getElementById("redeemMsg");
    const code = ((input && input.value) || "").trim();
    if (!code) {
      if (msgEl) msgEl.textContent = "コードを入力してください。";
      return;
    }
    const btn = e.target.querySelector('button[type="submit"]');
    if (btn) {
      btn.disabled = true;
      btn.textContent = "確認中…";
    }
    const res = await redeemNow(code);
    if (!res.ok) {
      if (btn) {
        btn.disabled = false;
        btn.textContent = "受け取る";
      }
      if (msgEl) msgEl.textContent = res.message;
    }
    // 成功時は redeemNow が結果モーダルに差し替えるのでここでは何もしない
  }

  // 認証状態が変わった時（初回ロード / ログイン / ログアウト）
  async function onAuth(newSession) {
    authReady = true; // 初回セッション確認が完了（ちらつき解除）
    session = newSession || null;
    if (session) {
      await loadUserData();
      // ログインモーダルが開いていた時だけ閉じる（ガチャ演出など他のモーダルは邪魔しない）
      if (!els.modal.hidden && els.modalBody.querySelector("#authForm")) closeModal();
    } else {
      counts = {};
      serverState = { bonus_pulls: 0, dupe_stock: 0, daily_available: false, display_name: "", is_admin: false };
    }
    renderAuthBar();
    renderStats();
    renderGrid();
    renderGachaStatus();
    if (session) {
      await consumePendingRedeem(); // QRコードで来た場合はここで引換

      // ウェルカム特典の案内（新規：まだ1枚も持っておらずボーナスがある人に1回だけ）
      let welcomed = null;
      try {
        welcomed = localStorage.getItem("and-card:welcomed");
      } catch (e) {}
      const ownedKinds = baseCards.filter(isOwned).length;
      if (!welcomed && ownedKinds === 0 && serverState.bonus_pulls > 0) {
        showToast("🎁 ようこそ！ウェルカム特典ガチャ" + serverState.bonus_pulls + "回プレゼント！");
        try {
          localStorage.setItem("and-card:welcomed", "1");
        } catch (e) {}
      }
    } else if (hasPendingRedeem()) {
      showToast("🎫 QRコードの受け取りにはログインが必要です");
      openAuthModal();
    }
  }

  // ログインユーザーの所持カード＆ガチャ状態を取得
  async function loadUserData() {
    if (!sb || !session) return;
    const uid = session.user.id;
    try {
      let prof = null;
      for (let i = 0; i < 3 && !prof; i++) {
        const r = await sb
          .from("profiles")
          .select("bonus_pulls,dupe_stock,last_daily_date,display_name,is_admin")
          .eq("id", uid)
          .maybeSingle();
        prof = r.data;
        if (!prof) await new Promise((res) => setTimeout(res, 400)); // 登録直後のトリガー待ち
      }
      const uc = await sb.from("user_cards").select("card_id,count").eq("user_id", uid);
      counts = {};
      (uc.data || []).forEach((row) => {
        counts[row.card_id] = row.count;
      });
      const today = todayStr();
      serverState = {
        bonus_pulls: (prof && prof.bonus_pulls) || 0,
        dupe_stock: (prof && prof.dupe_stock) || 0,
        daily_available: !prof || prof.last_daily_date !== today,
        display_name: (prof && prof.display_name) || (session.user && session.user.email) || "",
        is_admin: !!(prof && prof.is_admin),
      };
    } catch (e) {
      counts = {}; // 失敗しても未所持表示で継続（アプリは壊さない）
    }
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

    // 認証バー（ログイン / ログアウト / 表示名変更）
    if (els.authBar) {
      els.authBar.addEventListener("click", function (e) {
        if (e.target.closest("#loginBtn")) {
          openAuthModal();
        } else if (e.target.closest("#editNameBtn")) {
          openProfileModal();
        } else if (e.target.closest("#logoutBtn") && sb) {
          sb.auth.signOut();
        }
      });
    }

    // モーダル内のフォーム送信（イベント委譲。submitはバブリングする）
    els.modalBody.addEventListener("submit", function (e) {
      if (e.target && e.target.id === "authForm") onAuthSubmit(e);
      if (e.target && e.target.id === "profileForm") onProfileSubmit(e);
      if (e.target && e.target.id === "redeemForm") onRedeemSubmit(e);
    });

    // ガチャ状態パネル内（コード引換の入口）
    if (els.gachaStatus) {
      els.gachaStatus.addEventListener("click", function (e) {
        if (e.target.closest("#redeemEntryBtn")) openRedeemModal();
      });
    }

    // モーダル内のボタン（Googleログイン / シェア）
    els.modalBody.addEventListener("click", function (e) {
      if (e.target.closest("#googleBtn")) {
        onGoogleLogin();
        return;
      }
      const shareBtn = e.target.closest("[data-share-id]");
      if (shareBtn) doShare(shareBtn.getAttribute("data-share-id"));
    });

    // モーダルを閉じる（✕ / 背景）
    els.modal.addEventListener("click", function (e) {
      if (e.target.closest("[data-close]")) closeModal();
    });
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
    checkRedeemParam(); // QRコード（?redeem=CODE）を退避
    renderAuthBar();
    renderStats();
    renderFilters();
    renderGrid();
    renderGachaStatus();
    bindEvents();

    // カタログ同期チェック（DBと表示のカード数がズレたら開発者向けに警告）
    if (sb) {
      sb.from("cards")
        .select("id", { head: true, count: "exact" })
        .then(function (r) {
          if (r && r.count != null && r.count !== baseCards.length) {
            console.warn(
              "[and-card] カード数が不一致: DB=" + r.count + "枚 / 表示=" + baseCards.length +
                "枚 — `node supabase/generate_seed.mjs` → seed_cards.sql を再Runしてください"
            );
          }
        });
    }

    // PWA: Service Worker登録（https or localhostのみ。失敗しても本体は動く）
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("./sw.js").catch(function () {});
    }

    // 認証状態を購読（初回セッション/ログイン/ログアウトで onAuth を呼ぶ）
    // ※ コールバック内で他のSupabase呼び出しをawaitするとデッドロックし得るため、
    //   setTimeout(0) で外に逃がしてから onAuth を実行する。
    // ※ TOKEN_REFRESHED 等「ユーザーが変わらない」イベントでは再描画しない。
    //   （ガチャ通信中にトークン更新が走ると、演出モーダルが閉じて
    //    ログアウトしたように見えるバグの原因だった）
    if (sb) {
      let lastUid; // undefined = 初回未確定
      sb.auth.onAuthStateChange(function (_event, s) {
        const uid = s && s.user ? s.user.id : null;
        if (lastUid !== undefined && uid === lastUid) {
          if (s) session = s; // 新しいトークンだけ差し替え
          return;
        }
        lastUid = uid;
        window.setTimeout(function () {
          onAuth(s);
        }, 0);
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
