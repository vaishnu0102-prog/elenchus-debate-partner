require("dotenv").config({ quiet: true });

const env = process.env;
const isProd = env.NODE_ENV === "production";

function pickProvider() {
  const p = (env.LLM_PROVIDER || "").toLowerCase();

  if (p) return p;
  if (env.ANTHROPIC_API_KEY) return "anthropic";
  if (env.OPENAI_API_KEY) return "openai";

  return "mock";
}

const provider = pickProvider();

const defaultModels = {
  anthropic: "claude-sonnet-5-5",
  openai: "gpt-4o-mini",
  ollama: "llama3.2:1b",
  mock: "mock-debater-1"
};

module.exports = {
  isProd,

  port: env.PORT !== undefined && env.PORT !== ""
    ? Number(env.PORT)
    : 3000,

  databaseUrl: env.DATABASE_URL || "postgres://dp:dp@localhost:5432/debatex",

  sessionDays: Number(env.SESSION_DAYS) || 7,
  rememberDays: Number(env.REMEMBER_DAYS) || 30,

  seedDemo: env.SEED_DEMO
    ? env.SEED_DEMO === "true"
    : !isProd,

  llm: {
    provider,

    model: env.LLM_MODEL || defaultModels[provider] || "unknown",

    apiKey: provider === "anthropic"
      ? env.ANTHROPIC_API_KEY
      : provider === "openai"
        ? env.OPENAI_API_KEY
        : undefined,

    baseUrl: env.LLM_BASE_URL ||
      (provider === "openai"
        ? "https://api.openai.com/v1"
        : provider === "anthropic"
          ? "https://api.anthropic.com"
          : "http://127.0.0.1:11434"),

    timeoutMs: Number(env.LLM_TIMEOUT_MS) || 90000
  },

  maxUploadBytes: 5 * 1024 * 1024,
  maxDocChars: 60000
};
