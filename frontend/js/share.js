(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const el = {
    btn: $("shareBtn"), panel: $("sharePanel"), link: $("shareLink"),
    copy: $("copyBtn"), wa: $("waBtn"), sms: $("smsBtn"),
    viewers: $("viewers"), stop: $("stopShareBtn"), status: $("status"),
  };
  let timer = null;

  async function api(path, method = "GET") {
    const res = await fetch(path, { method });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.detail || res.statusText);
    }
    return res.json();
  }

  function showActive(info) {
    el.btn.style.display = "none";
    el.panel.hidden = false;
    el.link.value = info.link;
    const msg = encodeURIComponent("Watch my live Indian Sign Language translation: " + info.link);
    el.wa.href = "https://wa.me/?text=" + msg;
    el.sms.href = "sms:?&body=" + msg;
    el.viewers.textContent = info.viewers ? `👁 ${info.viewers} watching` : "No viewers yet";
    if (!timer) timer = setInterval(refresh, 3000);
  }

  function showIdle() {
    el.btn.style.display = "";
    el.btn.disabled = false;
    el.btn.textContent = "🔗 Share live view";
    el.panel.hidden = true;
    clearInterval(timer);
    timer = null;
  }

  async function refresh() {
    try {
      const info = await api("/api/share");
      info.active ? showActive(info) : showIdle();
    } catch (err) { /* ignore */ }
  }

  el.btn.addEventListener("click", async () => {
    el.btn.disabled = true;
    el.btn.textContent = "Creating link… (up to 40 s)";
    try {
      showActive(await api("/api/share/start", "POST"));
      el.status.textContent = "Link ready. If it doesn't open straight away, wait 10–20 seconds and retry.";
    } catch (err) {
      el.status.textContent = err.message;
      showIdle();
    }
  });

  el.copy.addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(el.link.value); }
    catch (err) { el.link.select(); document.execCommand("copy"); }
    el.copy.textContent = "Copied ✓";
    setTimeout(() => (el.copy.textContent = "Copy"), 1500);
  });

  el.stop.addEventListener("click", async () => {
    try { await api("/api/share/stop", "POST"); } catch (err) { /* ignore */ }
    showIdle();
  });

  refresh(); // restore the panel if the server is still sharing after a page reload
})();