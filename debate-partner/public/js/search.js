(async function () {
  const { api, esc } = DP;
  const content = document.getElementById("content");
  const q = (new URLSearchParams(location.search).get("q") || "").trim();
  try { await DP.shell(""); } catch (e) { content.innerHTML = `<div class="loader">${esc(e.message)}</div>`; return; }
  document.getElementById("searchInput").value = q;
  if (!q) { content.innerHTML = '<div class="page-head"><h1>Search</h1><p>Type something in the search box above.</p></div>'; return; }
  try {
    const r = await api(`/api/search?q=${encodeURIComponent(q)}`);
    const none = !r.topics.length && !r.debates.length && !r.feedback.length;
    content.innerHTML = `<div class="page-head"><h1>Results for “${esc(q)}”</h1></div>${none ? '<div class="panel glass empty-state">Nothing found.</div>' : ""}
    ${r.topics.length ? `<div class="panel glass"><div class="panel-head"><h2>Topics</h2></div><div class="grid topics-grid">${r.topics.map((t) => `<a class="topic-card" href="new.html?topic=${encodeURIComponent(t.title)}"><h4>${esc(t.title)}</h4><div class="topic-meta"><span class="tag">${esc(t.category)}</span><span class="tag diff">${esc(t.difficulty)}</span></div></a>`).join("")}</div></div>` : ""}
    ${r.debates.length ? `<div class="panel glass"><div class="panel-head"><h2>Your debates</h2></div>${r.debates.map((d) => `<a class="resume-item" href="debate.html?id=${d.id}"><span>${esc(d.topic)}</span><span class="tag">${esc(d.result || "In progress")}${d.score ? " · " + d.score : ""}</span></a>`).join("")}</div>` : ""}
    ${r.feedback.length ? `<div class="panel glass"><div class="panel-head"><h2>Feedback</h2></div>${r.feedback.map((d) => `<a class="resume-item" href="debate.html?id=${d.id}"><span>${esc(d.topic)}<br><small class="muted">${esc(d.summary.slice(0, 140))}</small></span></a>`).join("")}</div>` : ""}`;
  } catch (e) { content.innerHTML = `<div class="loader">${esc(e.message)}</div>`; }
})();
