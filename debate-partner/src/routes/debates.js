const express = require("express");
const { z } = require("zod");
const rateLimit = require("express-rate-limit");
const { query, pool } = require("../db");
const config = require("../config");
const { getProvider } = require("../llm");
const svc = require("../debateService");
const { HttpError, wrap, requireAuth, validate } = require("../middleware");

const router = express.Router();
router.use(requireAuth);

const msgLimiter = rateLimit({ windowMs: 60 * 1000, limit: 20, keyGenerator: (req) => `u${req.user.id}`, standardHeaders: true, legacyHeaders: false,
  message: { error: "You're sending messages too quickly. Slow down a little." } });

const idParam = (req) => { const n = Number(req.params.id); if (!Number.isInteger(n) || n < 1) throw new HttpError(404, "Debate not found."); return n; };

async function loadDebate(req) {
  const { rows } = await query("SELECT * FROM debates WHERE id=$1 AND user_id=$2", [idParam(req), req.user.id]);
  if (!rows[0]) throw new HttpError(404, "Debate not found.");
  return rows[0];
}
const fmtDebate = (d) => ({ id: d.id, topic: d.topic, userSide: d.user_side, difficulty: d.difficulty, maxTurns: d.max_turns,
  documentId: d.document_id, status: d.status, result: d.result, score: d.score === null ? null : Number(d.score),
  provider: d.provider, model: d.model, startedAt: d.started_at, endedAt: d.ended_at });
const fmtEval = (e) => e && ({ winner: e.winner, overall: Number(e.overall), scores: { argumentStrength: Number(e.argument_strength), evidence: Number(e.evidence),
  rebuttal: Number(e.rebuttal), clarity: Number(e.clarity), structure: Number(e.structure) }, confidence: e.confidence,
  strengths: e.strengths, weaknesses: e.weaknesses, summary: e.summary, degraded: e.degraded });

// ---- list / search ----
router.get("/", validate(z.object({
  q: z.string().trim().max(100).optional(), status: z.enum(["active", "completed"]).optional(),
  page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(50).default(15)
}), "query"), wrap(async (req, res) => {
  const { q, status, page, pageSize } = req.query;
  const where = ["user_id=$1"]; const params = [req.user.id];
  if (q) { params.push(`%${q.replace(/[%_\\]/g, "\\$&")}%`); where.push(`topic ILIKE $${params.length}`); }
  if (status) { params.push(status); where.push(`status=$${params.length}`); }
  const w = where.join(" AND ");
  const total = (await query(`SELECT count(*)::int c FROM debates WHERE ${w}`, params)).rows[0].c;
  params.push(pageSize, (page - 1) * pageSize);
  const { rows } = await query(`SELECT d.*, (SELECT count(*)::int FROM messages m WHERE m.debate_id=d.id AND m.role='user') AS user_turns
    FROM debates d WHERE ${w} ORDER BY started_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`, params);
  res.json({ total, page, pageSize, debates: rows.map((d) => ({ ...fmtDebate(d), userTurns: d.user_turns })) });
}));

