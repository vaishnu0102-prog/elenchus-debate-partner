
module.exports = function createGeminiProvider(config) {
  const model = config.model || "gemini-3.8-flash";
  const apiKey = config.apiKey;
  const timeoutMs = config.timeoutMs || 90000;

  async function generate({ system, messages }) {
    const contents = [];

    for (const message of messages || []) {
      if (
        message.role === "user" ||
        message.role === "assistant"
      ) {
        contents.push({
          role: message.role === "assistant" ? "model" : "user",
          parts: [{ text: String(message.content || "") }]
        });
      }
    }

    if (contents.length === 0) {
      throw new Error("Gemini requires at least one user message");
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": apiKey
          },
          body: JSON.stringify({
            ...(system
              ? { systemInstruction: { parts: [{ text: system }] } }
              : {}),
            contents,
            generationConfig: {
              temperature: 0.7
            }
          }),
          signal: controller.signal
        }
      );

      if (!response.ok) {
        const detail = await response.text();
        throw new Error(`Gemini HTTP ${response.status}: ${detail}`);
      }

      const data = await response.json();
      const answer = data.candidates?.[0]?.content?.parts
        ?.map((part) => part.text || "")
        .join("");

      if (typeof answer !== "string" || !answer.trim()) {
        throw new Error("Gemini returned an empty or invalid response");
      }

      return answer;
    } finally {
      clearTimeout(timeout);
    }
  }

  return {
    name: "gemini",
    model,

    async complete({ system, messages }) {
      return generate({ system, messages });
    },

    async *stream({ system, messages }) {
      const answer = await generate({ system, messages });
      const chunks = answer.match(/\S+\s*/g) || [answer];

      for (const chunk of chunks) {
        yield chunk;
      }
    }
  };
};
