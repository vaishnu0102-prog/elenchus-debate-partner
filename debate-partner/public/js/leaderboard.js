(async function () {
  const { api, esc } = DP;
  const content = document.getElementById("content");
  try { await DP.shell("leaderboard"); const r = await api("/api/leaderboard");
    const medal = (n) => (n === 1 ? "🥇" : n === 2 ? "🥈" : n === 3 ? "🥉" : n);
    content.innerHTML = `<div class="page-head"><h1>Leaderboard</h1><p>Ranked by average AI score across completed debates. Names are shortened for privacy.</p></div>
    ${r.you ? `<div class="panel glass you-card">You're ranked <b>#${r.you.rank}</b> with an average of <b>${r.you.avgScore}</b> over ${r.you.debates} debate${r.you.debates > 1 ? "s" : ""}.</div>` : '<div class="panel glass you-card">Complete a debate to appear on the leaderboard.</div>'}
    <div class="panel glass"><div class="table-scroll"><table><thead><tr><th>#</th><th>Debater</th><th>Avg score</th><th>Wins</th><th>Debates</th></tr></thead><tbody>
    ${r.leaderboard.length ? r.leaderboard.map((b) => `<tr class="${b.you ? "me-row" : ""}"><td>${medal(b.rank)}</td><td>${esc(b.name)}${b.you ? " (you)" : ""}</td><td>${b.avgScore}</td><td>${b.wins}</td><td>${b.debates}</td></tr>`).join("") : '<tr><td colspan="5" class="empty-cell">No ranked debaters yet — be the first.</td></tr>'}
    </tbody></table></div></div>`;
  } catch (e) { content.innerHTML = `<div class="loader">${esc(e.message)}</div>`; }
})();
