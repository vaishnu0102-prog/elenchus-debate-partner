(async function () {
  const { api, esc } = DP;
  const content = document.getElementById("content");
  try { await DP.shell("topics"); } catch (e) { content.innerHTML = `<div class="loader">${esc(e.message)}</div>`; return; }
  content.innerHTML = `<div class="page-head"><h1>Topics</h1><p>Pick a motion to debate, or type your own on the start page.</p></div>
  <div class="panel glass"><div class="filters"><div class="field-input grow"><input id="q" type="search" placeholder="Search topics…" maxlength="100"/></div>
  <div class="field-input"><select id="cat"><option value="">All categories</option></select></div>
  <div class="field-input"><select id="diff"><option value="">Any difficulty</option><option>Easy</option><option>Medium</option><option>Hard</option></select></div></div>
  <div class="grid topics-grid" id="grid"></div></div>`;
  const $ = (i) => document.getElementById(i); let catsLoaded = false;
  async function load() {
    const p = new URLSearchParams(); if ($("q").value.trim()) p.set("q", $("q").value.trim()); if ($("cat").value) p.set("category", $("cat").value); if ($("diff").value) p.set("difficulty", $("diff").value);
    try {
      const r = await api(`/api/topics?${p}`);
      if (!catsLoaded) { $("cat").innerHTML += r.categories.map((c) => `<option>${esc(c)}</option>`).join(""); catsLoaded = true; }
      $("grid").innerHTML = r.topics.length ? r.topics.map((t) => `<a class="topic-card" href="new.html?topic=${encodeURIComponent(t.title)}"><h4>${esc(t.title)}</h4><div class="topic-meta"><span class="tag">${esc(t.category)}</span><span class="tag diff">${esc(t.difficulty)}</span>${t.trending ? '<span class="tag hot">🔥 Trending</span>' : ""}</div></a>`).join("") : '<div class="empty-state">No topics match.</div>';
    } catch (e) { DP.toast(e.message, "error"); }
  }
  let t; $("q").addEventListener("input", () => { clearTimeout(t); t = setTimeout(load, 250); });
  $("cat").addEventListener("change", load); $("diff").addEventListener("change", load); load();
})();
