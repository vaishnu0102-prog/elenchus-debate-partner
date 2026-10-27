module.exports = function createOllamaProvider(config) {
  const model = config.model || "llama3.2:1b";
  const baseUrl = (
    config.baseUrl || "http://127.0.0.1:11434"
  ).replace(/\/+$/, "");

  const timeoutMs = config.timeoutMs || 90000;

  async function generate({ system, messages }) {
    const formattedMessages = [];

    if (system) {
      formattedMessages.push({
        role: "system",
        content: system
      });
    }

    for (const message of messages || []) {
      if (
        message.role === "user" ||
        message.role === "assistant"
      ) {
        formattedMessages.push({
          role: message.role,
          content: String(message.content || "")
        });
      }
    }

    const controller = new AbortController();

    const timeout = setTimeout(() => {
      controller.abort();
    }, timeoutMs);

    try {
      const response = await fetch(baseUrl + "/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: model,
          messages: formattedMessages,
          stream: false
        }),
        signal: controller.signal
      });

      if (!response.ok) {
        const detail = await response.text();
        throw new Error(
          "Ollama HTTP " + response.status + ": " + detail
        );
      }

      const data = await response.json();

      if (
        !data.message ||
        typeof data.message.content !== "string"
      ) {
        throw new Error("Ollama returned an invalid response");
      }

      return data.message.content;
    } finally {
      clearTimeout(timeout);
    }
  }

  return {
    name: "ollama",
    model: model,

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