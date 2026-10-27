const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");
const config = require("./config");

const pool = new Pool({ connectionString: config.databaseUrl, max: 10 });
pool.on("error", (err) => console.error("[db] idle client error:", err.message));

const query = (text, params) => pool.query(text, params);

// Minimal forward-only migration runner (db/migrations/*.sql, applied in order, each in a transaction).
async function migrate() {
  await query(`CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  const dir = path.join(__dirname, "..", "db", "migrations");
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  const done = new Set((await query("SELECT name FROM schema_migrations")).rows.map((r) => r.name));
  for (const f of files) {
    if (done.has(f)) continue;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(fs.readFileSync(path.join(dir, f), "utf8"));
      await client.query("INSERT INTO schema_migrations(name) VALUES($1)", [f]);
      await client.query("COMMIT");
      console.log(`[db] applied migration ${f}`);
    } catch (e) {
      await client.query("ROLLBACK");
      throw new Error(`Migration ${f} failed: ${e.message}`);
    } finally {
      client.release();
    }
  }
}

module.exports = { pool, query, migrate };
