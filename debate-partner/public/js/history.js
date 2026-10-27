(async function () {
  const { api, esc, fmtDate, toast } = DP;
  const content = document.getElementById("content");
  try { await DP.shell("history"); } catch (e) { content.innerHTML = `<div class="loader">${esc(e.message)}</div>`; return; }
  content.innerHTML = `<div class="page-head"><h1>Debate history</h1><p>Every debate you've started, with results.</p></div>
  <div class="panel glass"><div class="filters"><div class="field-input grow"><input id="q" type="search" placeholder="Filter by topic…" maxlength="100"/></div>
    <div class="field-input"><select id="status"><option value="">All</option><option value="completed">Completed</option><option value="active">In progress</option></select></div></div>
    <div class="table-scroll"><table><thead><tr><th>Topic</th><th>Side</th><th>Status</th><th>Score</th><th>Date</th><th></th></tr></thead><tbody id="rows"></tbody></table></div>
    <div class="pager"><button class="btn btn-ghost" id="prev">← Prev</button><span id="pageInfo"></span><button class="btn btn-ghost" id="next">Next →</button></div></div>`;
  const $ = (i) => document.getElementById(i);
  let page = 1, total = 0; const size = 15;
  $("q").value = new URLSearchParams(location.search).get("q") || "";
  async function load() {
    try {
      const p = new URLSearchParams({ page, pageSize: size }); if ($("q").value.trim()) p.set("q", $("q").value.trim()); if ($("status").value) p.set("status", $("status").value);
      const r = await api(`/api/debates?${p}`); total = r.total;
      $("rows").innerHTML = r.debates.length ? r.debates.map((x) => `<tr class="row-link" data-id="${x.id}">
        <td>${esc(x.topic)}</td><td>${x.userSide === "for" ? "For" : "Against"}</td>
        <td>${x.status === "completed" ? `<span class="pill pill-${x.result.toLowerCase()}">${esc(x.result)}</span>` : `<span class="pill pill-active">In progress ${x.userTurns}/${x.maxTurns}</span>`}</td>
        <td>${x.score ?? "—"}</td><td>${fmtDate(x.endedAt || x.startedAt)}</td>
        <td><button class="btn btn-ghost small del" data-id="${x.id}" aria-label="Delete debate">Delete</button></td></tr>`).join("")
        : `<tr><td colspan="6" class="empty-cell">No debates found. <a href="new.html">Start one →</a></td></tr>`;
      const pages = Math.max(1, Math.ceil(total / size));
      $("pageInfo").textContent = `Page ${page} of ${pages} · ${total} total`; $("prev").disabled = page <= 1; $("next").disabled = page >= pages;
    } catch (e) { toast(e.message, "error"); }
  }
  let t; $("q").addEventListener("input", () => { clearTimeout(t); t = setTimeout(() => { page = 1; load(); }, 250); });
  $("status").addEventListener("change", () => { page = 1; load(); });
  $("prev").addEventListener("click", () => { page--; load(); }); $("next").addEventListener("click", () => { page++; load(); });
  $("rows").addEventListener("click", async (e) => {
    const del = e.target.closest(".del");
    if (del) { e.stopPropagation(); if (!confirm("Delete this debate permanently? This affects your stats.")) return;
      try { await api(`/api/debates/${del.dataset.id}`, { method: "DELETE" }); toast("Debate deleted", "success"); load(); } catch (err) { toast(err.message, "error"); } return; }
    const tr = e.target.closest("tr[data-id]"); if (tr) location.href = `debate.html?id=${tr.dataset.id}`;
  });
  load();
})();
