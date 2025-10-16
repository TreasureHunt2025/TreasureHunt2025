// js/minigame-bridge.js — フルページ遷移用の“戻り”ハンドラ
(function () {
  const params = new URLSearchParams(location.search);
  const uid = params.get("uid");
  const pointId = params.get("point");
  const returnUrl = params.get("return");

  // 既存のゲーム実装が postMessage する想定を再利用（自ページ発火でも拾える）
  window.addEventListener("message", (ev) => {
    const data = ev?.data;
    if (!data || data.type !== "minigame:clear") return;

    try {
      sessionStorage.setItem("minigame_clear", JSON.stringify({
        uid, pointId, ts: Date.now(), detail: data.detail || {}
      }));
    } catch {}

    if (returnUrl) {
      location.replace(returnUrl);
    } else {
      history.length > 1 ? history.back() : (location.href = "/qr.html");
    }
  });

  // 万一、ゲーム側が直接呼びたいときのための関数も用意
  window.notifyMinigameClear = function (detail) {
    try {
      sessionStorage.setItem("minigame_clear", JSON.stringify({
        uid, pointId, ts: Date.now(), detail: detail || {}
      }));
    } catch {}
    if (returnUrl) {
      location.replace(returnUrl);
    } else {
      history.length > 1 ? history.back() : (location.href = "/qr.html");
    }
  };
})();
