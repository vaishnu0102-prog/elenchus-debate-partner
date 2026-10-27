const crypto = require("crypto");
const { ZodError } = require("zod");
const { query } = require("./db");

const hashToken = (t) => crypto.createHash("sha256").update(t).digest("hex");
const makeToken = () => crypto.randomBytes(32).toString("hex");

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

async function requireAuth(req, res, next) {
  try {
    const h = req.headers.authorization || "";
    const token = h.startsWith("Bearer ") ? h.slice(7) : null;
    if (!token) throw new HttpError(401, "Not authenticated. Please log in again.");
    const { rows } = await query(
      `SELECT u.id,u.name,u.email,u.bio,u.default_difficulty,u.default_turns,u.created_at
         FROM sessions s JOIN users u ON u.id=s.user_id
        WHERE s.token_hash=$1 AND s.expires_at > now()`, [hashToken(token)]);
    if (!rows[0]) throw new HttpError(401, "Session expired. Please log in again.");
    req.user = rows[0];
    req.tokenHash = hashToken(token);
    next();
  } catch (e) { next(e); }
}

const validate = (schema, where = "body") => (req, res, next) => {
  try { req[where] = schema.parse(req[where]); next(); }
  catch (e) { next(e); }
};

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err instanceof ZodError) {
    const first = err.issues[0];
    const field = first.path.join(".");
    return res.status(400).json({ error: field ? `${field}: ${first.message}` : first.message, issues: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })) });
  }
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
  if (err.code === "LIMIT_FILE_SIZE") return res.status(413).json({ error: "File too large (max 5 MB)." });
  if (err.type === "entity.parse.failed") return res.status(400).json({ error: "Malformed JSON body." });
  if (err.type === "entity.too.large") return res.status(413).json({ error: "Request body too large." });
  console.error("[error]", req.method, req.originalUrl, err);
  if (res.headersSent) return res.end();
  res.status(500).json({ error: "Something went wrong on the server." });
}

module.exports = { hashToken, makeToken, HttpError, wrap, requireAuth, validate, errorHandler };
