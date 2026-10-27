(async function () {
  const { api, esc, toast } = DP;
  const content = document.getElementById("content");
  try {
    const user = await DP.shell("settings"); const sys = await fetch("/api/system").then((r) => r.json());
    content.innerHTML = `<div class="page-head"><h1>Settings</h1></div>
    <div class="panel glass form-panel"><div class="panel-head"><h2>Debate defaults</h2></div>
      <div class="form-row"><div class="field"><label for="dd">Default difficulty</label><div class="field-input"><select id="dd"><option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option></select></div></div>
      <div class="field"><label for="dt">Default turns</label><div class="field-input"><select id="dt">${[1,2,3,4,5,6,8,10].map((n) => `<option value="${n}">${n}</option>`).join("")}</select></div></div></div>
      <button class="btn btn-primary" id="saveDef">Save defaults</button></div>
    <div class="panel glass form-panel"><div class="panel-head"><h2>Change password</h2></div><div id="pwMsg" class="form-msg"></div>
      <div class="field"><label for="cur">Current password</label><div class="field-input"><input type="password" id="cur" autocomplete="current-password"/></div></div>
      <div class="field"><label for="nw">New password (min 8 characters)</label><div class="field-input"><input type="password" id="nw" autocomplete="new-password"/></div></div>
      <button class="btn btn-primary" id="savePw">Update password</button><small class="hint">Other devices will be signed out.</small></div>
    <div class="panel glass form-panel"><div class="panel-head"><h2>AI provider</h2></div>
      <p class="muted">Provider: <b>${esc(sys.provider)}</b> · Model: <b>${esc(sys.model)}</b>${sys.demoAi ? "<br>Offline demo AI is active. Set an API key in <code>.env</code> to enable real debates." : ""}</p></div>
    <div class="panel glass form-panel danger-zone"><div class="panel-head"><h2>Delete account</h2></div><p class="muted">Permanently deletes your account, debates, evaluations and documents.</p>
      <div class="field"><label for="delpw">Confirm password</label><div class="field-input"><input type="password" id="delpw" autocomplete="current-password"/></div></div>
      <button class="btn btn-danger" id="delBtn">Delete my account</button></div>`;
    const $ = (i) => document.getElementById(i);
    $("dd").value = user.defaultDifficulty; $("dt").value = String(user.defaultTurns);
    $("saveDef").addEventListener("click", async () => { try { const r = await api("/api/me", { method: "PUT", body: { defaultDifficulty: $("dd").value, defaultTurns: Number($("dt").value) } }); localStorage.setItem("dp-user", JSON.stringify(r.user)); toast("Defaults saved", "success"); } catch (e) { toast(e.message, "error"); } });
    $("savePw").addEventListener("click", async () => { const m = $("pwMsg");
      try { await api("/api/me/password", { method: "POST", body: { currentPassword: $("cur").value, newPassword: $("nw").value } }); $("cur").value = $("nw").value = ""; m.textContent = "Password updated."; m.className = "form-msg show success"; }
      catch (e) { m.textContent = e.message; m.className = "form-msg show error"; } });
    $("delBtn").addEventListener("click", async () => { if (!confirm("This permanently deletes your account and all data. Continue?")) return;
      try { await api("/api/me", { method: "DELETE", body: { password: $("delpw").value } }); DP.logoutLocal(); } catch (e) { toast(e.message, "error"); } });
  } catch (e) { content.innerHTML = `<div class="loader">${esc(e.message)}</div>`; }
})();
