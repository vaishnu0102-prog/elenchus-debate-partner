
const config = require("../config");

let cached;

function getProvider() {
  if (cached) return cached;

  const c = config.llm;

  if (c.provider === "ollama") {
    cached = require("./ollama")(c);

  } else if (c.provider === "groq") {
    if (!c.apiKey) {
      throw new Error(
        "LLM_PROVIDER=groq but GROQ_API_KEY is not set"
      );
    }

    cached = require("./openai")(c);

  } else if (c.provider === "gemini") {
    if (!c.apiKey) {
      throw new Error(
        "LLM_PROVIDER=gemini but GEMINI_API_KEY is not set"
      );
    }

    cached = require("./gemini")(c);

  } else if (c.provider === "anthropic") {
    if (!c.apiKey) {
      throw new Error(
        "LLM_PROVIDER=anthropic but ANTHROPIC_API_KEY is not set"
      );
    }

    cached = require("./anthropic")(c);

  } else if (c.provider === "openai") {
    if (!c.apiKey) {
      throw new Error(
        "LLM_PROVIDER=openai but OPENAI_API_KEY is not set"
      );
    }

    cached = require("./openai")(c);

  } else if (c.provider === "mock") {
    cached = require("./mock")(c);

  } else {
    throw new Error(
      `Unknown LLM_PROVIDER "${c.provider}" ` +
      "(use ollama, groq, gemini, anthropic, openai or mock)"
    );
  }

  return cached;
}

module.exports = { getProvider };
