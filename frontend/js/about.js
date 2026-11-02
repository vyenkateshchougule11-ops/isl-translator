(() => {
  "use strict";

  const EMOJI = {
    hello: "👋", please: "🙏", food: "🍽️", water: "💧",
    "thank you": "🙌", yes: "✅", no: "❌",
  };

  fetch("/api/status")
    .then((r) => { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
    .then((info) => {
      const box = document.getElementById("wordCards");
      const add = (label, emoji, note) => {
        const card = document.createElement("div");
        card.className = "card word-card";
        card.innerHTML = `<div class="emoji">${emoji}</div><b></b><span class="muted" style="font-size:12px"></span>`;
        card.querySelector("b").textContent = label;
        card.querySelector("span").textContent = note || "";
        box.appendChild(card);
      };
      info.words.forEach((w) => add(w, EMOJI[w.toLowerCase()] || "✋", "Sign word"));
      if (info.idle_label) add(info.idle_label, "🫳", "Resting hands, never added");
    })
    .catch(() => {
      document.getElementById("wordCards").textContent = "Start the server to see the vocabulary.";
    });
})();
