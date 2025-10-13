// js/tutorial.js
import { db, requireUidOrRedirect } from "./firebase-init.js";
import { doc, getDoc, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

/* ===== PDF.js 読み込み（CJK対応） ===== */
import * as pdfjs from "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.6.82/build/pdf.min.mjs";
pdfjs.GlobalWorkerOptions.workerSrc = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.6.82/build/pdf.worker.min.mjs";
const CMAP_URL = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.6.82/cmaps/";
const STANDARD_FONT_DATA_URL = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.6.82/standard_fonts/";

/* ---------- 「ゲームを始める」 ---------- */
document.addEventListener("DOMContentLoaded", async () => {
  const uid = await requireUidOrRedirect();
  const startBtn = document.getElementById("startBtn") || document.getElementById("startGameBtn");
  if (!startBtn) return;

  startBtn.addEventListener("click", async () => {
    try {
      const ref = doc(db, "teams", uid);
      const snap = await getDoc(ref);
      if (!snap.exists()) throw new Error("参加情報が見つかりません");
      if (!snap.data().startTime) await updateDoc(ref, { startTime: serverTimestamp() });
      location.href = `map.html?uid=${encodeURIComponent(uid)}`;
    } catch (e) {
      console.error(e);
      alert("スタート処理でエラーが発生しました。");
    }
  });
});

/* ---------- PDFを縦に“幅フィット”で並べる ---------- */
document.addEventListener("DOMContentLoaded", () => {
  const slides = document.getElementById("slides") || (() => {
    const el = document.createElement("div");
    el.id = "slides";
    document.body.appendChild(el);
    return el;
  })();

  const PDF_URL = window.TUTORIAL_PDF_URL || "./宝探し受付用資料.pdf";

  const paintPage = async (page, wrap) => {
    const base = page.getViewport({ scale: 1 });

    // コンテナの実効幅（padding除外）
    const s = getComputedStyle(wrap);
    const padX = parseFloat(s.paddingLeft) + parseFloat(s.paddingRight);
    const cssW = Math.max(0, wrap.clientWidth - padX);

    const ratio = window.devicePixelRatio || 1;
    const scale = (cssW * ratio) / base.width; // 幅基準でスケール
    const vp = page.getViewport({ scale });

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { alpha: false });
    canvas.width = Math.floor(vp.width);
    canvas.height = Math.floor(vp.height);
    canvas.style.width = (vp.width / ratio) + "px";
    canvas.style.height = (vp.height / ratio) + "px";
    canvas.style.display = "block";

    await page.render({ canvasContext: ctx, viewport: vp, intent: "display" }).promise;
    wrap.replaceChildren(canvas);
  };

  let pdf = null;
  let holders = [];

  const renderAll = async () => {
    if (!pdf) {
      pdf = await pdfjs.getDocument({
        url: PDF_URL,
        cMapUrl: CMAP_URL,
        cMapPacked: true,
        standardFontDataUrl: STANDARD_FONT_DATA_URL,
        useSystemFonts: true
      }).promise;

      const pageCount = pdf.numPages;
      holders = [];
      slides.innerHTML = "";
      for (let i = 1; i <= pageCount; i++) {
        const sec = document.createElement("section");
        sec.className = "slide";
        const card = document.createElement("div");
        card.className = "slide-card";
        const badge = document.createElement("div");
        badge.className = "page-badge";
        badge.setAttribute("aria-label", `ページ ${i} / ${pageCount}`);
        badge.textContent = `${i} / ${pageCount}`;
        sec.append(badge, card);
        slides.appendChild(sec);
        holders.push(card);
      }
    }

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      await paintPage(page, holders[i - 1]);
    }
  };

  renderAll().catch(err => console.error("[tutorial] PDF読み込みに失敗:", err));

  // 端末回転やリサイズで再描画（軽くデバウンス）
  let timer = null;
  window.addEventListener("resize", () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      for (let i = 1; i <= (pdf?.numPages || 0); i++) {
        const page = await pdf.getPage(i);
        await paintPage(page, holders[i - 1]);
      }
    }, 180);
  }, { passive: true });
});
