const { readSSE } = require("./sse");

module.exports = function anthropic({ apiKey, model, baseUrl, timeoutMs }) {
  async function request(system, messages, maxTokens, stream, signal) {
    const res = await fetch(`${baseUrl.replace(/\/$/, "")}/v1/messages`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model, max_tokens: maxTokens, system, messages, stream }),
      signal: signal || AbortSignal.timeout(timeoutMs)
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Anthropic API ${res.status}: ${body.slice(0, 300)}`);
    }
    return res;
  }
  return {
    name: "anthropic",
    model,
    async *stream({ system, messages, maxTokens = 700, signal }) {
      const res = await request(system, messages, maxTokens, true, signal);
      for await (const data of readSSE(res)) {
        let ev;
        try { ev = JSON.parse(data); } catch { continue; }
        if (ev.type === "content_block_delta" && ev.delta && ev.delta.type === "text_delta") yield ev.delta.text;
        else if (ev.type === "error") throw new Error(ev.error?.message || "Anthropic stream error");
      }
    },
    async complete({ system, messages, maxTokens = 1200 }) {
      const res = await request(system, messages, maxTokens, false);
      const json = await res.json();
      return (json.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
    }
  };
};
