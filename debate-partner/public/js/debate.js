(async function () {
  const { api, esc, toast } = DP;
  const content = document.getElementById("content");
  const id = Number(new URLSearchParams(location.search).get("id"));
  try { await DP.shell("debate"); } catch (e) { content.innerHTML = `<div class="loader">${esc(e.message)}</div>`; return; }
  if (!id) { location.href = "new.html"; return; }

  let state;
  try { state = await api(`/api/debates/${id}`); } catch (e) { content.innerHTML = `<div class="panel glass"><p>${esc(e.message)}</p><a class="btn btn-ghost" href="history.html">Back to history</a></div>`; return; }
  const d = state.debate;
  let userTurns = state.userTurns, busy = false, completed = d.status === "completed";

  content.innerHTML = `
  <div class="debate-head glass">
    <div><div class="eyebrow">Voice debate</div><h1 class="motion">${esc(d.topic)}</h1>
      <div class="meta-row"><span class="tag">You: ${d.userSide === "for" ? "FOR" : "AGAINST"}</span><span class="tag diff">${esc(d.difficulty)}</span><span class="tag" id="turnTag"></span><span class="tag" id="timerTag" title="Time on this page">⏱ 00:00</span></div></div>
    <div class="head-actions"><button class="btn btn-ghost" id="finishBtn">Finish &amp; evaluate</button></div>
  </div>
  <div class="chat glass" id="chat" aria-live="polite"></div>
  <section class="voice-room glass" id="voiceRoom" aria-label="Voice debate controls">
    <div class="voice-status" id="voiceStatus" role="status" aria-live="polite"><span class="voice-status-dot"></span><span>Ready when you are. Press the microphone and speak your argument.</span></div>
    <div class="voice-orb" id="voiceOrb" aria-hidden="true"><span>🎙️</span></div>
    <p class="voice-preview" id="voicePreview">Your recognized speech will appear here while you speak.</p>
    <div class="voice-controls">
      <button class="btn btn-primary" id="startVoiceBtn" type="button">🎙 Start speaking</button>
      <button class="btn btn-ghost" id="stopVoiceBtn" type="button" disabled>Stop &amp; send argument</button>
      <button class="btn btn-ghost" id="replayBtn" type="button" disabled>🔊 Replay AI response</button>
    </div>
    <p class="voice-note">Speak naturally. Your words will be transcribed for the debate record, but you cannot type an argument here.</p>
  </section>
  <div id="evalBox"></div>`;
  const $ = (x) => document.getElementById(x);
  const chat = $("chat");
  let recognition = null, listening = false, shouldSubmitOnEnd = false, finalTranscript = "", interimTranscript = "";
  let lastAIResponse = "", speechSynthesisAvailable = "speechSynthesis" in window;

  const bubble = (role, text) => {
    const b = document.createElement("div"); b.className = `bubble ${role === "user" ? "bubble-user" : "bubble-ai"} chat-bubble`;
    const tag = document.createElement("span"); tag.className = "bubble-tag"; tag.textContent = role === "user" ? "You · spoken" : "AI Opponent · voice";
    const body = document.createElement("div"); body.className = "bubble-text"; body.textContent = text;
    b.append(tag, body); chat.appendChild(b); chat.scrollTop = chat.scrollHeight; return body;
  };
  state.messages.forEach((m) => bubble(m.role, m.content));
  if (!state.messages.length) { const n = document.createElement("div"); n.className = "chat-hint"; n.id = "hint";
    n.textContent = `Start by speaking your case ${d.userSide === "for" ? "in favour of" : "against"} the motion. The AI will argue the opposite side and speak its response aloud.`; chat.appendChild(n); }

  const updateTurn = () => {
    $("turnTag").textContent = `Turn ${Math.min(userTurns + (completed ? 0 : 1), d.maxTurns)} / ${d.maxTurns}`;
    const out = userTurns >= d.maxTurns;
    $("startVoiceBtn").disabled = busy || completed || out || listening;
    $("stopVoiceBtn").disabled = !listening;
    $("finishBtn").disabled = busy || completed || userTurns < 1;
    if (out && !completed) setVoiceStatus("All turns used. Finish and evaluate your debate.", "done");
  };
  function setVoiceStatus(message, mode = "") {
    const status = $("voiceStatus"); status.className = `voice-status ${mode}`;
    status.querySelector("span:last-child").textContent = message;
    $("voiceOrb").classList.toggle("is-listening", mode === "listening");
    $("voiceOrb").classList.toggle("is-speaking", mode === "speaking");
  }
  function speak(text) {
    if (!speechSynthesisAvailable || !text) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1; utterance.pitch = 1; utterance.lang = navigator.language || "en-US";
    utterance.onstart = () => setVoiceStatus("AI is speaking. Listen, then respond when it finishes.", "speaking");
    utterance.onend = () => { setVoiceStatus("Your turn. Press the microphone to respond."); updateTurn(); };
    utterance.onerror = () => setVoiceStatus("The response is visible in the transcript, but speech playback failed. Try Replay AI response.", "error");
    window.speechSynthesis.speak(utterance);
  }
  function stopRecognition() {
    if (recognition && listening) { shouldSubmitOnEnd = true; try { recognition.stop(); } catch (_) { finishRecognition(); } }
  }
  function finishRecognition() {
    listening = false;
    $("voiceOrb").classList.remove("is-listening");
    $("startVoiceBtn").disabled = busy || completed || userTurns >= d.maxTurns;
    $("stopVoiceBtn").disabled = true;
    const text = finalTranscript.trim();
    if (shouldSubmitOnEnd) {
      shouldSubmitOnEnd = false;
      if (text) submitArgument(text);
      else setVoiceStatus("I didn't catch any speech. Press the microphone and try again.", "error");
    } else if (!busy) setVoiceStatus("Ready when you are. Press the microphone and speak your argument.");
  }
  function startRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setVoiceStatus("Speech recognition isn't supported in this browser. Please use the latest Google Chrome on localhost.", "error");
      toast("This browser does not support speech recognition. Try Chrome.", "error"); return;
    }
    if (busy || completed || userTurns >= d.maxTurns || listening) return;
    if (speechSynthesisAvailable) window.speechSynthesis.cancel();
    finalTranscript = ""; interimTranscript = ""; shouldSubmitOnEnd = false;
    $("voicePreview").textContent = "Listening… start speaking clearly.";
    recognition = new SpeechRecognition();
    recognition.lang = navigator.language || "en-US";
    recognition.continuous = true; recognition.interimResults = true; recognition.maxAlternatives = 1;
    recognition.onstart = () => { listening = true; setVoiceStatus("Listening to your argument… press Stop & send when you're finished.", "listening"); updateTurn(); };
    recognition.onresult = (event) => {
      interimTranscript = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const phrase = event.results[i][0].transcript;
        if (event.results[i].isFinal) finalTranscript += phrase + " "; else interimTranscript += phrase;
      }
      $("voicePreview").textContent = (finalTranscript + interimTranscript).trim() || "Listening…";
    };
    recognition.onerror = (event) => {
      if (event.error === "not-allowed" || event.error === "service-not-allowed") setVoiceStatus("Microphone permission was blocked. Allow microphone access for localhost in Chrome settings.", "error");
      else if (event.error !== "no-speech" && event.error !== "aborted") setVoiceStatus(`Speech recognition error: ${event.error}. Please try again.`, "error");
      shouldSubmitOnEnd = false;
    };
    recognition.onend = finishRecognition;
    try { recognition.start(); }
    catch (err) { setVoiceStatus("Couldn't start the microphone. Wait a moment and try again.", "error"); toast(err.message, "error"); }
  }

  async function submitArgument(text) {
    if (!text || busy || completed) return;
    busy = true; updateTurn();
    $("voicePreview").textContent = `Submitted: “${text}”`;
    $("hint")?.remove();
    bubble("user", text);
    const aiBody = bubble("assistant", ""); aiBody.classList.add("typing");
    setVoiceStatus("Your argument was received. The AI is preparing a counterargument…", "thinking");
    let ok = false;
    try {
      const res = await fetch(`/api/debates/${id}/messages`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${DP.token}` }, body: JSON.stringify({ content: text }) });
      if (!res.ok) { let j = {}; try { j = await res.json(); } catch (_) {} throw new Error(j.error || `Request failed (${res.status})`); }
      const reader = res.body.getReader(), dec = new TextDecoder(); let buf = "";
      for (;;) {
        const { done, value } = await reader.read(); if (done) break;
        buf += dec.decode(value, { stream: true }).replace(/\r\n/g, "\n");
        let i;
        while ((i = buf.indexOf("\n\n")) >= 0) {
          const block = buf.slice(0, i); buf = buf.slice(i + 2);
          const ev = (block.match(/^event: (.+)$/m) || [])[1]; const data = (block.match(/^data: (.+)$/m) || [])[1];
          if (!ev || !data) continue; const p = JSON.parse(data);
          if (ev === "delta") { aiBody.textContent += p.text; chat.scrollTop = chat.scrollHeight; }
          else if (ev === "done") ok = true;
          else if (ev === "error") throw new Error(p.error);
        }
      }
      if (!ok) throw new Error("The connection dropped before the AI finished. Please try your argument again.");
      lastAIResponse = aiBody.textContent.trim();
      userTurns++;
      $("replayBtn").disabled = !lastAIResponse || !speechSynthesisAvailable;
      if (lastAIResponse) speak(lastAIResponse);
      else setVoiceStatus("AI response was empty. You can try your next turn.", "error");
    } catch (err) {
      toast(err.message, "error");
      aiBody.closest(".chat-bubble").remove();
      chat.lastElementChild?.remove();
      $("voicePreview").textContent = "Your argument wasn't sent. Press the microphone to try again.";
      setVoiceStatus(err.message, "error");
    } finally { aiBody.classList.remove("typing"); busy = false; updateTurn(); }
  }

  $("startVoiceBtn").addEventListener("click", startRecognition);
  $("stopVoiceBtn").addEventListener("click", stopRecognition);
  $("replayBtn").addEventListener("click", () => { if (lastAIResponse) speak(lastAIResponse); });
  updateTurn();

  if (completed) { $("voiceRoom").style.display = "none"; $("finishBtn").style.display = "none"; $("timerTag").style.display = "none"; showEval(state.evaluation, d); }
  else { const t0 = Date.now(); setInterval(() => { const s = Math.floor((Date.now() - t0) / 1000); $("timerTag").textContent = `⏱ ${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`; }, 1000); }

  $("finishBtn").addEventListener("click", async () => {
    if (busy || completed || listening) return;
    if (userTurns < d.maxTurns && !confirm(`You've used ${userTurns} of ${d.maxTurns} turns. Finish now and get your evaluation?`)) return;
    busy = true; updateTurn(); $("finishBtn").textContent = "Judging…";
    if (speechSynthesisAvailable) window.speechSynthesis.cancel();
    $("evalBox").innerHTML = '<div class="panel glass loader">The AI judge is reading your debate…</div>';
    try {
      const r = await api(`/api/debates/${id}/finish`, { method: "POST" });
      completed = true; $("voiceRoom").style.display = "none"; $("finishBtn").style.display = "none"; $("timerTag").style.display = "none";
      showEval(r.evaluation, r.debate);
      r.newAchievements.forEach((a) => toast(`🏆 Achievement unlocked: ${a}`, "success"));
    } catch (err) { $("evalBox").innerHTML = ""; toast(err.message, "error"); $("finishBtn").textContent = "Finish & evaluate"; busy = false; updateTurn(); }
  });

  window.addEventListener("beforeunload", () => {
    if (recognition && listening) { try { recognition.abort(); } catch (_) {} }
    if (speechSynthesisAvailable) window.speechSynthesis.cancel();
  });

  function showEval(ev, deb) {
    if (!ev) { $("evalBox").innerHTML = ""; return; }
    const bars = [["Argument strength", ev.scores.argumentStrength], ["Evidence", ev.scores.evidence], ["Rebuttal", ev.scores.rebuttal], ["Clarity", ev.scores.clarity], ["Structure", ev.scores.structure]];
    $("evalBox").innerHTML = `
    <div class="panel glass eval-panel">
      <div class="eval-top"><div><div class="eyebrow">Result</div><span class="pill pill-${deb.result.toLowerCase()} big">${esc(deb.result)}</span></div>
        <div class="eval-score"><div class="num">${ev.overall}</div><div class="lbl">/ 10 overall</div></div>
        <div class="eval-score"><div class="num">${ev.confidence}%</div><div class="lbl">confidence</div></div></div>
      ${ev.degraded ? '<div class="form-msg show error">The AI judge was unavailable, so this is only a rough fallback estimate.</div>' : ""}
      <p class="eval-summary">${esc(ev.summary)}</p>
      <div class="bars">${bars.map(([l, v]) => `<div class="bar-row"><span>${l}</span><div class="bar"><i style="width:${v * 10}%"></i></div><b>${v}</b></div>`).join("")}</div>
      <div class="two-col"><div class="feedback-block strengths"><h3>Strengths</h3><ul>${ev.strengths.map((s) => `<li>${esc(s)}</li>`).join("")}</ul></div>
        <div class="feedback-block weaknesses"><h3>Areas to improve</h3><ul>${ev.weaknesses.map((s) => `<li>${esc(s)}</li>`).join("")}</ul></div></div>
      <div class="eval-actions"><a class="btn btn-primary" href="new.html?topic=${encodeURIComponent(deb.topic)}">Rematch this topic</a><a class="btn btn-ghost" href="dashboard.html">Dashboard</a><a class="btn btn-ghost" href="history.html">History</a></div>
    </div>`;
    $("evalBox").scrollIntoView({ behavior: "smooth", block: "start" });
  }
})();
