// Offline provider used when no API key is configured. It is NOT intelligent: it produces templated
// rebuttals that quote the user's own words, and heuristic evaluations. The UI labels it clearly.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function lastUser(messages) {
  for (let i = messages.length - 1; i >= 0; i--) if (messages[i].role === "user") return messages[i].content;
  return "";
}
function keyPhrase(text) {
  const sentences = text.split(/(?<=[.!?])\s+/).filter(Boolean);
  const s = (sentences[0] || text).replace(/\s+/g, " ").trim();
  return s.length > 140 ? s.slice(0, 137) + "…" : s;
}

module.exports = function mock({ model }) {
  return {
    name: "mock",
    model,
    async *stream({ system, messages }) {
      const user = lastUser(messages);
      const closing = /FINAL TURN/.test(system);
      const stance = (system.match(/YOUR STANCE: (.+)/) || [, "the opposing side"])[1];
      const parts = closing
        ? [
            `In closing, I maintain my position (${stance}). `,
            `You argued "${keyPhrase(user)}", but you never fully answered the strongest objections raised earlier. `,
            "Claims without evidence stay claims; the burden of proof remains unmet. ",
            "I rest my case on consistency, evidence, and real-world consequences."
          ]
        : [
            `Let me challenge that. You said "${keyPhrase(user)}" `,
            "— but what evidence supports it, and who bears the cost if you're wrong? ",
            `From my standpoint (${stance}), the strongest counter is that the trade-offs you describe are underestimated. `,
            "Respond to that directly: what is your best concrete example, and why does it generalise?"
          ];
      for (const p of parts) {
        await sleep(120);
        yield p;
      }
    },
    async complete({ system, messages }) {
      const transcript = messages.map((m) => m.content).join("\n");
      if (/Return ONLY a JSON object/.test(system)) {
        const userText = (transcript.match(/USER:[\s\S]*?(?=\nOPPONENT:|$)/g) || []).join(" ");
        const words = userText.split(/\s+/).filter(Boolean).length;
        const evidence = (userText.match(/\b(\d{2,4}%?|study|studies|research|data|according|evidence|example|for instance)\b/gi) || []).length;
        const rebut = (userText.match(/\b(however|but|although|you said|your claim|in contrast|counter)\b/gi) || []).length;
        const clamp = (n) => Math.max(1, Math.min(10, Math.round(n * 10) / 10));
        const turns = Math.max(1, (userText.match(/USER:/g) || []).length);
        const per = words / turns;
        const argument = clamp(3 + Math.min(per, 120) / 25);
        const ev = clamp(2.5 + evidence * 0.9);
        const rb = clamp(2.5 + rebut * 1.1);
        const cl = clamp(4 + Math.min(per, 100) / 30);
        const st = clamp(4 + turns * 0.6);
        const overall = clamp((argument + ev + rb + cl + st) / 5);
        return JSON.stringify({
          winner: overall >= 6.5 ? "user" : overall >= 5 ? "draw" : "ai",
          overall, argument_strength: argument, evidence: ev, rebuttal: rb, clarity: cl, structure: st,
          confidence: Math.round(overall * 10),
          strengths: [per > 40 ? "Developed, substantial arguments" : "Concise delivery", evidence ? "Referenced evidence or examples" : "Clear stance"],
          weaknesses: [evidence < 2 ? "Few concrete facts, studies or examples" : "Could cite sources more precisely", rebut < 2 ? "Rebut the opponent's points more directly" : "Anticipate counter-arguments earlier"],
          summary: "Heuristic evaluation (offline mock provider — set ANTHROPIC_API_KEY or OPENAI_API_KEY for real AI judging)."
        });
      }
      return "OK";
    }
  };
};
