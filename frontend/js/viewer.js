(() => {
  "use strict";

  const token = location.pathname.split("/")[2];
  const base = `/share/${encodeURIComponent(token)}`;
  const viewerId = Math.random().toString(36).slice(2, 10);
  const FRAME_MS = 120;   // about 5-8 frames per second
  const STATE_MS = 300;

  const $ = (id) => document.getElementById(id);
  const el = {
    feed: $("feed"), placeholder: $("placeholder"), waitMsg: $("waitMsg"), badge: $("liveBadge"),
    label: $("label"), confidence: $("confidence"), confBar: $("confBar"),
    words: $("words"), history: $("history"), audio: $("audioToggle"),
  };

  let ended = false;
  let lastWordId = null;
  let prevUrl = null;
  let shownWords = "";
  let shownHistory = "";

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function showWaiting(msg) {
    el.feed.style.display = "none";
    el.placeholder.style.display = "flex";
    el.waitMsg.textContent = msg;
  }

  function showFeed() {
    el.feed.style.display = "block";
    el.placeholder.style.display = "none";
  }

  function setBadge(text, kind) {
    el.badge.textContent = text;
    el.badge.className = "badge " + (kind || "");
  }

  function endSession() {
    ended = true;
    showWaiting("This live session has ended.");
    setBadge("Ended", "error");
  }

  // Plays only when the viewer ticks the box on their own device
  function speak(text) {
    if (!text || !el.audio.checked || !("speechSynthesis" in window)) return;
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = "en-IN";
    window.speechSynthesis.speak(utter);
  }
  el.audio.addEventListener("change", () => {
    if (!el.audio.checked && "speechSynthesis" in window) window.speechSynthesis.cancel();
  });

  function fillList(container, items, make, shownKey) {
    const key = items.join("|");
    if (key === shownKey) return shownKey;
    container.replaceChildren(...items.map(make));
    container.scrollTop = container.scrollHeight;
    return key;
  }

  function render(s) {
    setBadge(s.running ? "● LIVE" : "Presenter's camera is off", s.running ? "ready" : "");
    el.label.textContent = !s.running ? "—" : s.label === s.idle_label ? "No sign" : s.label;
    el.confidence.textContent = s.running ? s.confidence.toFixed(2) : "—";
    el.confBar.style.width = s.running ? Math.round(s.confidence * 100) + "%" : "0";

    shownWords = fillList(el.words, s.words, (w) => {
      const chip = document.createElement("span");
      chip.className = "chip";
      chip.textContent = w;
      return chip;
    }, shownWords);

    shownHistory = fillList(el.history, s.sentences, (t) => {
      const li = document.createElement("li");
      li.textContent = t;
      return li;
    }, shownHistory);

    if (lastWordId === null) lastWordId = s.word_seq;   // don't read out old words on joining
    const fresh = s.recent_words.filter((w) => w.id > lastWordId);
    if (fresh.length) {
      lastWordId = fresh[fresh.length - 1].id;
      fresh.forEach((w) => speak(w.word));
    }
  }

  async function stateLoop() {
    while (!ended) {
      try {
        const res = await fetch(`${base}/state?v=${viewerId}`, { cache: "no-store" });
        if (res.status === 404) { endSession(); return; }
        if (res.ok) render(await res.json());
      } catch (err) {
        setBadge("Reconnecting…");
      }
      await sleep(STATE_MS);
    }
  }

  async function frameLoop() {
    while (!ended) {
      try {
        const res = await fetch(`${base}/frame.jpg?t=${Date.now()}`, { cache: "no-store" });
        if (res.status === 404) { endSession(); return; }
        if (res.status === 200) {
          const url = URL.createObjectURL(await res.blob());
          el.feed.src = url;
          if (prevUrl) URL.revokeObjectURL(prevUrl);
          prevUrl = url;
          showFeed();
        } else {
          showWaiting("Waiting for the presenter to start translation…");
        }
      } catch (err) {
        showWaiting("Reconnecting…");
      }
      await sleep(FRAME_MS);
    }
  }

  stateLoop();
  frameLoop();
})();