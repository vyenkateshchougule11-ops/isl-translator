(() => {
  "use strict";

  const page = document.body.dataset.page || "";
  const links = [
    ["home", "/", "Home"],
    ["translate", "/static/translate.html", "Translator"],
    ["stats", "/static/stats.html", "Statistics"],
    ["about", "/static/about.html", "How it works"],
  ];

  const header = document.getElementById("site-header");
  if (header) {
    header.className = "topbar";
    header.innerHTML = `
      <a class="brand" href="/">
        <span class="logo">🤟</span>
        <div><h1>ISL Translator</h1><p>Indian Sign Language to text &amp; speech</p></div>
      </a>
      <nav class="nav">
        ${links.map(([key, href, label]) =>
          `<a href="${href}" class="${key === page ? "active" : ""}">${label}</a>`).join("")}
      </nav>
      <span id="modeBadge" class="badge">Loading…</span>`;
  }

  const footer = document.getElementById("site-footer");
  if (footer) {
    footer.className = "page-footer";
    footer.innerHTML = "ISL Translator · built with MediaPipe, TensorFlow and FastAPI";
  }

  // The Translator page fills the badge itself (app.js); other pages do it here.
  if (page !== "translate") {
    const badge = document.getElementById("modeBadge");
    fetch("/api/status")
      .then((r) => { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then((info) => {
        const acc = info.test_accuracy ? ` · ${(info.test_accuracy * 100).toFixed(1)}% test accuracy` : "";
        badge.textContent = `Model loaded · ${info.words.length} words${acc}`;
        badge.className = "badge ready";
      })
      .catch(() => {
        badge.textContent = "Server offline";
        badge.className = "badge error";
      });
  }
})();
