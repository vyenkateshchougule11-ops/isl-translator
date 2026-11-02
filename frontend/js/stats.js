(() => {
  "use strict";

  // Built-in description of the deployed model (always shown)
  const ARCH = [
    ["Input", "60 frames × 258 features", "(60, 258)", 0],
    ["LSTM 1", "64 units, return sequences", "(60, 64)", 82688],
    ["Dropout 1", "rate 0.30", "(60, 64)", 0],
    ["LSTM 2", "128 units, return sequences", "(60, 128)", 98816],
    ["Dropout 2", "rate 0.30", "(60, 128)", 0],
    ["LSTM 3", "64 units", "(64)", 49408],
    ["Dropout 3", "rate 0.30", "(64)", 0],
    ["Dense 1", "64 units, ReLU", "(64)", 4160],
    ["Dense 2", "32 units, ReLU", "(32)", 2080],
    ["Output", "8 units, softmax", "(8)", 264],
  ];
  const TOTAL_PARAMS = ARCH.reduce((a, r) => a + r[3], 0);

  const EXPORT_CODE = [
  "# ===== Export model statistics for the web app's Statistics page =====",
  "# Add this as a NEW cell at the end of your training notebook and run it once.",
  "# It only READS your data and model. Nothing in the notebook is changed.",
  "import json",
  "from datetime import datetime",
  "from pathlib import Path",
  "import numpy as np",
  "from sklearn.model_selection import train_test_split",
  "from sklearn.metrics import confusion_matrix, classification_report",
  "from tensorflow.keras.models import load_model",
  "",
  "PROJECT = Path(r\"E:\\NewCompleteISL\")                       # <-- your project folder",
  "MODEL_FILE = PROJECT / \"models\" / \"isl_12_word_lstm.h5\"",
  "META_FILE  = PROJECT / \"models\" / \"isl_12_word_metadata.json\"",
  "OUT_FILE   = PROJECT / \"frontend\" / \"data\" / \"model_stats.json\"",
  "",
  "model = load_model(MODEL_FILE)",
  "meta = json.loads(META_FILE.read_text(encoding=\"utf-8\"))",
  "",
  "X, y_idx, actions = load_dataset_for_vocab()               # same loader as training",
  "if list(actions) != list(meta[\"actions\"]):",
  "    raise RuntimeError(\"The words in this notebook do not match the model's \"",
  "                       \"metadata. Use the data this model was trained on.\")",
  "",
  "# Same split as training: 80 / 20, random_state = 42, stratified",
  "X_train, X_test, y_train, y_test = train_test_split(",
  "    X, y_idx, test_size=0.20, random_state=42, stratify=y_idx)",
  "",
  "pred = np.argmax(model.predict(X_test, verbose=0), axis=1)",
  "labels = np.arange(len(actions))",
  "cm = confusion_matrix(y_test, pred, labels=labels)",
  "report = classification_report(y_test, pred, labels=labels, target_names=actions,",
  "                               output_dict=True, zero_division=0)",
  "",
  "def counts(y):",
  "    c = np.bincount(y, minlength=len(actions))",
  "    return {a: int(c[i]) for i, a in enumerate(actions)}",
  "",
  "stats = {",
  "    \"generated_at\": datetime.now().isoformat(timespec=\"seconds\"),",
  "    \"classes\": list(actions),",
  "    \"idle_label\": meta.get(\"idle_label\"),",
  "    \"accuracy\": float((pred == y_test).mean()),",
  "    \"confusion_matrix\": cm.tolist(),",
  "    \"report\": {k: ({m: float(v) for m, v in d.items()} if isinstance(d, dict) else float(d))",
  "               for k, d in report.items()},",
  "    \"class_counts\": {\"total\": counts(y_idx), \"train\": counts(y_train), \"test\": counts(y_test)},",
  "}",
  "",
  "# Training curves are included if this notebook session still holds the",
  "# `history` returned by:   model, history, acc = train_on_all_data()",
  "try:",
  "    h = history.history",
  "    stats[\"history\"] = {k: [float(v) for v in h[k]]",
  "                        for k in (\"accuracy\", \"val_accuracy\", \"loss\", \"val_loss\") if k in h}",
  "except NameError:",
  "    print(\"No training history in this session, so the curves are skipped.\")",
  "",
  "OUT_FILE.parent.mkdir(parents=True, exist_ok=True)",
  "OUT_FILE.write_text(json.dumps(stats, indent=2), encoding=\"utf-8\")",
  "print(\"Saved:\", OUT_FILE)",
  "print(\"Test accuracy:\", round(stats[\"accuracy\"], 4))"
];

  const C = { teal: "#0fa68a", blue: "#3b82f6", amber: "#f5a623", coral: "#f2705e", grid: "#e3efea", axis: "#5d7a81" };

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmt = (n) => Number(n).toLocaleString("en-US");
  const pct = (v, d = 2) => (v * 100).toFixed(d) + "%";

  async function getJSON(url) {
    try {
      const r = await fetch(url, { cache: "no-store" });
      return r.ok ? await r.json() : null;
    } catch (e) { return null; }
  }

  function empty(el, what) {
    el.innerHTML = `<div class="empty-state"><div class="big">📊</div><b>${esc(what)} not generated yet</b>
      Run the statistics cell described <a href="#how">at the bottom of this page</a> to fill this in.</div>`;
  }

  // Try a screenshot saved by the user; fall back to the empty state
  function imageOrEmpty(el, url, what) {
    const img = new Image();
    img.alt = what;
    img.style.cssText = "width:100%;border-radius:12px;border:1px solid var(--border)";
    img.onload = () => { el.innerHTML = ""; el.appendChild(img); };
    img.onerror = () => empty(el, what);
    img.src = url + "?t=" + Date.now();
  }

  // ---------------- KPI cards ----------------
  function renderKPIs(status, acc) {
    const words = status ? status.words.length : "—";
    const classes = status ? status.words.length + (status.idle_label ? 1 : 0) : "—";
    const items = [
      ["🎯", acc != null ? pct(acc) : "—", "Test accuracy"],
      ["🗣️", words, "Words understood"],
      ["🧩", classes, "Classes (incl. rest)"],
      ["⚙️", fmt(TOTAL_PARAMS), "Trainable parameters"],
    ];
    $("kpis").innerHTML = items.map(([icon, val, label]) =>
      `<div class="card kpi"><div class="icon">${icon}</div><div><b>${esc(val)}</b><span>${esc(label)}</span></div></div>`).join("");
  }

  // ---------------- accuracy ring ----------------
  function renderAccuracy(acc, stats) {
    const box = $("accuracyBox");
    if (acc == null) { empty(box, "Accuracy"); return; }
    const R = 70, CIRC = 2 * Math.PI * R;
    let detail = "Measured on held-out test recordings that were never used for training.";
    if (stats && stats.confusion_matrix) {
      const cm = stats.confusion_matrix;
      const total = cm.flat().reduce((a, b) => a + b, 0);
      const ok = cm.reduce((a, row, i) => a + row[i], 0);
      detail = `<b>${ok} of ${total}</b> test recordings were classified correctly (${total - ok} wrong). ` + detail;
    }
    box.className = "ring-wrap";
    box.innerHTML = `
      <div class="ring">
        <svg width="170" height="170" viewBox="0 0 170 170">
          <defs><linearGradient id="rg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="#14b8a0"/><stop offset="1" stop-color="#3b82f6"/></linearGradient></defs>
          <circle cx="85" cy="85" r="${R}" fill="none" stroke="#e3efea" stroke-width="14"/>
          <circle cx="85" cy="85" r="${R}" fill="none" stroke="url(#rg)" stroke-width="14" stroke-linecap="round"
                  stroke-dasharray="${(CIRC * acc).toFixed(1)} ${CIRC.toFixed(1)}"/>
        </svg>
        <div class="ring-label"><div><b>${pct(acc)}</b><span>test accuracy</span></div></div>
      </div>
      <p class="muted" style="flex:1;min-width:200px;font-size:14px">${detail}</p>`;
  }

  // ---------------- vocabulary ----------------
  function renderVocab(status) {
    const box = $("vocabChips");
    if (!status) { box.textContent = "Start the server to see the vocabulary."; return; }
    box.innerHTML = status.words.map((w) => `<span class="pill">${esc(w)}</span>`).join("") +
      (status.idle_label ? `<span class="pill idle">${esc(status.idle_label)} (no sign)</span>` : "");
  }

  // ---------------- per-class bar chart ----------------
  function renderBars(stats) {
    const body = $("barsBody");
    if (!stats || !stats.report || !stats.classes) { empty(body, "Per-word metrics"); return; }
    const classes = stats.classes, rep = stats.report;
    const metrics = [["precision", "Precision", C.teal], ["recall", "Recall", C.blue], ["f1-score", "F1-score", C.amber]];
    const W = 820, H = 320, L = 46, Rm = 14, T = 12, B = 54;
    const pw = W - L - Rm, ph = H - T - B;
    const gw = pw / classes.length;
    const bw = Math.min(26, (gw - 14) / 3);
    let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Per-word precision, recall and F1">`;
    for (let i = 0; i <= 4; i++) {
      const y = T + ph - (ph * i) / 4;
      svg += `<line x1="${L}" x2="${W - Rm}" y1="${y}" y2="${y}" stroke="${C.grid}"/>
              <text x="${L - 8}" y="${y + 4}" font-size="11" fill="${C.axis}" text-anchor="end">${(i / 4).toFixed(2)}</text>`;
    }
    classes.forEach((cl, gi) => {
      const gx = L + gi * gw + (gw - bw * 3) / 2;
      metrics.forEach(([key, label, color], mi) => {
        const r = rep[cl] || {};
        const v = Number(r[key] ?? r[key === "f1-score" ? "f1" : key] ?? 0);
        const h = ph * Math.max(0, Math.min(1, v));
        const x = gx + mi * bw;
        svg += `<rect x="${x.toFixed(1)}" y="${(T + ph - h).toFixed(1)}" width="${(bw - 2).toFixed(1)}" height="${h.toFixed(1)}" rx="4" fill="${color}">
                  <title>${esc(cl)} · ${label}: ${v.toFixed(2)}</title></rect>`;
      });
      svg += `<text x="${L + gi * gw + gw / 2}" y="${H - B + 20}" font-size="12" fill="#17323a" text-anchor="middle">${esc(cl)}</text>`;
    });
    svg += "</svg>";
    const mac = rep["macro avg"];
    const summary = mac ? `<p class="hint muted" style="margin-top:8px">Macro average: precision ${Number(mac.precision).toFixed(2)} · recall ${Number(mac.recall).toFixed(2)} · F1 ${Number(mac["f1-score"] ?? mac.f1).toFixed(2)}</p>` : "";
    body.innerHTML = `<div class="legend-inline">${metrics.map(([, l, c]) => `<span><i style="background:${c}"></i>${l}</span>`).join("")}</div>
      <div class="chart">${svg}</div>${summary}`;
  }

  // ---------------- confusion matrix heat map ----------------
  function renderCM(stats) {
    const body = $("cmBody");
    if (!stats || !stats.confusion_matrix || !stats.classes) {
      imageOrEmpty(body, "/static/data/confusion_matrix.png", "Confusion matrix");
      return;
    }
    const cm = stats.confusion_matrix, cls = stats.classes;
    const draw = (mode) => {
      let html = `<table class="heat cm"><thead><tr><th></th>${cls.map((c) => `<th class="colh">${esc(c)}</th>`).join("")}</tr></thead><tbody>`;
      cm.forEach((row, i) => {
        const total = row.reduce((a, b) => a + b, 0) || 1;
        html += `<tr><th class="rowh">${esc(cls[i])}</th>`;
        row.forEach((v, j) => {
          const share = v / total;
          let bg, color = "#17323a";
          if (v === 0) { bg = "#f4f8f6"; color = "#9bb2b8"; }
          else if (i === j) { bg = `rgba(15,166,138,${0.18 + 0.82 * share})`; if (share > 0.6) color = "#fff"; }
          else { bg = `rgba(242,112,94,${0.35 + 0.65 * Math.min(1, share * 2)})`; color = "#fff"; }
          const label = mode === "pct" ? Math.round(share * 100) + "%" : v;
          html += `<td style="background:${bg};color:${color}" title="True ${esc(cls[i])} → predicted ${esc(cls[j])}: ${v} (${Math.round(share * 100)}% of row)">${label}</td>`;
        });
        html += "</tr>";
      });
      html += "</tbody></table>";
      $("cmTable").innerHTML = html;
    };
    body.innerHTML = `
      <div class="toggle"><button id="cmCount" class="on">Counts</button><button id="cmPct">Row %</button></div>
      <div class="chart" id="cmTable"></div>
      <p class="axis-note">Rows: true word · Columns: predicted word</p>
      <div class="legend-inline" style="justify-content:center;margin:6px 0 0">
        <span><i style="background:rgba(15,166,138,.8)"></i>Correct (diagonal)</span>
        <span><i style="background:rgba(242,112,94,.85)"></i>Mistake</span></div>`;
    draw("count");
    $("cmCount").onclick = () => { $("cmCount").className = "on"; $("cmPct").className = ""; draw("count"); };
    $("cmPct").onclick = () => { $("cmPct").className = "on"; $("cmCount").className = ""; draw("pct"); };
  }

  // ---------------- per-word metrics heat map ----------------
  function renderHeat(stats) {
    const body = $("heatBody");
    if (!stats || !stats.report || !stats.classes) { empty(body, "Per-word metrics"); return; }
    const rep = stats.report;
    const colour = (v) => {
      const t = Math.max(0, Math.min(1, (v - 0.6) / 0.4));
      return `hsl(${Math.round(25 + t * 135)}, ${Math.round(65 + t * 10)}%, ${Math.round(86 - t * 8)}%)`;
    };
    let html = `<table class="heat"><thead><tr><th></th><th>Precision</th><th>Recall</th><th>F1</th><th>Support</th></tr></thead><tbody>`;
    stats.classes.forEach((c) => {
      const r = rep[c] || {};
      const vals = [Number(r.precision ?? 0), Number(r.recall ?? 0), Number(r["f1-score"] ?? r.f1 ?? 0)];
      html += `<tr><th class="rowh">${esc(c)}</th>` +
        vals.map((v) => `<td style="background:${colour(v)}" title="${esc(c)}: ${v.toFixed(2)}">${v.toFixed(2)}</td>`).join("") +
        `<td style="background:#f4f8f6;color:#5d7a81">${r.support ?? ""}</td></tr>`;
    });
    html += "</tbody></table>";
    body.innerHTML = `<div class="chart">${html}</div>
      <div class="scale-bar" style="background:linear-gradient(90deg,hsl(25,65%,86%),hsl(95,70%,82%),hsl(160,75%,78%))"></div>
      <p class="axis-note">0.60 or lower → 1.00</p>`;
  }

  // ---------------- training curves ----------------
  function lineChart(series, opts) {
    const W = 520, H = 280, L = 46, Rm = 14, T = 12, B = 40;
    const pw = W - L - Rm, ph = H - T - B;
    const n = Math.max(...series.map((s) => s.values.length));
    const all = series.flatMap((s) => s.values);
    let lo = opts.min ?? Math.min(...all), hi = opts.max ?? Math.max(...all);
    if (hi - lo < 1e-9) { hi = lo + 1; }
    const X = (i) => L + (n <= 1 ? 0 : (pw * i) / (n - 1));
    const Y = (v) => T + ph - (ph * (v - lo)) / (hi - lo);
    let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(opts.label)}">`;
    for (let i = 0; i <= 4; i++) {
      const v = lo + ((hi - lo) * i) / 4, y = Y(v);
      svg += `<line x1="${L}" x2="${W - Rm}" y1="${y}" y2="${y}" stroke="${C.grid}"/>
              <text x="${L - 8}" y="${y + 4}" font-size="11" fill="${C.axis}" text-anchor="end">${v.toFixed(opts.dec ?? 2)}</text>`;
    }
    const step = Math.max(1, Math.ceil(n / 8));
    for (let i = 0; i < n; i += step) {
      svg += `<text x="${X(i)}" y="${H - B + 18}" font-size="11" fill="${C.axis}" text-anchor="middle">${i + 1}</text>`;
    }
    svg += `<text x="${L + pw / 2}" y="${H - 6}" font-size="11" fill="${C.axis}" text-anchor="middle">Epoch</text>`;
    series.forEach((s) => {
      const d = s.values.map((v, i) => `${i ? "L" : "M"}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(" ");
      svg += `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>`;
    });
    svg += "</svg>";
    const legend = `<div class="legend-inline">${series.map((s) => `<span><i style="background:${s.color}"></i>${s.name}</span>`).join("")}</div>`;
    return legend + `<div class="chart">${svg}</div><p class="hint muted">Training ran for ${n} epochs.</p>`;
  }

  function renderCurves(stats) {
    const h = stats && stats.history;
    if (h && h.accuracy && h.val_accuracy) {
      $("accBody").innerHTML = lineChart([
        { name: "Training", color: C.teal, values: h.accuracy },
        { name: "Validation", color: C.blue, values: h.val_accuracy },
      ], { label: "Training accuracy", min: Math.min(0.5, ...h.accuracy, ...h.val_accuracy), max: 1 });
    } else imageOrEmpty($("accBody"), "/static/data/accuracy_curve.png", "Accuracy curve");

    if (h && h.loss && h.val_loss) {
      $("lossBody").innerHTML = lineChart([
        { name: "Training", color: C.coral, values: h.loss },
        { name: "Validation", color: C.amber, values: h.val_loss },
      ], { label: "Training loss", min: 0 });
    } else imageOrEmpty($("lossBody"), "/static/data/loss_curve.png", "Loss curve");
  }

  // ---------------- dataset composition ----------------
  function renderData(stats) {
    const body = $("dataBody");
    const cc = stats && stats.class_counts;
    if (!cc || !cc.train || !cc.test) { empty(body, "Dataset counts"); return; }
    const cls = stats.classes;
    const max = Math.max(...cls.map((c) => (cc.train[c] || 0) + (cc.test[c] || 0)), 1);
    body.innerHTML = `<div class="legend-inline"><span><i style="background:${C.teal}"></i>Training</span><span><i style="background:${C.blue}"></i>Test</span></div>` +
      cls.map((c) => {
        const tr = cc.train[c] || 0, te = cc.test[c] || 0;
        return `<div style="display:flex;align-items:center;gap:12px;margin:8px 0">
          <div style="width:96px;font-size:13px">${esc(c)}</div>
          <div style="flex:1;display:flex;height:22px;border-radius:8px;overflow:hidden;background:#eef4f2">
            <div style="width:${(tr / max) * 100}%;background:${C.teal}" title="${esc(c)} training: ${tr}"></div>
            <div style="width:${(te / max) * 100}%;background:${C.blue}" title="${esc(c)} test: ${te}"></div></div>
          <div class="muted" style="width:92px;font-size:12px;text-align:right">${tr} + ${te}</div></div>`;
      }).join("");
  }

  // ---------------- architecture table ----------------
  function renderArch() {
    $("archTable").innerHTML = `<thead><tr><th>Layer</th><th>Configuration</th><th>Output shape</th><th style="text-align:right">Parameters</th></tr></thead><tbody>` +
      ARCH.map((r) => `<tr><td><b>${esc(r[0])}</b></td><td>${esc(r[1])}</td><td>${esc(r[2])}</td><td class="num">${fmt(r[3])}</td></tr>`).join("") +
      `<tr><td><b>Total</b></td><td></td><td></td><td class="num"><b>${fmt(TOTAL_PARAMS)}</b></td></tr></tbody>`;
  }

  // ---------------- export helper ----------------
  function renderHow() {
    const code = EXPORT_CODE.join("\n");
    $("exportCode").textContent = code;
    $("copyCode").onclick = async () => {
      try { await navigator.clipboard.writeText(code); $("copyNote").textContent = "Copied ✓"; }
      catch (e) { $("copyNote").textContent = "Select the code and copy it with Ctrl+C."; }
      setTimeout(() => ($("copyNote").textContent = ""), 2500);
    };
  }

  // ---------------- start ----------------
  Promise.all([getJSON("/api/status"), getJSON("/static/data/model_stats.json")]).then(([status, stats]) => {
    const acc = status && status.test_accuracy != null ? status.test_accuracy : (stats ? stats.accuracy : null);
    renderKPIs(status, acc);
    renderAccuracy(acc, stats);
    renderVocab(status);
    renderBars(stats);
    renderCM(stats);
    renderHeat(stats);
    renderCurves(stats);
    renderData(stats);
    renderArch();
    renderHow();

    const badge = $("dataBadge");
    if (stats) {
      const when = stats.generated_at ? " · " + stats.generated_at.replace("T", " ") : "";
      badge.textContent = "Detailed statistics loaded" + when;
      badge.className = "badge ready";
    } else {
      badge.textContent = "Showing model metadata · detailed charts need the statistics file (see bottom of page)";
      badge.className = "badge demo";
    }
  });
})();
