
(() => {
  "use strict";

  const POLL_MS = 150;
  const BLANK = "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==";

  const $ = (id) => document.getElementById(id);
  const el = {
    feed: $("feed"), placeholder: $("placeholder"), toggleBtn: $("toggleBtn"),
    badge: $("modeBadge"), status: $("status"), vocab: $("vocab"),
    label: $("label"), confidence: $("confidence"), confBar: $("confBar"),
    words: $("words"), history: $("history"),
    completeBtn: $("completeBtn"), undoBtn: $("undoBtn"), clearBtn: $("clearBtn"),
    clearHistoryBtn: $("clearHistoryBtn"),
    audio: $("audioToggle"), speakMode: $("speakMode"),
    auto: $("autoToggle"), autoLabel: $("autoLabel"),
  };

  let running = false;
  let pollTimer = null;
  let lastWordId = 0;          // newest word already handled (for audio)
  let lastActivity = Date.now();
  let autoSeconds = 4;
  let idleLabel = null;
  let busy = false;
  let shownWords = "";
  let shownHistory = "";
  let openingShown = null;     // last "camera is opening" state applied to the UI
  let dragging = false;        // true while a word chip is being dragged
  let dragFrom = null;         // index of the chip being dragged

  // ---------- helpers ----------
  const setStatus = (t) => (el.status.textContent = t);

  // Every request has a timeout, so the UI can never wait forever
  async function api(path, method = "GET", timeoutMs = 15000) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(path, { method, signal: ctrl.signal });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || res.statusText);
      }
      return await res.json();
    } catch (err) {
      if (err.name === "AbortError") throw new Error("The server did not respond in time.");
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  // Audio plays ONLY when the "Audio translation" box is ticked
  function speak(text) {
    if (!text || !el.audio.checked || !("speechSynthesis" in window)) return;
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = "en-IN";
    window.speechSynthesis.speak(utter);
  }

  function setPlaceholder(title, sub) {
    el.placeholder.querySelector("p").textContent = title;
    el.placeholder.querySelector("small").textContent = sub;
  }

  function setRunningUI(on) {
    el.toggleBtn.textContent = on ? "Stop Translation" : "Start Translation";
    el.toggleBtn.classList.toggle("stop", on);
    el.toggleBtn.disabled = false;
    if (!on) {
      el.placeholder.style.display = "flex";
      el.feed.style.display = "none";
      setPlaceholder("Camera is off", "Click “Start Translation” to begin");
    }
  }

  // while the backend is opening the camera, show a message instead of a black box
  function setOpening(opening) {
    if (opening) {
      el.placeholder.style.display = "flex";
      el.feed.style.display = "none";
      setPlaceholder("Opening camera…", "This can take a few seconds");
      setStatus("Opening camera… please wait.");
    } else {
      el.placeholder.style.display = "none";
      el.feed.style.display = "block";
      setStatus("Translating… the first word appears after about 3 seconds of signing.");
    }
  }

  // ---------- word chips: remove (×) and drag-to-reorder ----------
  function clearDropMarks() {
    el.words.querySelectorAll(".drop-before, .drop-after").forEach((c) =>
      c.classList.remove("drop-before", "drop-after"));
  }

  function endDrag() {
    dragging = false;
    dragFrom = null;
    clearDropMarks();
    el.words.querySelectorAll(".dragging").forEach((c) => c.classList.remove("dragging"));
  }

  // `slot` = gap in the ORIGINAL list where the dragged word is dropped (0..n)
  function dropAt(slot) {
    const from = dragFrom;
    endDrag();
    if (from === null) return;
    let to = slot;
    if (from < to) to -= 1;           // removing the dragged word shifts later words left
    if (to === from) return;
    sentenceAction(`/api/sentence/move?src=${from}&to=${to}`);
  }

  function makeChip(word, index) {
    const chip = document.createElement("span");
    chip.className = "chip";
    chip.draggable = true;

    const text = document.createElement("span");
    text.textContent = word;

    const x = document.createElement("button");
    x.type = "button";
    x.className = "chip-x";
    x.textContent = "×";
    x.title = `Remove "${word}"`;
    x.setAttribute("aria-label", `Remove ${word}`);
    x.addEventListener("click", (e) => {
      e.stopPropagation();
      sentenceAction(`/api/sentence/word/${index}`, "DELETE");
    });

    chip.append(text, x);

    chip.addEventListener("dragstart", (e) => {
      dragging = true;
      dragFrom = index;
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", word); // required by Firefox
      chip.classList.add("dragging");
    });
    chip.addEventListener("dragend", endDrag);
    chip.addEventListener("dragover", (e) => {
      if (!dragging) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      clearDropMarks();
      const r = chip.getBoundingClientRect();
      chip.classList.add(e.clientX < r.left + r.width / 2 ? "drop-before" : "drop-after");
    });
    chip.addEventListener("dragleave", () => chip.classList.remove("drop-before", "drop-after"));
    chip.addEventListener("drop", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const r = chip.getBoundingClientRect();
      dropAt(index + (e.clientX >= r.left + r.width / 2 ? 1 : 0));
    });
    return chip;
  }

  // dropping on empty space in the box moves the word to the end
  el.words.addEventListener("dragover", (e) => { if (dragging) e.preventDefault(); });
  el.words.addEventListener("drop", (e) => {
    e.preventDefault();
    dropAt(el.words.children.length);
  });

  // ---------- rendering ----------
  function renderWords(words) {
    if (dragging) return;             // don't rebuild the chips in the middle of a drag
    const key = words.join("|");
    if (key === shownWords) return;
    shownWords = key;
    el.words.replaceChildren(...words.map((w, i) => makeChip(w, i)));
    el.words.scrollTop = el.words.scrollHeight;
  }

  function renderHistory(sentences) {
    const key = sentences.join("|");
    if (key === shownHistory) return;
    shownHistory = key;
    el.history.replaceChildren(...sentences.map((t) => {
      const li = document.createElement("li");
      li.textContent = t;
      return li;
    }));
    el.history.scrollTop = el.history.scrollHeight;
  }

  function render(s) {
    if (s.running && s.opening !== openingShown) {
      openingShown = s.opening;
      setOpening(s.opening);
    }

    const isIdle = s.label === idleLabel;
    el.label.textContent = !s.running ? "—" : isIdle ? "No sign" : s.label;
    el.confidence.textContent = s.running ? s.confidence.toFixed(2) : "—";
    el.confBar.style.width = s.running ? Math.round(s.confidence * 100) + "%" : "0";
    renderWords(s.words);
    renderHistory(s.sentences);

    // new words since last poll
    const fresh = s.recent_words.filter((w) => w.id > lastWordId);
    if (fresh.length) {
      lastWordId = fresh[fresh.length - 1].id;
      lastActivity = Date.now();
      if (el.speakMode.value === "word") fresh.forEach((w) => speak(w.word));
    }

    // optional: complete the sentence automatically after a pause
    if (running && el.auto.checked && s.words.length && !dragging &&
        Date.now() - lastActivity >= autoSeconds * 1000) {
      completeSentence();
    }
  }

  async function refresh() {
    render(await api("/api/state"));
  }

  async function poll() {
    try {
      const s = await api("/api/state");
      if (!s.running) {
        render(s);
        stopUI(s.error || "Camera stopped.");
        return;
      }
      render(s);
    } catch (err) {
      stopUI("Lost connection to the server.");
    }
  }

  // ---------- sentence actions ----------
  async function completeSentence() {
    if (busy) return;
    busy = true;
    try {
      const r = await api("/api/sentence/complete", "POST");
      if (r.text && el.speakMode.value === "sentence") speak(r.text);
      await refresh();
    } catch (err) { /* ignore */ }
    busy = false;
  }

  async function sentenceAction(path, method = "POST") {
    try { await api(path, method); await refresh(); } catch (err) { /* ignore */ }
  }

  el.completeBtn.addEventListener("click", completeSentence);
  el.undoBtn.addEventListener("click", () => sentenceAction("/api/sentence/undo"));
  el.clearBtn.addEventListener("click", () => sentenceAction("/api/sentence/clear"));
  el.clearHistoryBtn.addEventListener("click", () => sentenceAction("/api/history/clear"));

  document.addEventListener("keydown", (e) => {
    if (!running || ["INPUT", "SELECT", "TEXTAREA"].includes(e.target.tagName)) return;
    if (e.key === "Enter") { e.preventDefault(); completeSentence(); }
    else if (e.key === "Backspace") { e.preventDefault(); sentenceAction("/api/sentence/undo"); }
  });

  el.audio.addEventListener("change", () => {
    if (!el.audio.checked && "speechSynthesis" in window) window.speechSynthesis.cancel();
  });

  // ---------- start / stop ----------
  async function start() {
    el.toggleBtn.disabled = true;
    setStatus("Starting…");
    try {
      await api("/api/start", "POST");          // returns at once; the camera opens in the background
      const s = await api("/api/state");
      lastWordId = s.word_seq;
    } catch (err) {
      setStatus(err.message);
      el.toggleBtn.disabled = false;
      return;
    }
    lastActivity = Date.now();
    openingShown = null;
    el.feed.src = "/video_feed?t=" + Date.now(); // video comes straight from the backend camera
    running = true;
    setRunningUI(true);
    pollTimer = setInterval(poll, POLL_MS);
  }

  function stopUI(message) {
    clearInterval(pollTimer);
    pollTimer = null;
    running = false;
    openingShown = null;
    el.feed.src = BLANK; // closes the video stream
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    setRunningUI(false);
    el.label.textContent = "—";
    el.confidence.textContent = "—";
    el.confBar.style.width = "0";
    setStatus(message);
  }

  async function stop() {
    el.toggleBtn.disabled = true;
    try { await api("/api/stop", "POST"); } catch (err) { /* ignore */ }
    stopUI("Stopped. Your sentence is kept, you can still complete or clear it.");
  }

  el.toggleBtn.addEventListener("click", () => (running ? stop() : start()));

  // Release the camera if the tab is closed
  window.addEventListener("pagehide", () => navigator.sendBeacon("/api/stop"));

  // ---------- initial load ----------
  fetch("/api/status")
    .then((r) => {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    })
    .then((info) => {
      idleLabel = info.idle_label;
      autoSeconds = info.auto_complete_seconds || 4;
      el.autoLabel.textContent = `Auto-complete sentence after a ${autoSeconds}s pause`;
      const acc = info.test_accuracy ? ` · ${(info.test_accuracy * 100).toFixed(1)}% test accuracy` : "";
      el.badge.textContent = `Model loaded · ${info.words.length} words${acc}`;
      el.badge.className = "badge ready";
      el.vocab.textContent = "Words I understand: " + info.words.join(", ");
    })
    .catch((err) => {
      console.error("Could not load model status:", err);
      const offline = err instanceof TypeError && /fetch/i.test(err.message);
      el.badge.textContent = offline ? "Server offline" : `Page error: ${err.message}`;
      el.badge.className = "badge error";
    });

  refresh().catch(() => {});
})();