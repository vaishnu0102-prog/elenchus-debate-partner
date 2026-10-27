(async function () {
  const { api, esc, fmtDate } = DP;
  const content = document.getElementById("content");
  try { await DP.shell("feedback"); const f = await api("/api/feedback"); render(f); } catch (e) { content.innerHTML = `<div class="loader">${esc(e.message)}</div>`; }
  function render(f) {
    if (!f.evaluations.length) { content.innerHTML = `<div class="page-head"><h1>AI feedback</h1></div><div class="panel glass empty-state">No evaluations yet. Finish a debate and the AI judge's detailed feedback will appear here.<br><br><a class="btn btn-primary" href="new.html">Start a debate</a></div>`; return; }
    content.innerHTML = `<div class="page-head"><h1>AI feedback</h1><p>Your skill profile across scored debates, and the judge's notes on each.</p></div>
    <div class="grid content-grid"><div class="panel glass"><div class="panel-head"><h2>Skill profile (average, 0–10)</h2></div>${f.averages ? '<canvas id="radar" height="260"></canvas>' : '<div class="empty-state">Not enough AI-judged debates yet.</div>'}</div>
    <div>${f.evaluations.map((x) => `<a class="panel glass eval-card" href="debate.html?id=${x.debateId}">
      <div class="panel-head"><h2>${esc(x.topic)}</h2><span class="pill pill-${x.result.toLowerCase()}">${esc(x.result)} · ${x.overall}</span></div>
      <p class="muted">${esc(x.summary)}</p>
      <div class="two-col small"><ul class="mini good">${x.strengths.slice(0, 2).map((s) => `<li>${esc(s)}</li>`).join("")}</ul><ul class="mini bad">${x.weaknesses.slice(0, 2).map((s) => `<li>${esc(s)}</li>`).join("")}</ul></div>
      <small class="muted">${fmtDate(x.date)}${x.degraded ? " · fallback estimate" : ""}</small></a>`).join("")}</div></div>`;
    if (f.averages && typeof Chart !== "undefined") {
      const c = DP.chartColors(), a = f.averages;
      new Chart(document.getElementById("radar"), { type: "radar",
        data: { labels: ["Argument", "Evidence", "Rebuttal", "Clarity", "Structure"], datasets: [{ data: [a.argumentStrength, a.evidence, a.rebuttal, a.clarity, a.structure], borderColor: c.cyan, backgroundColor: DP.rgba(c.purple, 0.3), pointBackgroundColor: c.purple }] },
        options: { plugins: { legend: { display: false } }, scales: { r: { min: 0, max: 10, ticks: { stepSize: 2, color: c.muted, backdropColor: "transparent" }, grid: { color: c.border }, angleLines: { color: c.border }, pointLabels: { color: c.text } } } } });
    }
  }
})();