// ---- create ----
router.post("/", validate(z.object({
  topic: z.string().trim().min(8, "must be at least 8 characters").max(300),
  side: z.enum(["for", "against"]),
  difficulty: z.enum(["easy", "medium", "hard"]),
  maxTurns: z.number().int().min(1).max(10),
  documentId: z.number().int().positive().nullable().optional()
})), wrap(async (req, res) => {
  const b = req.body;
  if (b.documentId) {
    const d = await query("SELECT 1 FROM documents WHERE id=$1 AND user_id=$2", [b.documentId, req.user.id]);
    if (!d.rows[0]) throw new HttpError(400, "documentId: document not found.");
  }
  const active = (await query("SELECT count(*)::int c FROM debates WHERE user_id=$1 AND status='active'", [req.user.id])).rows[0].c;
  if (active >= 5) throw new HttpError(409, "You have 5 unfinished debates. Finish or delete one before starting another.");
  const provider = getProvider();
  const { rows } = await query(
    `INSERT INTO debates(user_id,topic,user_side,difficulty,max_turns,document_id,provider,model) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [req.user.id, b.topic, b.side, b.difficulty, b.maxTurns, b.documentId || null, provider.name, provider.model]);
  res.status(201).json({ debate: fmtDebate(rows[0]) });
}));

// ---- read one ----
router.get("/:id", wrap(async (req, res) => {
  const d = await loadDebate(req);
  const msgs = (await query("SELECT id,role,content,created_at FROM messages WHERE debate_id=$1 ORDER BY id", [d.id])).rows;
  const ev = (await query("SELECT * FROM evaluations WHERE debate_id=$1", [d.id])).rows[0];
  res.json({ debate: fmtDebate(d), messages: msgs.map((m) => ({ id: m.id, role: m.role, content: m.content, createdAt: m.created_at })),
    userTurns: msgs.filter((m) => m.role === "user").length, evaluation: fmtEval(ev) || null });
}));

// ---- send a turn; AI reply streams back as Server-Sent Events ----
router.post("/:id/messages", msgLimiter,
  validate(z.object({ content: z.string().trim().min(1, "can't be empty").max(4000, "is too long (max 4000 characters)") })),
  wrap(async (req, res) => {
    const d = await loadDebate(req);
    if (d.status !== "active") throw new HttpError(409, "This debate has already finished.");
    const prior = (await query("SELECT role,content FROM messages WHERE debate_id=$1 ORDER BY id", [d.id])).rows;
    const userTurns = prior.filter((m) => m.role === "user").length;
    if (userTurns >= d.max_turns) throw new HttpError(409, "All turns are used. Finish the debate to get your evaluation.");
    if (prior.length && prior[prior.length - 1].role === "user") {
      await query("DELETE FROM messages WHERE debate_id=$1 AND id=(SELECT max(id) FROM messages WHERE debate_id=$1)", [d.id]); // dangling turn from an earlier failure
      prior.pop();
    }
    const provider = getProvider();
    const turn = userTurns + 1;
    let docText = null;
    if (d.document_id) docText = (await query("SELECT content FROM documents WHERE id=$1", [d.document_id])).rows[0]?.content || null;

    const userMsg = (await query("INSERT INTO messages(debate_id,role,content) VALUES($1,'user',$2) RETURNING id", [d.id, req.body.content])).rows[0];

    res.writeHead(200, { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" });
    const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    send("start", { userMessageId: userMsg.id, turn, maxTurns: d.max_turns });

    const ac = new AbortController();
    let clientGone = false;
    res.on("close", () => { if (!res.writableEnded) { clientGone = true; ac.abort(); } });
    const signal = AbortSignal.any([ac.signal, AbortSignal.timeout(config.llm.timeoutMs)]);

    let full = "";
    try {
      const history = [...prior, { role: "user", content: req.body.content }].map((m) => ({ role: m.role, content: m.content }));
      for await (const delta of provider.stream({ system: svc.buildSystemPrompt(d, docText, turn), messages: history, maxTokens: 700, signal })) {
        full += delta;
        send("delta", { text: delta });
      }
      if (!full.trim()) throw new Error("The AI returned an empty response.");
      const ai = (await query("INSERT INTO messages(debate_id,role,content) VALUES($1,'assistant',$2) RETURNING id", [d.id, full.trim()])).rows[0];
      send("done", { messageId: ai.id, turn, maxTurns: d.max_turns, canContinue: turn < d.max_turns });
    } catch (e) {
      // Roll back this turn so the user can resend the same message.
      await query("DELETE FROM messages WHERE id=$1", [userMsg.id]).catch(() => {});
      if (!clientGone) {
        console.error("[debate] AI stream failed:", e.message);
        send("error", { error: "The AI opponent couldn't respond right now. Your message wasn't counted — please try again." });
      }
    }
    res.end();
  }));

// ---- finish & evaluate ----
router.post("/:id/finish", rateLimit({ windowMs: 60000, limit: 10, keyGenerator: (r) => `u${r.user.id}`, message: { error: "Too many requests." } }),
  wrap(async (req, res) => {
    const d = await loadDebate(req);
    if (d.status === "completed") {
      const ev = (await query("SELECT * FROM evaluations WHERE debate_id=$1", [d.id])).rows[0];
      return res.json({ debate: fmtDebate(d), evaluation: fmtEval(ev), newAchievements: [] });
    }
    const msgs = (await query("SELECT role,content FROM messages WHERE debate_id=$1 ORDER BY id", [d.id])).rows;
    if (!msgs.some((m) => m.role === "user")) throw new HttpError(400, "Make at least one argument before finishing the debate.");

    const ev = await svc.evaluate(d, msgs);
    const result = ev.winner === "user" ? "Won" : ev.winner === "ai" ? "Lost" : "Draw";
    const client = await pool.connect();
    let updated;
    try {
      await client.query("BEGIN");
      updated = (await client.query("UPDATE debates SET status='completed', result=$2, score=$3, ended_at=now() WHERE id=$1 AND status='active' RETURNING *", [d.id, result, ev.overall])).rows[0];
      if (updated) {
        await client.query(`INSERT INTO evaluations(debate_id,winner,overall,argument_strength,evidence,rebuttal,clarity,structure,confidence,strengths,weaknesses,summary,degraded)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
          [d.id, ev.winner, ev.overall, ev.argument_strength, ev.evidence, ev.rebuttal, ev.clarity, ev.structure, ev.confidence,
            JSON.stringify(ev.strengths), JSON.stringify(ev.weaknesses), ev.summary, ev.degraded]);
      }
      await client.query("COMMIT");
    } catch (e) { await client.query("ROLLBACK"); throw e; } finally { client.release(); }

    const stored = (await query("SELECT * FROM evaluations WHERE debate_id=$1", [d.id])).rows[0];
    const fresh = updated ? await svc.awardAchievements(req.user.id) : [];
    res.json({ debate: fmtDebate(updated || (await loadDebate(req))), evaluation: fmtEval(stored), newAchievements: fresh });
  }));

router.delete("/:id", wrap(async (req, res) => {
  const d = await loadDebate(req);
  await query("DELETE FROM debates WHERE id=$1", [d.id]);
  res.json({ ok: true });
}));

module.exports = router;
