(() => {
  "use strict";

  fetch("/api/status")
    .then((r) => { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
    .then((info) => {
      document.getElementById("sWords").textContent = info.words.length;
      document.getElementById("sAcc").textContent =
        info.test_accuracy ? (info.test_accuracy * 100).toFixed(2) + "%" : "—";

      const box = document.getElementById("homeWords");
      info.words.forEach((w) => {
        const pill = document.createElement("span");
        pill.className = "pill";
        pill.textContent = w;
        box.appendChild(pill);
      });
      if (info.idle_label) {
        const idle = document.createElement("span");
        idle.className = "pill idle";
        idle.textContent = `${info.idle_label} (no sign / resting)`;
        box.appendChild(idle);
      }
    })
    .catch(() => {
      document.getElementById("homeWords").textContent = "Start the server to see the vocabulary.";
    });
})();
