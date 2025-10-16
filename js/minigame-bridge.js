(() => {
  const STORAGE_KEY = "minigame_clear";

  function saveClear(pointId, payload) {
    const data = { pointId, clearedAt: Date.now(), ...(payload ? { payload } : {}) };
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch { }
    // 参考通知（親/同一ページが拾いたい場合）
    try { window.parent?.postMessage({ type: "minigame:clear", detail: data }, "*"); } catch { }
    try { window.dispatchEvent(new CustomEvent("minigame:clear", { detail: data })); } catch { }
    return data;
  }

  function resolveReturnUrl(pointId, returnUrl) {
    if (returnUrl) return returnUrl;
    const p = (typeof location !== "undefined") ? location.pathname : "";
    if (/\/game[1-6]\b/i.test(p)) return `../qr.html?key=${encodeURIComponent(pointId)}`;
    if (/qr\.html$/i.test(p) || /\/$/.test(p)) return `./qr.html?key=${encodeURIComponent(pointId)}`;
    const parts = p.split("/").filter(Boolean);
    if (parts.length >= 1) {
      const root = "/" + parts[0]; // 例: /TreasureHunt2025
      return `${root}/qr.html?key=${encodeURIComponent(pointId)}`;
    }
    return `/qr.html?key=${encodeURIComponent(pointId)}`;
  }

  /**
   * クリア時に呼ぶ
   * @param {string} pointId - "qr1"〜"qr6"
   * @param {object} [options]
   *   - delayMs: 戻るまでの遅延ms（既定 5000）
   *   - returnUrl: 明示URL（通常不要）
   *   - payload: スコア等の任意情報
   *   - replace: trueで history 置換（既定 true）
   */
  function completeAndReturn(pointId, options = {}) {
    const {
      delayMs = 5000, // ★ 既定で5秒待機
      returnUrl,
      payload,
      replace = true
    } = options;

    saveClear(pointId, payload);
    const url = resolveReturnUrl(pointId, returnUrl);

    const go = () => {
      try {
        if (replace) location.replace(url);
        else location.href = url;
      } catch { location.assign(url); }
    };

    setTimeout(go, Math.max(0, delayMs | 0));
  }

  // 失敗時はこのブリッジを呼ばない設計（＝ゲーム内でそのままリトライ）。
  // どうしても使いたい場合だけ:
  function failAndReturn(pointId, options = {}) {
    const { delayMs = 0, returnUrl, replace = true } = options;
    const url = resolveReturnUrl(pointId, returnUrl);
    const go = () => {
      try { replace ? location.replace(url) : location.href = url; }
      catch { location.assign(url); }
    };
    setTimeout(go, Math.max(0, delayMs | 0));
  }

  window.completeAndReturn = completeAndReturn;
  window.failAndReturn = failAndReturn; // 基本未使用
})();
