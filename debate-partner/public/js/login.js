(function () {
  const form = document.getElementById("loginForm");
  const emailInput = document.getElementById("email");
  const passwordInput = document.getElementById("password");
  const nameInput = document.getElementById("name");
  const nameField = document.getElementById("nameField");
  const rememberRow = document.getElementById("rememberRow");
  const submitBtn = document.getElementById("submitBtn");
  const switchModeBtn = document.getElementById("switchModeBtn");
  const formTitle = document.getElementById("formTitle");
  const formSubtitle = document.getElementById("formSubtitle");
  const formMsg = document.getElementById("formMsg");
  const togglePw = document.getElementById("togglePw");

  // Already logged in? skip straight to dashboard.
  if (localStorage.getItem("dp-token")) {
    window.location.href = "dashboard.html";
  }

  let mode = "login"; // or "signup"

  // Only advertise the demo login when the server actually seeded it.
  fetch("/api/system").then((r) => r.json()).then((s) => {
    const h = document.querySelector(".demo-hint");
    if (h && !s.demoLogin) h.style.display = "none";
  }).catch(() => {});

  switchModeBtn.addEventListener("click", () => {
    mode = mode === "login" ? "signup" : "login";
    const isSignup = mode === "signup";
    nameField.style.display = isSignup ? "block" : "none";
    nameInput.required = isSignup;
    rememberRow.style.display = isSignup ? "none" : "flex";
    formTitle.textContent = isSignup ? "Create your account" : "Welcome back";
    formSubtitle.textContent = isSignup
      ? "Sign up to start practicing debates with your AI partner."
      : "Log in to continue your practice streak.";
    submitBtn.textContent = isSignup ? "Sign Up" : "Log In";
    switchModeBtn.textContent = isSignup ? "Already have an account? Log in" : "Create a new account";
    hideMsg();
  });

  togglePw.addEventListener("click", () => {
    const isPw = passwordInput.type === "password";
    passwordInput.type = isPw ? "text" : "password";
  });

  document.getElementById("forgotLink").addEventListener("click", (e) => {
    e.preventDefault();
    showMsg("Email-based reset isn't available (no mail server configured). If you're logged in on another device, change your password under Settings.", "error");
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    hideMsg();

    const email = emailInput.value.trim();
    const password = passwordInput.value;
    const name = nameInput.value.trim();

    if (mode === "signup" && password.length < 8) {
      showMsg("Password must be at least 8 characters.", "error");
      return;
    }
    if (mode === "signup" && !name) {
      showMsg("Please enter your full name.", "error");
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = mode === "signup" ? "Creating account…" : "Logging in…";

    try {
      const endpoint = mode === "signup" ? "/api/signup" : "/api/login";
      const body = mode === "signup" ? { name, email, password } : { email, password, remember: document.getElementById("remember").checked };

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const data = await res.json();

      if (!res.ok) {
        showMsg(data.error || "Something went wrong. Please try again.", "error");
        return;
      }

      localStorage.setItem("dp-token", data.token);
      localStorage.setItem("dp-user", JSON.stringify(data.user));
      showMsg("Success! Redirecting to your dashboard…", "success");
      setTimeout(() => (window.location.href = "dashboard.html"), 600);
    } catch (err) {
      showMsg("Couldn't reach the server. Is it running? (npm start)", "error");
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = mode === "signup" ? "Sign Up" : "Log In";
    }
  });

  function showMsg(text, type) {
    formMsg.textContent = text;
    formMsg.className = `form-msg show ${type}`;
  }
  function hideMsg() {
    formMsg.className = "form-msg";
  }
})();
