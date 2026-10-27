(async function () {
  const { api, esc, fmtDate, initials, toast } = DP;
  const content = document.getElementById("content");
  try {
    const user = await DP.shell("profile"); const d = await api("/api/dashboard");
    content.innerHTML = `<div class="page-head"><h1>Profile</h1></div>
    <div class="grid content-grid"><div class="panel glass profile-main">
      <div class="profile-top"><div class="avatar-circle big">${esc(initials(user.name))}</div><div><h2>${esc(user.name)}</h2><div class="muted">${esc(user.email)} · member since ${fmtDate(user.createdAt)}</div></div></div>
      <form id="pf" novalidate><div id="msg" class="form-msg"></div>
      <div class="field"><label for="name">Display name</label><div class="field-input"><input id="name" maxlength="80" value="${esc(user.name)}"/></div></div>
      <div class="field"><label for="bio">Bio</label><div class="field-input"><textarea id="bio" rows="3" maxlength="300" placeholder="Tell other debaters about yourself">${esc(user.bio)}</textarea></div></div>
      <button class="btn btn-primary" type="submit">Save profile</button></form></div>
    <div class="panel glass"><div class="panel-head"><h2>Your stats</h2></div>
      <div class="kv"><span>Level</span><b>${d.level.level}</b></div><div class="kv"><span>XP</span><b>${d.level.xp}</b></div>
      <div class="kv"><span>Debates completed</span><b>${d.stats.debatesCompleted}</b></div><div class="kv"><span>Win rate</span><b>${d.stats.debatesCompleted ? d.stats.winRate + "%" : "—"}</b></div>
      <div class="kv"><span>Average score</span><b>${d.stats.aiScore ?? "—"}</b></div><div class="kv"><span>Current streak</span><b>${d.stats.streak} day${d.stats.streak === 1 ? "" : "s"}</b></div>
      <div class="kv"><span>Practice time</span><b>${d.stats.practiceHours}h</b></div>
      <div class="badges left">${d.achievements.map((a) => `<span class="badge ${a.unlocked ? "unlocked" : ""}">${a.unlocked ? "🏆 " : "🔒 "}${esc(a.label)}</span>`).join("")}</div></div></div>`;
    document.getElementById("pf").addEventListener("submit", async (e) => {
      e.preventDefault(); const m = document.getElementById("msg");
      try { const r = await api("/api/me", { method: "PUT", body: { name: document.getElementById("name").value.trim(), bio: document.getElementById("bio").value.trim() } });
        localStorage.setItem("dp-user", JSON.stringify(r.user)); toast("Profile saved", "success"); setTimeout(() => location.reload(), 500); }
      catch (err) { m.textContent = err.message; m.className = "form-msg show error"; }
    });
  } catch (e) { content.innerHTML = `<div class="loader">${esc(e.message)}</div>`; }
})();
