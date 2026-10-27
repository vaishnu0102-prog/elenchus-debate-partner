/* Shared client: API helper, app shell (sidebar/topbar/search/notifications), small utilities. */
(function () {
  const TOKEN_KEY = "dp-token", USER_KEY = "dp-user";
  const token = localStorage.getItem(TOKEN_KEY);

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmtDate = (d) => new Date(d).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  const initials = (n) => String(n || "?").trim().split(/\s+/).map((p) => p[0]).join("").slice(0, 2).toUpperCase();

  function logoutLocal() { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(USER_KEY); window.location.href = "index.html"; }

  async function api(path, { method = "GET", body, form } = {}) {
    const headers = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    let payload;
    if (form) payload = form; else if (body !== undefined) { headers["Content-Type"] = "application/json"; payload = JSON.stringify(body); }
    let res;
    try { res = await fetch(path, { method, headers, body: payload }); }
    catch (_) { throw new Error("Couldn't reach the server. Is it running?"); }
    if (res.status === 401 && token && !path.startsWith("/api/login")) { logoutLocal(); throw new Error("Session expired."); }
    let data = {};
    try { data = await res.json(); } catch (_) {}
    if (!res.ok) { const e = new Error(data.error || `Request failed (${res.status})`); e.status = res.status; throw e; }
    return data;
  }

  function toast(msg, type = "info") {
    let box = document.getElementById("toasts");
    if (!box) { box = document.createElement("div"); box.id = "toasts"; document.body.appendChild(box); }
    const t = document.createElement("div");
    t.className = `toast ${type}`; t.textContent = msg; box.appendChild(t);
    setTimeout(() => t.classList.add("out"), 3800); setTimeout(() => t.remove(), 4300);
  }

  const ICONS = {
    dashboard: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
    debate: '<circle cx="12" cy="12" r="9"/><path d="M10 8l6 4-6 4V8z"/>',
    feedback: '<path d="M4 4h16v12H7l-3 3V4z"/>',
    topics: '<path d="M4 19V6a2 2 0 012-2h9l5 5v10a2 2 0 01-2 2H6a2 2 0 01-2-2z"/><path d="M14 4v5h5"/>',
    history: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l4 2"/>',
    leaderboard: '<path d="M8 21h8M12 17v4M6 3h12v4a6 6 0 01-12 0V3z"/><path d="M6 5H3v2a4 4 0 004 4M18 5h3v2a4 4 0 01-4 4"/>',
    profile: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>',
    logout: '<path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/>'
  };
  const NAV = [
    ["dashboard", "dashboard.html", "Dashboard"], ["debate", "new.html", "Start Debate"], ["feedback", "feedback.html", "AI Feedback"],
    ["topics", "topics.html", "Topics"], ["history", "history.html", "History"], ["leaderboard", "leaderboard.html", "Leaderboard"], "div",
    ["profile", "profile.html", "Profile"], ["settings", "settings.html", "Settings"], ["logout", "#", "Logout"]
  ];
  const svg = (k) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[k]}</svg>`;

  async function shell(active) {
    if (!token) { window.location.href = "index.html"; return new Promise(() => {}); }
    document.getElementById("sidebar").innerHTML = `
      <div class="brand"><svg class="brand-mark" viewBox="0 0 40 40" fill="none"><path d="M20 4v28" stroke="url(#gs)" stroke-width="2.5" stroke-linecap="round"/><path d="M6 12h12M22 12h12" stroke="url(#gs)" stroke-width="2.5" stroke-linecap="round"/><path d="M6 12l-4 9a6 6 0 0012 0l-4-9" stroke="url(#gs)" stroke-width="2.2" stroke-linejoin="round"/><path d="M34 12l-4 9a6 6 0 0012 0l-4-9" stroke="url(#gs)" stroke-width="2.2" stroke-linejoin="round"/><circle cx="20" cy="34" r="3" fill="url(#gs)"/><defs><linearGradient id="gs" x1="0" y1="0" x2="40" y2="40"><stop offset="0" stop-color="#4CE0D2"/><stop offset="1" stop-color="#8B5CF6"/></linearGradient></defs></svg><span class="brand-name">Debate Partner</span></div>
      <nav class="nav-group">${NAV.map((n) => n === "div" ? '<div class="nav-divider"></div>' :
        `<a href="${n[1]}" class="nav-item${n[0] === active ? " active" : ""}" ${n[0] === "logout" ? 'id="logoutBtn"' : ""}>${svg(n[0])}<span class="nav-label">${n[2]}</span></a>`).join("")}</nav>
      <div class="sidebar-footer"><button id="themeToggle" class="theme-toggle" aria-label="Toggle light and dark theme"><span class="knob">🌙</span></button></div>`;
    document.getElementById("topbar").innerHTML = `
      <div class="topbar">
        <form class="search-box" id="searchForm" role="search"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg><input id="searchInput" type="search" placeholder="Search topics, debates, feedback…" aria-label="Search" maxlength="100" /></form>
        <div class="topbar-actions">
          <div class="notif-wrap"><button class="icon-btn" id="notifBtn" aria-label="Notifications" aria-expanded="false"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 01-3.4 0"/></svg><span class="dot" id="notifDot" style="display:none"></span></button><div class="notif-menu glass" id="notifMenu" hidden></div></div>
          <a class="avatar-chip" href="profile.html"><div class="avatar-circle" id="avatarInitials">—</div><span id="topbarName">…</span></a>
        </div>
      </div>
      <div id="aiBanner" class="banner" hidden></div>`;

    document.getElementById("logoutBtn").addEventListener("click", async (e) => {
      e.preventDefault(); try { await api("/api/logout", { method: "POST" }); } catch (_) {} logoutLocal();
    });
    document.getElementById("searchForm").addEventListener("submit", (e) => {
      e.preventDefault(); const q = document.getElementById("searchInput").value.trim();
      if (q) window.location.href = `search.html?q=${encodeURIComponent(q)}`;
    });
    const cached = JSON.parse(localStorage.getItem(USER_KEY) || "null");
    if (cached) { document.getElementById("avatarInitials").textContent = initials(cached.name); document.getElementById("topbarName").textContent = cached.name; }

    const [me, sys] = await Promise.all([api("/api/me"), fetch("/api/system").then((r) => r.json()).catch(() => ({}))]);
    localStorage.setItem(USER_KEY, JSON.stringify(me.user));
    document.getElementById("avatarInitials").textContent = initials(me.user.name);
    document.getElementById("topbarName").textContent = me.user.name;
    if (sys.demoAi) {
      const b = document.getElementById("aiBanner"); b.hidden = false;
      b.innerHTML = "<strong>Offline demo AI active.</strong> No API key is configured, so the opponent gives scripted replies and scoring is heuristic. Add <code>ANTHROPIC_API_KEY</code> or <code>OPENAI_API_KEY</code> to <code>.env</code> and restart for real debates.";
    }
    setupNotifications();
    return me.user;
  }

  function setupNotifications() {
    const btn = document.getElementById("notifBtn"), menu = document.getElementById("notifMenu"), dot = document.getElementById("notifDot");
    let loaded = false;
    api("/api/notifications").then((d) => {
      const seen = Number(localStorage.getItem("dp-notif-seen") || 0);
      if (d.notifications.some((n) => new Date(n.at).getTime() > seen)) dot.style.display = "block";
      menu._items = d.notifications; loaded = true;
    }).catch(() => {});
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const open = menu.hidden;
      if (open) {
        const items = menu._items || [];
        menu.innerHTML = items.length ? items.map((n) => `<a class="notif-item" href="${esc(n.href)}"><span>${esc(n.text)}</span><small>${fmtDate(n.at)}</small></a>`).join("")
          : '<div class="notif-empty">Nothing yet — finish a debate to see updates here.</div>';
        localStorage.setItem("dp-notif-seen", String(Date.now())); dot.style.display = "none";
      }
      menu.hidden = !open; btn.setAttribute("aria-expanded", String(open));
    });
    document.addEventListener("click", (e) => { if (!menu.contains(e.target)) { menu.hidden = true; btn.setAttribute("aria-expanded", "false"); } });
  }

  window.DP = { api, esc, fmtDate, initials, toast, shell, token, logoutLocal,
    chartColors: () => { const s = getComputedStyle(document.documentElement); const g = (v) => s.getPropertyValue(v).trim();
      return { cyan: g("--accent-cyan"), purple: g("--accent-purple"), muted: g("--text-muted"), border: g("--border-soft"), text: g("--text-secondary") }; },
    rgba: (hex, a) => { hex = hex.replace("#", ""); if (hex.length === 3) hex = hex.split("").map((c) => c + c).join("");
      return `rgba(${parseInt(hex.slice(0, 2), 16)},${parseInt(hex.slice(2, 4), 16)},${parseInt(hex.slice(4, 6), 16)},${a})`; }
  };
})();
