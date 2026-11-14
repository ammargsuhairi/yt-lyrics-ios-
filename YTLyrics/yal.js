(() => {
  const isMusic = location.hostname === "music.youtube.com";
  let currentKey = "";
  let lines = null; // [{b, e, text, words:[{b,e,text,bg,el}] | null, el}]
  let activeIdx = -1;
  let panel, listEl, headEl, toast, toastTimer;

  /* ---------- UI ---------- */
  function buildUI() {
    if (panel) return;
    panel = document.createElement("div");
    panel.id = "yal-panel";
    panel.innerHTML = `
      <div id="yal-head"><span id="yal-title"></span>
        <button id="yal-close" title="Sembunyikan">×</button></div>
      <div id="yal-list"></div>`;
    document.body.appendChild(panel);
    headEl = panel.querySelector("#yal-title");
    listEl = panel.querySelector("#yal-list");
    panel.querySelector("#yal-close").onclick = () => (panel.style.display = "none");
    toast = document.createElement("div");
    toast.id = "yal-toast";
    document.body.appendChild(toast);
  }

  function say(msg, keep) {
    buildUI();
    toast.textContent = msg;
    toast.style.opacity = "1";
    clearTimeout(toastTimer);
    if (!keep) toastTimer = setTimeout(() => (toast.style.opacity = "0"), 2500);
  }

  function hidePanel() {
    if (panel) panel.style.display = "none";
  }

  /* ---------- Metadata lagu ---------- */
  function clean(s) {
    return (s || "")
      .replace(/\([^)]*\)|\[[^\]]*\]|【[^】]*】/g, " ")
      .replace(/\b(official|lyrics?|lirik|video|audio|music video|mv|hd|4k|visualizer)\b/gi, " ")
      .replace(/\s+(feat\.?|ft\.?)\s.*$/i, "")
      .replace(/\s{2,}/g, " ")
      .trim();
  }

  function getMeta() {
    let title = "", artist = "";
    const ms = navigator.mediaSession && navigator.mediaSession.metadata;
    if (ms && ms.title) {
      let t = ms.title;
      let a = (ms.artist || "").replace(/\s*-\s*Topic$/i, "").replace(/VEVO$/i, "").trim();
      const m = t.split(/\s[-–|]\s/);
      if (m.length >= 2) { a = m[0]; t = m.slice(1).join(" "); }
      return { title: clean(t), artist: clean(a) };
    }
    if (isMusic) {
      title = document.querySelector("ytmusic-player-bar .title")?.textContent || "";
      const by = document.querySelector("ytmusic-player-bar .byline")?.textContent || "";
      artist = by.split("•")[0].trim();
    } else {
      title =
        document.querySelector("h1.ytd-watch-metadata yt-formatted-string")?.textContent ||
        document.title.replace(/ - YouTube$/, "");
      artist = (document.querySelector("#owner ytd-channel-name a")?.textContent || "")
        .replace(/\s*-\s*Topic$/i, "")
        .replace(/VEVO$/i, "")
        .trim();
      const m = title.split(/\s[-–|]\s/);
      if (m.length >= 2) {
        artist = clean(m[0]);
        title = m.slice(1).join(" ");
      }
    }
    return { title: clean(title), artist: clean(artist) };
  }

  /* ---------- Parser LRC (per baris) ---------- */
  function parseLRC(lrc) {
    const out = [];
    for (const raw of lrc.split("\n")) {
      const stamps = [...raw.matchAll(/\[(\d+):(\d+(?:\.\d+)?)\]/g)];
      if (!stamps.length) continue;
      const text = raw.replace(/\[[^\]]*\]/g, "").trim();
      for (const s of stamps) out.push({ b: +s[1] * 60 + +s[2], text, words: null });
    }
    out.sort((a, b) => a.b - b.b);
    out.forEach((l, i) => (l.e = out[i + 1] ? out[i + 1].b : l.b + 5));
    return out;
  }

  /* ---------- Parser TTML (per kata / suku kata) ---------- */
  function parseTime(s) {
    if (!s) return NaN;
    s = s.trim();
    if (s.endsWith("ms")) return parseFloat(s) / 1000;
    if (s.endsWith("s")) return parseFloat(s);
    let t = 0;
    for (const x of s.split(":")) t = t * 60 + parseFloat(x);
    return t;
  }

  function parseTTML(xml) {
    const doc = new DOMParser().parseFromString(xml, "application/xml");
    if (doc.querySelector("parsererror")) return null;
    const out = [];
    doc.querySelectorAll("p").forEach(p => {
      const words = [];
      let untimed = false;
      const walk = (node, bg) => {
        node.childNodes.forEach(n => {
          if (n.nodeType === 3) {
            const tx = n.textContent.replace(/\s+/g, " ");
            if (!tx.trim()) {
              if (words.length) words[words.length - 1].text += " ";
            } else untimed = true;
          } else if (n.nodeType === 1) {
            const role = n.getAttribute("ttm:role") || n.getAttribute("role");
            const isBg = bg || role === "x-bg";
            const b = n.getAttribute("begin"), e = n.getAttribute("end");
            const hasKids = [...n.children].length > 0;
            if (b && !hasKids) {
              words.push({ b: parseTime(b), e: parseTime(e), text: n.textContent.replace(/\s+/g, " "), bg: isBg });
            } else walk(n, isBg);
          }
        });
      };
      walk(p, false);

      const text = p.textContent.replace(/\s+/g, " ").trim();
      if (!text) return;
      const pb = parseTime(p.getAttribute("begin"));
      const pe = parseTime(p.getAttribute("end"));
      const timed = !untimed && words.length && words.every(w => isFinite(w.b) && isFinite(w.e));
      const b = isFinite(pb) ? pb : timed ? words[0].b : NaN;
      const e = isFinite(pe) ? pe : timed ? words[words.length - 1].e : NaN;
      if (!isFinite(b)) return;
      out.push({ b, e: isFinite(e) ? e : b + 4, text, words: timed ? words : null });
    });
    out.sort((a, b) => a.b - b.b);
    return out.length ? out : null;
  }

  /* ---------- Render ---------- */
  function render(L, head) {
    buildUI();
    headEl.textContent = head;
    listEl.innerHTML = "";
    activeIdx = -1;
    lines = L;
    L.forEach(l => {
      const d = document.createElement("div");
      d.className = "yal-line";
      if (l.words) {
        l.words.forEach(w => {
          const s = document.createElement("span");
          s.className = "yal-w" + (w.bg ? " yal-bg" : "");
          s.textContent = w.text;
          w.el = s;
          d.appendChild(s);
        });
      } else d.textContent = l.text || "♪";
      d.onclick = () => {
        const v = document.querySelector("video");
        if (v) v.currentTime = l.b;
      };
      l.el = d;
      listEl.appendChild(d);
    });
    panel.style.display = "flex";
  }

  function renderPlain(text, head) {
    buildUI();
    headEl.textContent = head;
    listEl.innerHTML = "";
    lines = null;
    const d = document.createElement("div");
    d.className = "yal-plain";
    d.textContent = text;
    listEl.appendChild(d);
    panel.style.display = "flex";
  }

  /* ---------- Sinkron (per frame) ---------- */
  function frame() {
    requestAnimationFrame(frame);
    if (!lines || !panel || panel.style.display === "none") return;
    const v = document.querySelector("video");
    if (!v) return;
    const t = v.currentTime + 0.1;

    let idx = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].b <= t) idx = i;
      else break;
    }
    if (idx !== activeIdx) {
      if (lines[activeIdx]) lines[activeIdx].el.classList.remove("active");
      if (lines[idx]) {
        lines[idx].el.classList.add("active");
        lines[idx].el.scrollIntoView({ block: "center", behavior: "smooth" });
      }
      activeIdx = idx;
    }
    const cur = lines[idx];
    if (cur && cur.words) {
      for (const w of cur.words) {
        const p = Math.min(1, Math.max(0, (t - w.b) / Math.max(0.05, w.e - w.b)));
        w.el.style.setProperty("--p", p.toFixed(3));
      }
    }
  }

  /* ---------- Deteksi lagu diputar ---------- */
  function ttmlLooksRight(L, duration) {
    const last = L[L.length - 1].e;
    return last <= duration + 15 && last >= duration * 0.5;
  }

  function apply(res, duration) {
    // 1) TTML per kata jika ada dan durasinya masuk akal
    if (res.better) {
      const L = parseTTML(res.better.ttml);
      if (L && ttmlLooksRight(L, duration)) {
        const per = L.some(l => l.words) ? "per kata" : "per baris";
        render(L, `${res.better.title} · ${res.better.artist} · BetterLyrics (${per})`);
        return true;
      }
    }
    // 2) fallback LRCLIB
    const r = res.lrclib;
    if (r) {
      const head = `${r.title} · ${r.artist} · LRCLIB`;
      if (r.synced) render(parseLRC(r.synced), head);
      else renderPlain(r.plain, head);
      return true;
    }
    return false;
  }

  function check() {
    const v = document.querySelector("video");
    if (!v || v.paused || !isFinite(v.duration) || v.duration < 30) return;
    const { title, artist } = getMeta();
    if (!title) return;
    const key = `${artist}|${title}|${Math.round(v.duration)}`;
    if (key === currentKey) return;
    currentKey = key;
    lines = null;
    hidePanel();
    say("Mencari lirik…", true);

    chrome.runtime.sendMessage(
      { type: "findLyrics", title, artist, duration: v.duration },
      resp => {
        if (key !== currentKey) return;
        if (chrome.runtime.lastError || !resp || !resp.ok) return say("Gagal mengambil lirik");
        if (!apply(resp.result, v.duration)) return say("Lirik tidak ditemukan");
        say("Lirik ditemukan");
      }
    );
  }

  setInterval(check, 1500);
  requestAnimationFrame(frame);
  document.addEventListener("yt-navigate-finish", () => (currentKey = ""));
})();
