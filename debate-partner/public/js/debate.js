(async function () {
  const { api, esc, toast } = DP;
  const content = document.getElementById("content");
  const id = Number(new URLSearchParams(location.search).get("id"));

  try {
    await DP.shell("debate");
  } catch (e) {
    content.innerHTML = `<div class="loader">${esc(e.message)}</div>`;
    return;
  }

  if (!id) {
    location.href = "new.html";
    return;
  }

  let state;

  try {
    state = await api(`/api/debates/${id}`);
  } catch (e) {
    content.innerHTML = `
      <div class="panel glass">
        <p>${esc(e.message)}</p>
        <a class="btn btn-ghost" href="history.html">Back to history</a>
      </div>`;
    return;
  }

  const d = state.debate;

  let userTurns = state.userTurns;
  let busy = false;
  let completed = d.status === "completed";

  content.innerHTML = `
  <div class="debate-head glass">
    <div>
      <div class="eyebrow">Voice debate</div>
      <h1 class="motion">${esc(d.topic)}</h1>

      <div class="meta-row">
        <span class="tag">You: ${d.userSide === "for" ? "FOR" : "AGAINST"}</span>
        <span class="tag diff">${esc(d.difficulty)}</span>
        <span class="tag" id="turnTag"></span>
        <span class="tag" id="timerTag" title="Time on this page">⏱ 00:00</span>
      </div>
    </div>

    <div class="head-actions">
      <button class="btn btn-ghost" id="finishBtn">
        Finish &amp; evaluate
      </button>
    </div>
  </div>

  <div class="debate-mode-switch glass" id="debateModeSwitch"
       role="group" aria-label="Choose debate mode">

    <button class="debate-mode-btn active"
            id="voiceModeBtn"
            type="button"
            aria-pressed="true">
      🎙 Voice mode
    </button>

    <button class="debate-mode-btn"
            id="textModeBtn"
            type="button"
            aria-pressed="false">
      ✍️ Text mode
    </button>
  </div>

  <div class="chat glass" id="chat" aria-live="polite"></div>

  <section class="text-room glass"
           id="textRoom"
           aria-label="Text debate controls"
           hidden>

    <div class="text-room-heading">
      <div>
        <div class="eyebrow">Your turn to argue</div>
        <h2>Make your point</h2>
        <p>Type a clear argument. Your AI opponent will respond in text and aloud.</p>
      </div>

      <span class="text-room-icon">✦</span>
    </div>

    <form id="textArgumentForm" class="text-composer">

      <label class="sr-only" for="textArgument">
        Your argument
      </label>

      <textarea
        id="textArgument"
        maxlength="5000"
        rows="4"
        placeholder="Write your argument here…"
        required>
      </textarea>

      <div class="text-composer-footer">
        <span id="textCharCount">0 / 5000</span>

        <button class="btn btn-primary"
                id="sendTextBtn"
                type="submit">
          Send argument <span aria-hidden="true">↗</span>
        </button>
      </div>
    </form>

    <div class="text-audio-controls">
      <span id="textSpeechStatus" role="status">
        AI replies will be read aloud automatically.
      </span>

      <div class="text-audio-buttons">

        <button class="btn btn-ghost small"
                id="textReplayBtn"
                type="button"
                disabled>
          ▶ Replay response
        </button>

        <button class="btn btn-ghost small"
                id="textMuteBtn"
                type="button"
                aria-pressed="false">
          🔊 Mute
        </button>

      </div>
    </div>
  </section>

  <section class="voice-room glass"
           id="voiceRoom"
           aria-label="Voice debate controls">

    <div class="voice-status"
         id="voiceStatus"
         role="status"
         aria-live="polite">

      <span class="voice-status-dot"></span>

      <span>
        Ready when you are. Press the microphone and speak your argument.
      </span>
    </div>

    <div class="voice-orb" id="voiceOrb" aria-hidden="true">
      <span>🎙️</span>
    </div>

    <p class="voice-preview" id="voicePreview">
      Your recognized speech will appear here while you speak.
    </p>

    <div class="voice-controls">

      <button class="btn btn-primary"
              id="startVoiceBtn"
              type="button">
        🎙 Start speaking
      </button>

      <button class="btn btn-ghost"
              id="stopVoiceBtn"
              type="button"
              disabled>
        Stop &amp; send argument
      </button>

      <button class="btn btn-ghost"
              id="replayBtn"
              type="button"
              disabled>
        🔊 Replay AI response
      </button>

    </div>

    <p class="voice-note">
      Speak naturally. Your words will be transcribed for the debate record,
      but you cannot type an argument here.
    </p>
  </section>

  <div id="evalBox"></div>
  `;

  const $ = (x) => document.getElementById(x);
  const chat = $("chat");

  let recognition = null;
  let listening = false;
  let shouldSubmitOnEnd = false;
  let finalTranscript = "";
  let interimTranscript = "";

  let lastAIResponse = "";
  let speechSynthesisAvailable = "speechSynthesis" in window;

  let activeMode = "voice";
  let speechMuted = false;
  let activeUtterance = null;

  // CHAT BUBBLES

  const bubble = (role, text) => {
    const b = document.createElement("div");

    b.className = `bubble ${
      role === "user" ? "bubble-user" : "bubble-ai"
    } chat-bubble`;

    const tag = document.createElement("span");
    tag.className = "bubble-tag";

    tag.textContent =
      activeMode === "voice"
        ? (role === "user" ? "You · spoken" : "AI Opponent · voice")
        : (role === "user" ? "You · typed" : "AI Opponent · text");

    const body = document.createElement("div");
    body.className = "bubble-text";
    body.textContent = text;

    b.append(tag, body);
    chat.appendChild(b);

    chat.scrollTop = chat.scrollHeight;

    return body;
  };

  state.messages.forEach((m) => {
    bubble(m.role, m.content);
  });

  if (!state.messages.length) {
    const n = document.createElement("div");

    n.className = "chat-hint";
    n.id = "hint";

    n.textContent =
      `Start by presenting your case ${
        d.userSide === "for" ? "in favour of" : "against"
      } the motion. Choose Voice mode to speak or Text mode to type your argument.`;

    chat.appendChild(n);
  }

  // UPDATE TURN

  const updateTurn = () => {
    $("turnTag").textContent =
      `Turn ${Math.min(
        userTurns + (completed ? 0 : 1),
        d.maxTurns
      )} / ${d.maxTurns}`;

    const out = userTurns >= d.maxTurns;

    $("startVoiceBtn").disabled =
      busy || completed || out || listening;

    $("sendTextBtn").disabled =
      busy || completed || out;

    $("textArgument").disabled =
      busy || completed || out;

    $("stopVoiceBtn").disabled = !listening;

    $("finishBtn").disabled =
      busy || completed || userTurns < 1;

    if (out && !completed) {
      setVoiceStatus(
        "All turns used. Finish and evaluate your debate.",
        "done"
      );
    }
  };

  // VOICE STATUS

  function setVoiceStatus(message, mode = "") {
    const status = $("voiceStatus");

    status.className = `voice-status ${mode}`;

    status.querySelector("span:last-child").textContent = message;

    $("voiceOrb").classList.toggle(
      "is-listening",
      mode === "listening"
    );

    $("voiceOrb").classList.toggle(
      "is-speaking",
      mode === "speaking"
    );
  }

  // TEXT TO SPEECH

  function speak(text) {
    if (!speechSynthesisAvailable || !text || speechMuted) return;

    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);

    activeUtterance = utterance;

    utterance.rate = 1;
    utterance.pitch = 1;
    utterance.lang = navigator.language || "en-US";
    utterance.volume = 1;

    utterance.onstart = () => {
      if (activeMode === "voice") {
        setVoiceStatus(
          "AI is speaking. Listen, then respond when it finishes.",
          "speaking"
        );
      } else {
        $("textSpeechStatus").textContent =
          "AI is speaking your opponent's response…";
      }
    };

    utterance.onend = () => {
      activeUtterance = null;

      if (activeMode === "voice") {
        setVoiceStatus(
          "Your turn. Press the microphone to respond."
        );

        updateTurn();
      } else {
        $("textSpeechStatus").textContent =
          "Response finished. You can replay it anytime.";
      }
    };

    utterance.onerror = () => {
      activeUtterance = null;

      if (activeMode === "text") {
        $("textSpeechStatus").textContent =
          "Text response is ready, but audio playback failed.";
      } else {
        setVoiceStatus(
          "The response is visible in the transcript, but speech playback failed. Try Replay AI response.",
          "error"
        );
      }
    };

    window.speechSynthesis.speak(utterance);
  }

  // STOP SPEECH RECOGNITION

  function stopRecognition() {
    if (recognition && listening) {
      shouldSubmitOnEnd = true;

      try {
        recognition.stop();
      } catch (_) {
        finishRecognition();
      }
    }
  }

  function finishRecognition() {
    listening = false;

    $("voiceOrb").classList.remove("is-listening");

    $("startVoiceBtn").disabled =
      busy || completed || userTurns >= d.maxTurns;

    $("stopVoiceBtn").disabled = true;

    const text = finalTranscript.trim();

    if (shouldSubmitOnEnd) {
      shouldSubmitOnEnd = false;

      if (text) {
        submitArgument(text);
      } else {
        setVoiceStatus(
          "I didn't catch any speech. Press the microphone and try again.",
          "error"
        );
      }
    } else if (!busy) {
      setVoiceStatus(
        "Ready when you are. Press the microphone and speak your argument."
      );
    }
  }

  // START VOICE RECOGNITION

  function startRecognition() {
    const SpeechRecognition =
      window.SpeechRecognition ||
      window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setVoiceStatus(
        "Speech recognition isn't supported in this browser. Please use the latest Google Chrome on localhost.",
        "error"
      );

      toast(
        "This browser does not support speech recognition. Try Chrome.",
        "error"
      );

      return;
    }

    if (
      busy ||
      completed ||
      userTurns >= d.maxTurns ||
      listening
    ) return;

    if (speechSynthesisAvailable) {
      window.speechSynthesis.cancel();
    }

    finalTranscript = "";
    interimTranscript = "";
    shouldSubmitOnEnd = false;

    $("voicePreview").textContent =
      "Listening… start speaking clearly.";

    recognition = new SpeechRecognition();

    recognition.lang = navigator.language || "en-US";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      listening = true;

      setVoiceStatus(
        "Listening to your argument… press Stop & send when you're finished.",
        "listening"
      );

      updateTurn();
    };

    recognition.onresult = (event) => {
      interimTranscript = "";

      for (
        let i = event.resultIndex;
        i < event.results.length;
        i++
      ) {
        const phrase = event.results[i][0].transcript;

        if (event.results[i].isFinal) {
          finalTranscript += phrase + " ";
        } else {
          interimTranscript += phrase;
        }
      }

      $("voicePreview").textContent =
        (finalTranscript + interimTranscript).trim() ||
        "Listening…";
    };

    recognition.onerror = (event) => {
      if (
        event.error === "not-allowed" ||
        event.error === "service-not-allowed"
      ) {
        setVoiceStatus(
          "Microphone permission was blocked. Allow microphone access for localhost in Chrome settings.",
          "error"
        );
      } else if (
        event.error !== "no-speech" &&
        event.error !== "aborted"
      ) {
        setVoiceStatus(
          `Speech recognition error: ${event.error}. Please try again.`,
          "error"
        );
      }

      shouldSubmitOnEnd = false;
    };

    recognition.onend = finishRecognition;

    try {
      recognition.start();
    } catch (err) {
      setVoiceStatus(
        "Couldn't start the microphone. Wait a moment and try again.",
        "error"
      );

      toast(err.message, "error");
    }
  }

  // SUBMIT ARGUMENT TO AI

  async function submitArgument(text) {
    if (!text || busy || completed) return;

    busy = true;
    updateTurn();

    if (activeMode === "voice") {
      $("voicePreview").textContent = `Submitted: “${text}”`;
    }

    $("hint")?.remove();

    bubble("user", text);

    const aiBody = bubble("assistant", "");

    aiBody.classList.add("typing");

    setVoiceStatus(
      "Your argument was received. The AI is preparing a counterargument…",
      "thinking"
    );

    let ok = false;

    try {
      const res = await fetch(
        `/api/debates/${id}/messages`,
        {
          method: "POST",

          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${DP.token}`
          },

          body: JSON.stringify({
            content: text
          })
        }
      );

      if (!res.ok) {
        let j = {};

        try {
          j = await res.json();
        } catch (_) {}

        throw new Error(
          j.error || `Request failed (${res.status})`
        );
      }

      const reader = res.body.getReader();
      const dec = new TextDecoder();

      let buf = "";

      for (;;) {
        const { done, value } = await reader.read();

        if (done) break;

        buf += dec.decode(value, { stream: true })
          .replace(/\r\n/g, "\n");

        let i;

        while ((i = buf.indexOf("\n\n")) >= 0) {
          const block = buf.slice(0, i);

          buf = buf.slice(i + 2);

          const ev =
            (block.match(/^event: (.+)$/m) || [])[1];

          const data =
            (block.match(/^data: (.+)$/m) || [])[1];

          if (!ev || !data) continue;

          const p = JSON.parse(data);

          if (ev === "delta") {
            aiBody.textContent += p.text;
            chat.scrollTop = chat.scrollHeight;
          } else if (ev === "done") {
            ok = true;
          } else if (ev === "error") {
            throw new Error(p.error);
          }
        }
      }

      if (!ok) {
        throw new Error(
          "The connection dropped before the AI finished. Please try your argument again."
        );
      }

      lastAIResponse = aiBody.textContent.trim();

      userTurns++;

      $("replayBtn").disabled =
        !lastAIResponse || !speechSynthesisAvailable;

      $("textReplayBtn").disabled =
        !lastAIResponse || !speechSynthesisAvailable;

      if (lastAIResponse) {
        if (activeMode === "text") {
          $("textSpeechStatus").textContent =
            speechMuted
              ? "Audio is muted. Your opponent's text response is ready."
              : "Your opponent's response is ready. Playing aloud…";
        }

        speak(lastAIResponse);

      } else if (activeMode === "voice") {
        setVoiceStatus(
          "AI response was empty. You can try your next turn.",
          "error"
        );
      }

    } catch (err) {
      toast(err.message, "error");

      aiBody.closest(".chat-bubble").remove();
      chat.lastElementChild?.remove();

      if (activeMode === "voice") {
        $("voicePreview").textContent =
          "Your argument wasn't sent. Press the microphone to try again.";

        setVoiceStatus(err.message, "error");
      } else {
        $("textSpeechStatus").textContent = err.message;
      }

    } finally {
      aiBody.classList.remove("typing");

      busy = false;

      updateTurn();
    }
  }

  // VOICE MODE EVENTS

  $("startVoiceBtn").addEventListener(
    "click",
    startRecognition
  );

  $("stopVoiceBtn").addEventListener(
    "click",
    stopRecognition
  );

  $("replayBtn").addEventListener("click", () => {
    if (lastAIResponse) {
      speak(lastAIResponse);
    }
  });

  // TEXT MODE REPLAY

  $("textReplayBtn").addEventListener("click", () => {
    if (lastAIResponse) {
      speak(lastAIResponse);
    }
  });

  // MUTE / UNMUTE

  $("textMuteBtn").addEventListener("click", () => {
    speechMuted = !speechMuted;

    $("textMuteBtn").textContent =
      speechMuted ? "🔇 Unmute" : "🔊 Mute";

    $("textMuteBtn").setAttribute(
      "aria-pressed",
      String(speechMuted)
    );

    if (speechMuted && speechSynthesisAvailable) {
      window.speechSynthesis.cancel();
      activeUtterance = null;
    }

    $("textSpeechStatus").textContent =
      speechMuted
        ? "Audio muted. Text responses will still appear."
        : "Audio unmuted. New and replayed responses will be spoken.";
  });

  // TEXT CHARACTER COUNT

  $("textArgument").addEventListener("input", () => {
    $("textCharCount").textContent =
      `${$("textArgument").value.length} / 5000`;
  });

  // TEXT ARGUMENT SUBMISSION

  $("textArgumentForm").addEventListener(
    "submit",
    (event) => {
      event.preventDefault();

      const field = $("textArgument");
      const value = field.value.trim();

      if (
        !value ||
        busy ||
        completed ||
        userTurns >= d.maxTurns
      ) return;

      field.value = "";

      $("textCharCount").textContent = "0 / 5000";

      submitArgument(value);
    }
  );

  // SWITCH BETWEEN MODES

  function setMode(mode) {
    if (listening || busy || completed) return;

    activeMode = mode;

    const isText = mode === "text";

    $("voiceModeBtn").classList.toggle(
      "active",
      !isText
    );

    $("textModeBtn").classList.toggle(
      "active",
      isText
    );

    $("voiceModeBtn").setAttribute(
      "aria-pressed",
      String(!isText)
    );

    $("textModeBtn").setAttribute(
      "aria-pressed",
      String(isText)
    );

    $("voiceRoom").hidden = isText;
    $("textRoom").hidden = !isText;

    if (speechSynthesisAvailable) {
      window.speechSynthesis.cancel();
    }

    if (isText) {
      $("textArgument").focus();

      $("textSpeechStatus").textContent =
        "AI replies will be read aloud automatically.";
    } else {
      setVoiceStatus(
        "Ready when you are. Press the microphone and speak your argument."
      );
    }
  }

  $("voiceModeBtn").addEventListener(
    "click",
    () => setMode("voice")
  );

  $("textModeBtn").addEventListener(
    "click",
    () => setMode("text")
  );

  updateTurn();

  // COMPLETED DEBATE

  if (completed) {
    $("voiceRoom").style.display = "none";
    $("textRoom").style.display = "none";
    $("debateModeSwitch").style.display = "none";
    $("finishBtn").style.display = "none";
    $("timerTag").style.display = "none";

    showEval(state.evaluation, d);

  } else {
    const t0 = Date.now();

    setInterval(() => {
      const s = Math.floor(
        (Date.now() - t0) / 1000
      );

      $("timerTag").textContent =
        `⏱ ${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

    }, 1000);
  }

  // FINISH AND EVALUATE

  $("finishBtn").addEventListener(
    "click",
    async () => {

      if (busy || completed || listening) return;

      if (
        userTurns < d.maxTurns &&
        !confirm(
          `You've used ${userTurns} of ${d.maxTurns} turns. Finish now and get your evaluation?`
        )
      ) return;

      busy = true;

      updateTurn();

      $("finishBtn").textContent = "Judging…";

      if (speechSynthesisAvailable) {
        window.speechSynthesis.cancel();
      }

      $("evalBox").innerHTML =
        '<div class="panel glass loader">The AI judge is reading your debate…</div>';

      try {
        const r = await api(
          `/api/debates/${id}/finish`,
          { method: "POST" }
        );

        completed = true;

        $("voiceRoom").style.display = "none";
        $("textRoom").style.display = "none";
        $("debateModeSwitch").style.display = "none";
        $("finishBtn").style.display = "none";
        $("timerTag").style.display = "none";

        showEval(r.evaluation, r.debate);

        r.newAchievements.forEach((a) => {
          toast(
            `🏆 Achievement unlocked: ${a}`,
            "success"
          );
        });

      } catch (err) {
        $("evalBox").innerHTML = "";

        toast(err.message, "error");

        $("finishBtn").textContent =
          "Finish & evaluate";

        busy = false;

        updateTurn();
      }
    }
  );

  // CLEANUP

  window.addEventListener("beforeunload", () => {
    if (recognition && listening) {
      try {
        recognition.abort();
      } catch (_) {}
    }

    if (speechSynthesisAvailable) {
      window.speechSynthesis.cancel();
    }
  });

  // EVALUATION DISPLAY

  function showEval(ev, deb) {
    if (!ev) {
      $("evalBox").innerHTML = "";
      return;
    }

    const bars = [
      ["Argument strength", ev.scores.argumentStrength],
      ["Evidence", ev.scores.evidence],
      ["Rebuttal", ev.scores.rebuttal],
      ["Clarity", ev.scores.clarity],
      ["Structure", ev.scores.structure]
    ];

    $("evalBox").innerHTML = `
    <div class="panel glass eval-panel">

      <div class="eval-top">
        <div>
          <div class="eyebrow">Result</div>
          <span class="pill pill-${deb.result.toLowerCase()} big">
            ${esc(deb.result)}
          </span>
        </div>

        <div class="eval-score">
          <div class="num">${ev.overall}</div>
          <div class="lbl">/ 10 overall</div>
        </div>

        <div class="eval-score">
          <div class="num">${ev.confidence}%</div>
          <div class="lbl">confidence</div>
        </div>
      </div>

      ${
        ev.degraded
          ? '<div class="form-msg show error">The AI judge was unavailable, so this is only a rough fallback estimate.</div>'
          : ""
      }

      <p class="eval-summary">${esc(ev.summary)}</p>

      <div class="bars">
        ${bars.map(([l, v]) => `
          <div class="bar-row">
            <span>${l}</span>
            <div class="bar">
              <i style="width:${v * 10}%"></i>
            </div>
            <b>${v}</b>
          </div>
        `).join("")}
      </div>

      <div class="two-col">

        <div class="feedback-block strengths">
          <h3>Strengths</h3>
          <ul>
            ${ev.strengths.map((s) => `<li>${esc(s)}</li>`).join("")}
          </ul>
        </div>

        <div class="feedback-block weaknesses">
          <h3>Areas to improve</h3>
          <ul>
            ${ev.weaknesses.map((s) => `<li>${esc(s)}</li>`).join("")}
          </ul>
        </div>

      </div>

      <div class="eval-actions">
        <a class="btn btn-primary"
           href="new.html?topic=${encodeURIComponent(deb.topic)}">
          Rematch this topic
        </a>

        <a class="btn btn-ghost" href="dashboard.html">
          Dashboard
        </a>

        <a class="btn btn-ghost" href="history.html">
          History
        </a>
      </div>

    </div>`;

    $("evalBox").scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  }

})();