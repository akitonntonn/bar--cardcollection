/* =========================================================================
 * BAR & — 管理者ポータル（admin.html 専用）
 * -------------------------------------------------------------------------
 * できること（すべてサーバ側でis_admin検証済みのRPCを呼ぶだけ）:
 *   - お客さん検索（admin_find_user）→ ガチャ付与 / カード付与 / 来店記録
 *   - QRコード発行（create_redeem_code）＋ QR表示・URLコピー
 *   - 最近の発行コード一覧（admin_list_codes）
 * 権限がないアカウントにはパネル自体を出さない（本丸はサーバ側チェック）。
 * ========================================================================= */
(function () {
  "use strict";

  const cfg = window.AND_CONFIG || {};
  const sb =
    window.supabase && cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY
      ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY)
      : null;
  const cards = Array.isArray(window.AND_CARDS) ? window.AND_CARDS : [];

  const $ = (id) => document.getElementById(id);
  let session = null;
  let currentUser = null; // 検索で見つけたお客さん

  function esc(str) {
    return String(str == null ? "" : str).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  let toastTimer = null;
  function toast(msg) {
    const t = $("toast");
    if (!t) return;
    t.textContent = msg;
    t.hidden = false;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (t.hidden = true), 3200);
  }

  function rpcErr(e) {
    return (e && (e.message || e.error_description)) || "通信エラー";
  }

  /* ------------------------------ 認証 ------------------------------ */
  async function onAuth(s) {
    session = s || null;
    if (!session) {
      $("adminAuth").innerHTML = "";
      $("loginBox").hidden = false;
      $("panel").hidden = true;
      $("adminMsg").textContent = "";
      return;
    }

    const { data: prof } = await sb
      .from("profiles")
      .select("display_name,is_admin")
      .eq("id", session.user.id)
      .maybeSingle();

    $("adminAuth").innerHTML =
      "👤 " +
      esc((prof && prof.display_name) || session.user.email) +
      ' <button type="button" id="logoutBtn" class="authbar__btn">ログアウト</button>';
    const lb = $("logoutBtn");
    if (lb) lb.onclick = () => sb.auth.signOut();

    if (!prof || !prof.is_admin) {
      $("loginBox").hidden = true;
      $("panel").hidden = true;
      $("adminMsg").innerHTML =
        "⛔ このアカウントには管理者権限がありません。<br />" +
        "SupabaseのSQL Editorで supabase/README.md の「自分を管理者にする」を実行してください。";
      return;
    }

    $("adminMsg").textContent = "";
    $("loginBox").hidden = true;
    $("panel").hidden = false;
    listCodes();
  }

  async function onLoginSubmit(e) {
    e.preventDefault();
    const email = ($("loginEmail").value || "").trim();
    const msg = $("loginMsg");
    if (!email) {
      msg.textContent = "メールアドレスを入力してください。";
      return;
    }
    const { error } = await sb.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin + window.location.pathname },
    });
    msg.textContent = error
      ? "送信に失敗しました: " + rpcErr(error)
      : "✅ メールを送りました。届いたリンクを開いてください。";
    msg.classList.toggle("is-ok", !error);
  }

  async function onGoogleLogin() {
    const msg = $("loginMsg");
    try {
      const { error } = await sb.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: window.location.origin + window.location.pathname },
      });
      if (error) throw error;
    } catch (err) {
      msg.textContent = /not enabled|disabled/i.test(rpcErr(err))
        ? "Googleログインは準備中です。メールでログインしてください。"
        : "Googleログインに失敗: " + rpcErr(err);
    }
  }

  /* --------------------------- お客さん検索 --------------------------- */
  async function onSearch(e) {
    e.preventDefault();
    const q = ($("searchEmail").value || "").trim();
    const box = $("userResult");
    if (!q) {
      box.innerHTML = '<div class="user-box">メールアドレスを入力してください。</div>';
      return;
    }
    box.innerHTML = '<div class="user-box">検索中…</div>';
    let res;
    try {
      res = await sb.rpc("admin_find_user", { p_email: q });
    } catch (err) {
      res = { error: err };
    }
    if (res.error) {
      box.innerHTML = '<div class="user-box">エラー: ' + esc(rpcErr(res.error)) + "</div>";
      return;
    }
    if (!res.data || !res.data.ok) {
      box.innerHTML = '<div class="user-box">見つかりませんでした（登録済みか確認してください）。</div>';
      currentUser = null;
      return;
    }
    currentUser = res.data.user;
    renderUser();
  }

  function cardOption(c) {
    return (
      '<option value="' + esc(c.id) + '">' +
      esc("No." + c.no + " " + c.name + (c.variant ? "／" + c.variant : "") + "（" + c.rarity + "）") +
      "</option>"
    );
  }
  function sortedCards(filter) {
    const order = { SSR: 0, SECRET: 1, SR: 2, RARE: 3, NORMAL: 4 };
    return cards
      .filter(filter || (() => true))
      .slice()
      .sort((a, b) => (order[a.rarity] ?? 9) - (order[b.rarity] ?? 9) || a.no.localeCompare(b.no));
  }

  function renderUser() {
    const u = currentUser;
    const ssrOptions = sortedCards((c) => c.rarity === "SSR").map(cardOption).join("");
    const otherOptions = sortedCards((c) => c.rarity !== "SSR").map(cardOption).join("");

    $("userResult").innerHTML =
      '<div class="user-box">' +
      "<div><b>" + esc(u.display_name || "（名前未設定）") + "</b>（" + esc(u.email) + "）" +
      (u.is_admin ? " 🛠管理者" : "") + "</div>" +
      "<div>所持: <b>" + u.owned_kinds + "種 / " + u.total_cards + "枚</b>" +
      " ・ ボーナスガチャ: <b>" + u.bonus_pulls + "回</b>" +
      " ・ 被り貯金: <b>" + u.dupe_stock + " / 3</b></div>" +

      // --- ガチャ回数（お会計サービス連動） ---
      '<div class="act-block">' +
      '<div class="act-title">🎁 ガチャ回数を付与</div>' +
      '<span class="hint">お会計サービスと連動して使う（例：5,000円ご利用→+5回／イベント参加→+1回）。本人の「ボーナスガチャ」に即時追加されます。</span>' +
      '<div class="act-row">' +
      '<input type="number" id="grantN" class="auth-input" value="1" min="1" max="99" aria-label="付与回数" />' +
      '<span style="color:#fff;font-weight:800">回</span>' +
      '<button type="button" class="btn" data-act="pulls">付与する</button>' +
      "</div></div>" +

      // --- 誕生日SSR（オリシャン特典） ---
      '<div class="act-block">' +
      '<div class="act-title">🎂 誕生日SSRを付与</div>' +
      '<span class="hint">誕生日月にオリジナルシャンパンを注文したお客さんへ。提供月：あきと=9月／かける=7・8／しょうま=3月／ゆうた=3/10。</span>' +
      '<div class="act-row">' +
      '<select id="grantSSR" class="auth-input" aria-label="付与するSSR">' + ssrOptions + "</select>" +
      '<button type="button" class="btn" data-act="ssr">SSRを付与</button>' +
      "</div></div>" +

      // --- その他のカード ---
      '<div class="act-block">' +
      '<div class="act-title">🎴 その他のカードを付与</div>' +
      '<span class="hint">イベント景品・特別プレゼントなど自由に使えます（夏限定シークレットもここから配布可能）。</span>' +
      '<div class="act-row">' +
      '<select id="grantCard" class="auth-input" aria-label="付与カード">' + otherOptions + "</select>" +
      '<button type="button" class="btn" data-act="card">付与する</button>' +
      "</div></div>" +

      // --- 来店記録 ---
      '<div class="act-block">' +
      '<div class="act-title">📍 来店を記録</div>' +
      '<span class="hint">来店履歴として保存します（カードや回数は増えません。今後の特典条件・集計用）。</span>' +
      '<div class="act-row">' +
      '<button type="button" class="btn" data-act="visit">今日の来店を記録する</button>' +
      "</div></div>" +
      "</div>";
  }

  async function onUserAction(e) {
    const btn = e.target.closest("[data-act]");
    if (!btn || !currentUser) return;
    const act = btn.getAttribute("data-act");
    btn.disabled = true;
    try {
      if (act === "pulls") {
        const n = parseInt($("grantN").value, 10) || 1;
        const { data, error } = await sb.rpc("grant_pulls", {
          target: currentUser.id,
          amount: n,
          reason: "管理画面から付与",
        });
        if (error) throw error;
        toast("🎁 ガチャ " + (data && data.granted) + " 回を付与しました");
      } else if (act === "ssr") {
        // 誕生日SSR＝来店記念として記録（履歴のsourceが'visit'になる）
        const cardId = $("grantSSR").value;
        const { data, error } = await sb.rpc("grant_card", {
          target: currentUser.id,
          p_card_id: cardId,
          p_source: "visit",
        });
        if (error) throw error;
        toast("🎂 誕生日SSRを付与しました" + (data && data.was_new ? "（NEW!）" : "（被り）"));
      } else if (act === "card") {
        const cardId = $("grantCard").value;
        const { data, error } = await sb.rpc("grant_card", {
          target: currentUser.id,
          p_card_id: cardId,
          p_source: "grant",
        });
        if (error) throw error;
        toast("🎴 カードを付与しました" + (data && data.was_new ? "（NEW!）" : "（被り）"));
      } else if (act === "visit") {
        const { error } = await sb.rpc("record_visit", {
          target: currentUser.id,
          note: "管理画面から記録",
        });
        if (error) throw error;
        toast("📍 来店を記録しました");
      }
      // 数字を最新化
      const res = await sb.rpc("admin_find_user", { p_email: currentUser.email });
      if (res.data && res.data.ok) {
        currentUser = res.data.user;
        renderUser();
      }
    } catch (err) {
      toast("エラー: " + rpcErr(err));
    }
    btn.disabled = false;
  }

  /* --------------------------- QRコード発行 --------------------------- */
  function fillCardSelect() {
    const sel = $("codeCard");
    const pref = { SSR: 0, SECRET: 1, SR: 2, RARE: 3, NORMAL: 4 };
    sel.innerHTML = cards
      .slice()
      .sort((a, b) => (pref[a.rarity] ?? 9) - (pref[b.rarity] ?? 9) || a.no.localeCompare(b.no))
      .map(
        (c) =>
          '<option value="' + esc(c.id) + '">' +
          esc("No." + c.no + " " + c.name + (c.variant ? "／" + c.variant : "") + "（" + c.rarity + "）") +
          "</option>"
      )
      .join("");
  }

  function onKindChange() {
    const isCard = $("codeKind").value === "card";
    $("cardField").hidden = !isCard;
    $("pullsField").hidden = isCard;
  }

  // よく使うパターンをフォームへ自動入力
  function applyPreset(name) {
    if (name === "bday") {
      $("codeKind").value = "card";
      // カード一覧はSSRが先頭に並んでいる（fillCardSelectの並び順）
      $("codeCard").selectedIndex = 0;
      $("codeDays").value = 31;
      $("codeUses").value = 1;
      $("codeNote").value = "誕生日オリシャン特典";
    } else if (name === "visit1") {
      $("codeKind").value = "pulls";
      $("codePulls").value = 1;
      $("codeDays").value = 1; // 当日限り
      $("codeUses").value = 1;
      $("codeNote").value = "来店ありがとうガチャ";
    } else if (name === "spend5") {
      $("codeKind").value = "pulls";
      $("codePulls").value = 5;
      $("codeDays").value = 7;
      $("codeUses").value = 1;
      $("codeNote").value = "5,000円ご利用特典";
    }
    onKindChange();
    toast("フォームに入力しました。内容を確認して「発行」を押してください");
  }

  async function onCodeSubmit(e) {
    e.preventDefault();
    const kind = $("codeKind").value;
    const args = {
      p_kind: kind,
      p_card_id: kind === "card" ? $("codeCard").value : null,
      p_pulls: kind === "pulls" ? parseInt($("codePulls").value, 10) || 1 : null,
      p_expires_days: parseInt($("codeDays").value, 10) || 7,
      p_max_uses: parseInt($("codeUses").value, 10) || 1,
      p_note: ($("codeNote").value || "").trim() || null,
    };
    let res;
    try {
      res = await sb.rpc("create_redeem_code", args);
    } catch (err) {
      res = { error: err };
    }
    if (res.error || !res.data || !res.data.ok) {
      toast("発行エラー: " + rpcErr(res.error));
      return;
    }
    showCode(res.data.code);
    listCodes();
  }

  function showCode(code) {
    const url = window.location.origin + "/?redeem=" + code;
    $("codeResult").innerHTML =
      '<div class="code-box">' +
      '<div class="code">' + esc(code) + "</div>" +
      '<div id="qrBox"></div>' +
      '<div class="url">' + esc(url) + "</div>" +
      '<button type="button" class="btn" id="copyUrlBtn">URLをコピー</button>' +
      "</div>";
    // QR描画（qrcodejs）。ライブラリが読めない環境でもURLは使える。
    try {
      if (window.QRCode) {
        new window.QRCode($("qrBox"), { text: url, width: 180, height: 180 });
      } else {
        $("qrBox").textContent = "QR生成ライブラリを読み込めませんでした";
      }
    } catch (e) {}
    const cp = $("copyUrlBtn");
    if (cp)
      cp.onclick = async () => {
        try {
          await navigator.clipboard.writeText(url);
          toast("URLをコピーしました📋");
        } catch (e) {
          toast("コピーできませんでした");
        }
      };
  }

  async function listCodes() {
    let res;
    try {
      res = await sb.rpc("admin_list_codes");
    } catch (err) {
      res = { error: err };
    }
    const box = $("codeList");
    if (res.error) {
      box.innerHTML = '<p class="admin-msg">一覧の取得に失敗: ' + esc(rpcErr(res.error)) + "</p>";
      return;
    }
    const rows = res.data || [];
    if (!rows.length) {
      box.innerHTML = '<p style="color:rgba(255,255,255,.6);font-size:.8rem">まだ発行されていません。</p>';
      return;
    }
    const nameOf = (id) => {
      const c = cards.find((x) => x.id === id);
      return c ? c.name + (c.variant ? "／" + c.variant : "") : id;
    };
    box.innerHTML =
      '<table class="codes"><tr><th>コード</th><th>内容</th><th>使用</th><th>期限</th><th></th></tr>' +
      rows
        .map((r) => {
          const what =
            r.kind === "card" ? "🎴 " + esc(nameOf(r.card_id)) : "🎁 ガチャ" + r.pulls + "回";
          const exp = r.expires_at ? new Date(r.expires_at).toLocaleDateString("ja-JP") : "なし";
          return (
            '<tr><td class="mono">' + esc(r.code) + "</td><td>" + what +
            (r.note ? "<br /><small>" + esc(r.note) + "</small>" : "") +
            "</td><td>" + r.used_count + "/" + r.max_uses + "</td><td>" + exp +
            '</td><td><button type="button" class="btn" style="padding:4px 8px;font-size:.7rem" data-code="' +
            esc(r.code) + '">QR</button></td></tr>'
          );
        })
        .join("") +
      "</table>";
  }

  /* ------------------------------ 初期化 ------------------------------ */
  function init() {
    if (!sb) {
      $("adminMsg").textContent = "設定エラー：data/config.js を確認してください。";
      return;
    }
    fillCardSelect();
    onKindChange();

    $("loginForm").addEventListener("submit", onLoginSubmit);
    $("googleBtn").addEventListener("click", onGoogleLogin);
    $("searchForm").addEventListener("submit", onSearch);
    $("userResult").addEventListener("click", onUserAction);
    $("codeKind").addEventListener("change", onKindChange);
    $("codeForm").addEventListener("submit", onCodeSubmit);
    $("presetRow").addEventListener("click", (e) => {
      const b = e.target.closest("[data-preset]");
      if (b) applyPreset(b.getAttribute("data-preset"));
    });
    $("codeList").addEventListener("click", (e) => {
      const b = e.target.closest("[data-code]");
      if (b) showCode(b.getAttribute("data-code"));
    });

    sb.auth.onAuthStateChange((_e, s) => setTimeout(() => onAuth(s), 0));
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
