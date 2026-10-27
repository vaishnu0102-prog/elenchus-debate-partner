const express = require("express");
const path = require("path");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const config = require("./src/config");
const { migrate, pool } = require("./src/db");
const { seed } = require("./src/seed");
const { errorHandler } = require("./src/middleware");

const app = express();
app.set("trust proxy", config.isProd ? 1 : false);

app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      "script-src": ["'self'", "https://cdn.jsdelivr.net"],
      "script-src-attr": ["'none'"],
      "style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      "font-src": ["'self'", "https://fonts.gstatic.com"],
      "img-src": ["'self'", "data:"],
      "connect-src": ["'self'"],
      "upgrade-insecure-requests": config.isProd ? [] : null
    }
  }
}));
app.use(express.json({ limit: "100kb" }));

app.use("/api", rateLimit({ windowMs: 60 * 1000, limit: 300, standardHeaders: true, legacyHeaders: false, message: { error: "Too many requests." } }));
app.use("/api", require("./src/routes/auth"));
app.use("/api/debates", require("./src/routes/debates"));
app.use("/api", require("./src/routes/misc"));
app.use("/api", (req, res) => res.status(404).json({ error: "Not found." }));

app.use(express.static(path.join(__dirname, "public"), { extensions: ["html"] }));
app.get("*", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));
app.use(errorHandler);

async function start() {
  await migrate();
  await seed();
  const server = app.listen(config.port, () => {
    console.log(`\n  Debate Partner running -> http://localhost:${config.port}`);
    console.log(`  AI provider: ${config.llm.provider} (${config.llm.model})${config.llm.provider === "mock" ? "  <-- OFFLINE DEMO AI: set ANTHROPIC_API_KEY or OPENAI_API_KEY in .env for real debates" : ""}`);
    if (config.seedDemo) console.log("  Demo login -> demo@debatepartner.ai / demo1234\n");
  });
  const shutdown = () => server.close(() => pool.end().then(() => process.exit(0)));
  process.on("SIGINT", shutdown); process.on("SIGTERM", shutdown);
  return server;
}

if (require.main === module) start().catch((e) => { console.error("\nFailed to start:", e.message); if (/ECONNREFUSED|password|does not exist/i.test(e.message)) console.error("Check DATABASE_URL in .env and that PostgreSQL is running (see README)."); process.exit(1); });
module.exports = { app, start };
