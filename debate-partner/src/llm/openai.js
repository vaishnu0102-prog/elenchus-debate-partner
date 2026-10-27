const { readSSE } = require("./sse");

// Works with OpenAI and any OpenAI-compatible endpoint (OpenRouter, Groq, Together, Ollama, ...) via LLM_BASE_URL.
module.exports = function openai({ apiKey, model, baseUrl, timeoutMs }) {
  async function request(system, messages, maxTokens, stream, signal) {
    const res = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, max_tokens: maxTokens, stream, messages: [{ role: "system", content: system }, ...messages] }),
      signal: signal || AbortSignal.timeout(timeoutMs)
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`LLM API ${res.status}: ${body.slice(0, 300)}`);
    }
    return res;
  }
  return {
    name: "openai",
    model,
    async *stream({ system, messages, maxTokens = 700, signal }) {
      const res = await request(system, messages, maxTokens, true, signal);
      for await (const data of readSSE(res)) {
        if (data === "[DONE]") return;
        let ev;
        try { ev = JSON.parse(data); } catch { continue; }
        const t = ev.choices && ev.choices[0] && ev.choices[0].delta && ev.choices[0].delta.content;
        if (t) yield t;
      }
    },
    async complete({ system, messages, maxTokens = 1200 }) {
      const res = await request(system, messages, maxTokens, false);
      const json = await res.json();
      return json.choices?.[0]?.message?.content || "";
    }
  };
};
