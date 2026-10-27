(function () {
  const root = document.documentElement;
  const saved = localStorage.getItem("dp-theme") || "dark";
  root.setAttribute("data-theme", saved);

  window.addEventListener("DOMContentLoaded", () => {
    const toggle = document.getElementById("themeToggle");
    if (!toggle) return;
    updateKnob(toggle, saved);

    toggle.addEventListener("click", () => {
      const current = root.getAttribute("data-theme");
      const next = current === "dark" ? "light" : "dark";
      root.setAttribute("data-theme", next);
      localStorage.setItem("dp-theme", next);
      updateKnob(toggle, next);
    });
  });

  function updateKnob(toggle, theme) {
    const knob = toggle.querySelector(".knob");
    if (knob) knob.textContent = theme === "dark" ? "🌙" : "☀️";
  }
})();
