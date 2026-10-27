(async function () {
  const { api, esc, toast } = DP;
  const content = document.getElementById("content");
  let me, topics = [], docs = [];
  try { me = await DP.shell("debate"); } catch (e) { content.innerHTML = `<div class="loader">${esc(e.message)}</div>`; return; }

  const params = new URLSearchParams(location.search);
  content.innerHTML = `
  <div class="page-head"><h1>Start a debate</h1><p>Choose from 160 evergreen student-friendly motions, pick your side, and debate by voice with your AI opponent.</p></div>
  <div id="resume"></div>
  <form class="panel glass form-panel" id="setupForm" novalidate>
    <div id="formMsg" class="form-msg"></div>
    <div class="field"><label for="topic">Motion / topic</label>
      <div class="field-input"><input id="topic" maxlength="300" placeholder="Choose a topic below or enter your own motion…" required /></div></div>
    <section class="topic-library" aria-labelledby="topicLibraryTitle">
      <div class="topic-library-head">
        <div><h2 id="topicLibraryTitle">Explore debate topics</h2><p>Search and select a motion. Your choice will be used when you start the debate.</p></div>
        <span class="topic-count" id="topicCount">Loading topics…</span>
      </div>
      <div class="topic-library-filters">
        <div class="field-input topic-search"><span aria-hidden="true">⌕</span><input id="topicSearch" type="search" maxlength="100" placeholder="Search all 160 topics…" aria-label="Search debate topics" /></div>
        <div class="field-input"><select id="topicCategory" aria-label="Filter by category"><option value="">All categories</option></select></div>
        <div class="field-input"><select id="topicDifficulty" aria-label="Filter by difficulty"><option value="">All levels</option><option value="Easy">Beginner</option><option value="Medium">Intermediate</option><option value="Hard">Advanced</option></select></div>
      </div>
      <div class="topic-library-grid" id="topicLibraryGrid" aria-live="polite"></div>
      <div class="topic-library-empty" id="topicEmpty" hidden>No topics match your search. Try another keyword or category.</div>
    </section>
    <div class="form-row">
      <div class="field"><label>Your side</label>
        <div class="seg" id="sideSeg"><button type="button" data-v="for" class="on">For</button><button type="button" data-v="against">Against</button></div></div>
      <div class="field"><label for="difficulty">Opponent difficulty</label>
        <div class="field-input"><select id="difficulty"><option value="easy">Easy — gentle opponent</option><option value="medium">Medium — capable</option><option value="hard">Hard — ruthless expert</option></select></div></div>
      <div class="field"><label for="turns">Your turns</label>
        <div class="field-input"><select id="turns">${[1,2,3,4,5,6,8,10].map((n) => `<option value="${n}">${n} turn${n > 1 ? "s" : ""}</option>`).join("")}</select></div></div>
    </div>
    <div class="field"><label for="docSel">Reference document (optional)</label>
      <div class="doc-row"><div class="field-input"><select id="docSel"><option value="">None</option></select></div>
      <label class="btn btn-ghost upload-btn">Upload .txt / .md / .pdf<input type="file" id="docFile" accept=".txt,.md,.pdf" hidden /></label></div>
      <small class="hint">The AI treats the document as source material (up to ~12,000 characters are used). Max 5 MB.</small></div>
    <button class="btn btn-primary" id="startBtn" type="submit">Start debate</button>
  </form>`;

  const $ = (id) => document.getElementById(id);
  const msg = (t, type = "error") => { $("formMsg").textContent = t; $("formMsg").className = `form-msg show ${type}`; };
  let side = "for";
  $("difficulty").value = me.defaultDifficulty; $("turns").value = String(me.defaultTurns);
  if (![...$("turns").options].some((o) => o.value === String(me.defaultTurns))) $("turns").value = "4";
  if (params.get("topic")) $("topic").value = params.get("topic").slice(0, 300);

  $("sideSeg").addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return;
    side = b.dataset.v; [...$("sideSeg").children].forEach((x) => x.classList.toggle("on", x === b)); });

  const loadDocs = async (select) => {
    docs = (await api("/api/documents")).documents;
    $("docSel").innerHTML = '<option value="">None</option>' + docs.map((d) => `<option value="${d.id}">${esc(d.filename)} (${Math.round(d.chars / 100) / 10}k chars)</option>`).join("");
    if (select) $("docSel").value = String(select);
  };

  function renderTopicLibrary() {
    const q = $("topicSearch").value.trim().toLowerCase();
    const category = $("topicCategory").value;
    const difficulty = $("topicDifficulty").value;
    const selected = $("topic").value.trim();
    const filtered = topics.filter((t) => (!q || t.title.toLowerCase().includes(q)) && (!category || t.category === category) && (!difficulty || t.difficulty === difficulty));
    $("topicCount").textContent = `${filtered.length} of ${topics.length} topics`;
    $("topicEmpty").hidden = filtered.length > 0;
    $("topicLibraryGrid").innerHTML = filtered.map((t) => {
      const isSelected = selected.toLowerCase() === t.title.toLowerCase();
      const level = t.difficulty === "Easy" ? "Beginner" : t.difficulty === "Medium" ? "Intermediate" : "Advanced";
      return `<button type="button" class="topic-option${isSelected ? " selected" : ""}" data-topic-id="${t.id}" aria-pressed="${isSelected}">
        <span class="topic-option-title">${esc(t.title)}</span>
        <span class="topic-option-meta"><span class="tag">${esc(t.category)}</span><span class="tag diff">${level}</span>${t.trending ? '<span class="tag hot">Featured</span>' : ""}</span>
      </button>`;
    }).join("");
  }

  try {
    const [t, d, list] = await Promise.all([api("/api/topics"), loadDocs(), api("/api/debates?status=active&pageSize=5")]);
    topics = t.topics;
    const categories = [...new Set(topics.map((x) => x.category))].sort((a,b) => a.localeCompare(b));
    $("topicCategory").innerHTML = '<option value="">All categories</option>' + categories.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join("");
    renderTopicLibrary();
    if (list.debates.length) $("resume").innerHTML = `<div class="panel glass resume-panel"><div class="panel-head"><h2>Unfinished debates</h2></div>${list.debates.map((a) =>
      `<a class="resume-item" href="debate.html?id=${a.id}"><span>${esc(a.topic)} <small>· ${a.userTurns}/${a.maxTurns} turns</small></span><span class="btn btn-ghost">Resume →</span></a>`).join("")}</div>`;
  } catch (e) { msg(e.message); }

  $("topicSearch").addEventListener("input", renderTopicLibrary);
  $("topicCategory").addEventListener("change", renderTopicLibrary);
  $("topicDifficulty").addEventListener("change", renderTopicLibrary);
  $("topicLibraryGrid").addEventListener("click", (e) => {
    const card = e.target.closest(".topic-option"); if (!card) return;
    const picked = topics.find((t) => String(t.id) === card.dataset.topicId); if (!picked) return;
    $("topic").value = picked.title;
    renderTopicLibrary();
    $("formMsg").className = "form-msg";
  });
  $("topic").addEventListener("input", () => { if (topics.length) renderTopicLibrary(); });

  $("docFile").addEventListener("change", async () => {
    const f = $("docFile").files[0]; if (!f) return;
    const fd = new FormData(); fd.append("file", f);
    try { toast("Uploading…"); const r = await api("/api/documents", { method: "POST", form: fd }); await loadDocs(r.document.id); toast(`Added ${r.document.filename}`, "success"); }
    catch (e) { toast(e.message, "error"); }
    $("docFile").value = "";
  });

  $("setupForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const topic = $("topic").value.trim();
    if (topic.length < 8) return msg("Choose a topic from the library or enter a motion of at least 8 characters.");
    $("startBtn").disabled = true; $("startBtn").textContent = "Starting…";
    try {
      const r = await api("/api/debates", { method: "POST", body: { topic, side, difficulty: $("difficulty").value, maxTurns: Number($("turns").value), documentId: $("docSel").value ? Number($("docSel").value) : null } });
      window.location.href = `debate.html?id=${r.debate.id}`;
    } catch (err) { msg(err.message); $("startBtn").disabled = false; $("startBtn").textContent = "Start debate"; }
  });
})();
