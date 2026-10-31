require("dotenv").config({ quiet: true });

const env = process.env;
const isProd = env.NODE_ENV === "production";

function pickProvider() {
  const p = (env.LLM_PROVIDER || "").toLowerCase();

  if (p) return p;
  if (env.GROQ_API_KEY) return "groq";
  if (env.GEMINI_API_KEY) return "gemini";
if (env.ANTHROPIC_API_KEY) return "anthropic";
if (env.OPENAI_API_KEY) return "openai";
  return "mock";
}

const provider = pickProvider();

const defaultModels = {
  groq: "openai/gpt-oss-20b",
  anthropic: "claude-sonnet-5-5",
  gemini: "gemini-3.8-flash",
  openai: "gpt-4o-mini",
  ollama: "llama3.2:1b",
  mock: "mock-debater-1"
};

module.exports = {
  isProd,

  port: env.PORT !== undefined && env.PORT !== ""
    ? Number(env.PORT)
    : 3000,

  databaseUrl: env.DATABASE_URL ||
  (isProd
    ? (() => { throw new Error("DATABASE_URL is required in production"); })()
    : "postgres://dp:dp@localhost:5432/debatex"),

  sessionDays: Number(env.SESSION_DAYS) || 7,
  rememberDays: Number(env.REMEMBER_DAYS) || 30,

  seedDemo: env.SEED_DEMO
    ? env.SEED_DEMO === "true"
    : !isProd,

  llm: {
    provider,

    model: env.LLM_MODEL || defaultModels[provider] || "unknown",

    apiKey: provider === "groq"
  ? env.GROQ_API_KEY
  : provider === "gemini"
    ? env.GEMINI_API_KEY
    : provider === "anthropic"
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
