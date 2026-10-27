(async function () {
  const { api, esc, fmtDate, initials } = DP;
  const content = document.getElementById("content");
  const template = document.getElementById("dashboardTemplate");
  try {
    await DP.shell("dashboard");
    const data = await api("/api/dashboard");
    render(data);
  } catch (e) {
    content.innerHTML = `<div class="loader">${esc(e.message)}</div>`;
  }

  function render(d) {
    content.innerHTML = "";
    content.appendChild(template.content.cloneNode(true));
    const $ = (id) => document.getElementById(id);
    const first = d.user.name.split(" ")[0];
    $("welcomeName").textContent = first;
    $("profileInitials").textContent = initials(d.user.name);
    $("profileName").textContent = d.user.name;
    $("profileEmail").textContent = d.user.email;

    $("statDebates").textContent = d.stats.debatesCompleted;
    $("statWinRate").textContent = d.stats.debatesCompleted ? `${d.stats.winRate}%` : "—";
    $("statAiScore").textContent = d.stats.aiScore === null ? "—" : d.stats.aiScore;
    $("statHours").textContent = `${d.stats.practiceHours}h`;

    if (d.activeDebates.length) {
      $("activeDebates").innerHTML = `<div class="panel glass resume-panel"><div class="panel-head"><h2>Continue where you left off</h2></div>${d.activeDebates.map((a) =>
        `<a class="resume-item" href="debate.html?id=${a.id}"><span>${esc(a.topic)}</span><span class="btn btn-ghost">Resume →</span></a>`).join("")}</div>`;
    }

    $("debatesTableBody").innerHTML = d.recentDebates.length ? d.recentDebates.map((r) => `
      <tr class="row-link" data-href="debate.html?id=${r.id}"><td>${esc(r.topic)}</td>
      <td><span class="pill pill-${r.result.toLowerCase()}">${esc(r.result)}</span></td><td>${r.score}</td><td>${fmtDate(r.date)}</td></tr>`).join("")
      : `<tr><td colspan="4" class="empty-cell">No completed debates yet. <a href="new.html">Start your first one →</a></td></tr>`;

    $("topicsGrid").innerHTML = d.trendingTopics.map((t) => `
      <a class="topic-card" href="new.html?topic=${encodeURIComponent(t.title)}"><h4>${esc(t.title)}</h4>
      <div class="topic-meta"><span class="tag">${esc(t.category)}</span><span class="tag diff">${esc(t.difficulty)}</span></div></a>`).join("");

    if (d.feedback) {
      $("strengthsList").innerHTML = d.feedback.strengths.map((s) => `<li>${esc(s)}</li>`).join("");
      $("weaknessesList").innerHTML = d.feedback.weaknesses.map((s) => `<li>${esc(s)}</li>`).join("");
      $("confidenceNum").textContent = `${d.feedback.confidence}%`;
      ring("confidenceRing", 22, d.feedback.confidence);
    } else {
      $("strengthsList").innerHTML = '<li class="muted-li">Complete a debate to get AI feedback.</li>';
      $("weaknessesList").innerHTML = '<li class="muted-li">Your areas to improve will appear here.</li>';
      $("confidenceNum").textContent = "—"; ring("confidenceRing", 22, 0);
    }

    $("profilePct").textContent = `${d.level.progressPct}%`;
    document.querySelector(".progress-center .lbl").textContent = `Level ${d.level.level} · ${d.level.xp} XP`;
    ring("profileRing", 46, d.level.progressPct);
    $("badgesList").innerHTML = d.achievements.map((a) => `<span class="badge ${a.unlocked ? "unlocked" : ""}">${a.unlocked ? "🏆 " : "🔒 "}${esc(a.label)}</span>`).join("");

    if (d.performance.length) drawChart(d.performance);
    else $("perfWrap").innerHTML = '<div class="empty-state">Your score trend will appear here after your first completed debate.</div>';

    document.querySelectorAll(".row-link").forEach((tr) => tr.addEventListener("click", () => (window.location.href = tr.dataset.href)));
  }

  function ring(id, radius, pct) {
    const c = 2 * Math.PI * radius, el = document.getElementById(id);
    el.style.strokeDasharray = `${c}`; el.style.strokeDashoffset = `${c * (1 - pct / 100)}`; el.style.transition = "stroke-dashoffset 900ms ease";
  }

  function drawChart(perf) {
    const ctx = document.getElementById("perfChart"), c = DP.chartColors();
    if (typeof Chart === "undefined") { document.getElementById("perfWrap").innerHTML = '<div class="empty-state">Chart library failed to load (check your internet connection).</div>'; return; }
    const g = ctx.getContext("2d").createLinearGradient(0, 0, 0, 180);
    g.addColorStop(0, DP.rgba(c.purple, 0.35)); g.addColorStop(1, DP.rgba(c.purple, 0));
    new Chart(ctx, { type: "line",
      data: { labels: perf.map((p) => p.label), datasets: [{ label: "Debate score", data: perf.map((p) => p.score), borderColor: c.cyan, backgroundColor: g, fill: true, tension: 0.35, pointRadius: 4, pointBackgroundColor: c.purple, pointBorderColor: "#fff", pointBorderWidth: 1.5, borderWidth: 2.5 }] },
      options: { responsive: true, plugins: { legend: { display: false } },
        scales: { x: { grid: { display: false }, ticks: { color: c.muted } }, y: { min: 0, max: 10, grid: { color: c.border }, ticks: { color: c.muted } } } } });
  }
})();
