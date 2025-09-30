// ページ内の適切な要素に自動で .tutorial を付与
(function(){
  const el =
    document.getElementById("tutorial") ||
    document.querySelector("[data-role='tutorial']") ||
    document.querySelector("main") ||
    document.querySelector(".content, .container, article, section");
  if (el) el.classList.add("tutorial");
})();
