const express = require("express");
const multer = require("multer");
const { z } = require("zod");
const { query } = require("../db");
const config = require("../config");
const svc = require("../debateService");
const { HttpError, wrap, requireAuth, validate } = require("../middleware");

const router = express.Router();

// ---------- public ----------
router.get("/system", (req, res) => res.json({ provider: config.llm.provider, model: config.llm.model, demoAi: config.llm.provider === "mock", demoLogin: config.seedDemo }));

router.get("/topics", requireAuth, validate(z.object({
  q: z.string().trim().max(100).optional(),
  category: z.string().trim().max(50).optional(),
  difficulty: z.enum(["Easy", "Medium", "Hard"]).optional()
}), "query"), wrap(async (req, res) => {
  const { q, category, difficulty } = req.query;
  const where = ["true"]; const p = [];
  if (q) { p.push(`%${q.replace(/[%_\\]/g, "\\$&")}%`); where.push(`title ILIKE $${p.length}`); }
  if (category) { p.push(category); where.push(`category=$${p.length}`); }
  if (difficulty) { p.push(difficulty); where.push(`difficulty=$${p.length}`); }
  const { rows } = await query(`SELECT id,title,category,difficulty,trending FROM topics WHERE ${where.join(" AND ")} ORDER BY trending DESC, title`, p);
  const cats = (await query("SELECT DISTINCT category FROM topics ORDER BY category")).rows.map((r) => r.category);
  res.json({ topics: rows, categories: cats });
}));

// ---------- dashboard ----------
router.get("/dashboard", requireAuth, wrap(async (req, res) => {
  const uid = req.user.id;
  const stats = await svc.userStats(uid);
  const perf = (await query(`SELECT id, score::float, ended_at FROM debates WHERE user_id=$1 AND status='completed' ORDER BY ended_at DESC LIMIT 10`, [uid])).rows.reverse();
  const recent = (await query(`SELECT id,topic,result,score::float,ended_at FROM debates WHERE user_id=$1 AND status='completed' ORDER BY ended_at DESC LIMIT 5`, [uid])).rows;
  const active = (await query(`SELECT id,topic,started_at FROM debates WHERE user_id=$1 AND status='active' ORDER BY started_at DESC LIMIT 3`, [uid])).rows;
  const evs = (await query(`SELECT e.strengths,e.weaknesses,e.confidence FROM evaluations e JOIN debates d ON d.id=e.debate_id WHERE d.user_id=$1 ORDER BY e.created_at DESC LIMIT 5`, [uid])).rows;
  const uniq = (arr) => [...new Set(arr)].slice(0, 4);
  const trending = (await query(`SELECT id,title,category,difficulty FROM topics WHERE trending ORDER BY id LIMIT 4`)).rows;
  const unlocked = new Map((await query("SELECT key,unlocked_at FROM user_achievements WHERE user_id=$1", [uid])).rows.map((r) => [r.key, r.unlocked_at]));
  const xp = stats.completed * 100 + Math.round((stats.avg_score || 0) * stats.completed * 10);
  res.json({
    user: { id: req.user.id, name: req.user.name, email: req.user.email },
    stats: { debatesCompleted: stats.completed, winRate: stats.completed ? Math.round((stats.wins / stats.completed) * 100) : 0,
      aiScore: stats.completed ? stats.avg_score : null, practiceHours: stats.practiceHours, streak: stats.streak },
    level: { level: Math.floor(xp / 500) + 1, xp, progressPct: Math.round(((xp % 500) / 500) * 100) },
    performance: perf.map((r, i) => ({ label: new Date(r.ended_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" }), score: r.score, id: r.id, n: i + 1 })),
    recentDebates: recent.map((r) => ({ id: r.id, topic: r.topic, result: r.result, score: r.score, date: r.ended_at })),
    activeDebates: active.map((r) => ({ id: r.id, topic: r.topic, startedAt: r.started_at })),
    feedback: evs.length ? { strengths: uniq(evs.flatMap((e) => e.strengths)), weaknesses: uniq(evs.flatMap((e) => e.weaknesses)),
      confidence: Math.round(evs.reduce((a, e) => a + e.confidence, 0) / evs.length) } : null,
    trendingTopics: trending,
    achievements: svc.ACHIEVEMENTS.map((a) => ({ key: a.key, label: a.label, unlocked: unlocked.has(a.key) }))
  });
}));

// ---------- AI feedback overview ----------
router.get("/feedback", requireAuth, wrap(async (req, res) => {
  const uid = req.user.id;
  const avg = (await query(`SELECT count(*)::int n, avg(argument_strength)::float a, avg(evidence)::float e, avg(rebuttal)::float r, avg(clarity)::float c, avg(structure)::float s
    FROM evaluations e JOIN debates d ON d.id=e.debate_id WHERE d.user_id=$1 AND NOT e.degraded`, [uid])).rows[0];
  const list = (await query(`SELECT d.id,d.topic,d.result,e.overall::float,e.summary,e.strengths,e.weaknesses,e.degraded,d.ended_at
    FROM evaluations e JOIN debates d ON d.id=e.debate_id WHERE d.user_id=$1 ORDER BY e.created_at DESC LIMIT 20`, [uid])).rows;
  const r1 = (n) => (n === null ? null : Math.round(n * 10) / 10);
  res.json({
    averages: avg.n ? { argumentStrength: r1(avg.a), evidence: r1(avg.e), rebuttal: r1(avg.r), clarity: r1(avg.c), structure: r1(avg.s) } : null,
    evaluations: list.map((x) => ({ debateId: x.id, topic: x.topic, result: x.result, overall: x.overall, summary: x.summary, strengths: x.strengths, weaknesses: x.weaknesses, degraded: x.degraded, date: x.ended_at }))
  });
}));

// ---------- leaderboard ----------
router.get("/leaderboard", requireAuth, wrap(async (req, res) => {
  const { rows } = await query(`
    SELECT u.id, u.name, count(*)::int debates, count(*) FILTER (WHERE d.result='Won')::int wins,
           round(avg(d.score),2)::float avg_score
      FROM users u JOIN debates d ON d.user_id=u.id AND d.status='completed'
     GROUP BY u.id ORDER BY avg_score DESC, wins DESC, debates DESC, u.id LIMIT 50`);
  const short = (n) => { const p = n.trim().split(/\s+/); return p.length > 1 ? `${p[0]} ${p[p.length - 1][0]}.` : p[0]; };
  const board = rows.map((r, i) => ({ rank: i + 1, name: short(r.name), debates: r.debates, wins: r.wins, avgScore: r.avg_score, you: r.id === req.user.id }));
  res.json({ leaderboard: board, you: board.find((b) => b.you) || null });
}));

// ---------- global search ----------
router.get("/search", requireAuth, validate(z.object({ q: z.string().trim().min(1).max(100) }), "query"), wrap(async (req, res) => {
  const like = `%${req.query.q.replace(/[%_\\]/g, "\\$&")}%`;
  const topics = (await query("SELECT id,title,category,difficulty FROM topics WHERE title ILIKE $1 OR category ILIKE $1 ORDER BY trending DESC LIMIT 10", [like])).rows;
  const debates = (await query("SELECT id,topic,status,result,score::float FROM debates WHERE user_id=$1 AND topic ILIKE $2 ORDER BY started_at DESC LIMIT 10", [req.user.id, like])).rows;
  const fb = (await query(`SELECT d.id,d.topic,e.summary FROM evaluations e JOIN debates d ON d.id=e.debate_id
      WHERE d.user_id=$1 AND (e.summary ILIKE $2 OR e.strengths::text ILIKE $2 OR e.weaknesses::text ILIKE $2) LIMIT 10`, [req.user.id, like])).rows;
  res.json({ topics, debates, feedback: fb });
}));

// ---------- notifications (derived from real events) ----------
router.get("/notifications", requireAuth, wrap(async (req, res) => {
  const uid = req.user.id;
  const ach = (await query("SELECT key,unlocked_at FROM user_achievements WHERE user_id=$1 ORDER BY unlocked_at DESC LIMIT 5", [uid])).rows;
  const deb = (await query("SELECT id,topic,result,score::float,ended_at FROM debates WHERE user_id=$1 AND status='completed' ORDER BY ended_at DESC LIMIT 5", [uid])).rows;
  const label = new Map(svc.ACHIEVEMENTS.map((a) => [a.key, a.label]));
  const items = [
    ...ach.map((a) => ({ type: "achievement", text: `Achievement unlocked: ${label.get(a.key) || a.key}`, at: a.unlocked_at, href: "dashboard.html" })),
    ...deb.map((d) => ({ type: "debate", text: `${d.result} — ${d.topic} (${d.score}/10)`, at: d.ended_at, href: `debate.html?id=${d.id}` }))
  ].sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, 8);
  res.json({ notifications: items });
}));

// ---------- documents (reference material for a debate) ----------
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: config.maxUploadBytes, files: 1 } });
const ALLOWED = { ".txt": "text/plain", ".md": "text/markdown", ".pdf": "application/pdf" };

router.post("/documents", requireAuth, upload.single("file"), wrap(async (req, res) => {
  if (!req.file) throw new HttpError(400, "Choose a file to upload.");
  const name = req.file.originalname.replace(/[^\w.\- ]+/g, "_").slice(0, 120);
  const ext = (name.match(/\.[a-z0-9]+$/i) || [""])[0].toLowerCase();
  if (!ALLOWED[ext]) throw new HttpError(400, "Only .txt, .md and .pdf files are supported.");
  const count = (await query("SELECT count(*)::int c FROM documents WHERE user_id=$1", [req.user.id])).rows[0].c;
  if (count >= 20) throw new HttpError(409, "You've reached the 20-document limit. Delete one first.");

  let text;
  if (ext === ".pdf") {
    if (req.file.buffer.slice(0, 5).toString() !== "%PDF-") throw new HttpError(400, "That file isn't a valid PDF.");
    try {
      const { PDFParse } = require("pdf-parse");
      const parser = new PDFParse({ data: new Uint8Array(req.file.buffer) });
      text = (await parser.getText()).text;
      await parser.destroy?.();
    } catch (e) {
      throw new HttpError(422, "Couldn't read text from that PDF (it may be scanned or encrypted).");
    }
  } else {
    text = req.file.buffer.toString("utf8");
  }
  text = text.replace(/\u0000/g, "").replace(/\r\n/g, "\n").trim().slice(0, config.maxDocChars);
  if (text.length < 20) throw new HttpError(422, "No readable text found in that file.");
  const { rows } = await query(`INSERT INTO documents(user_id,filename,mime,size_bytes,content) VALUES($1,$2,$3,$4,$5) RETURNING id,filename,size_bytes,created_at`,
    [req.user.id, name, ALLOWED[ext], req.file.size, text]);
  res.status(201).json({ document: { id: rows[0].id, filename: rows[0].filename, sizeBytes: rows[0].size_bytes, chars: text.length, createdAt: rows[0].created_at } });
}));

router.get("/documents", requireAuth, wrap(async (req, res) => {
  const { rows } = await query("SELECT id,filename,size_bytes,length(content) chars,created_at FROM documents WHERE user_id=$1 ORDER BY created_at DESC", [req.user.id]);
  res.json({ documents: rows.map((r) => ({ id: r.id, filename: r.filename, sizeBytes: r.size_bytes, chars: r.chars, createdAt: r.created_at })) });
}));

router.delete("/documents/:id", requireAuth, wrap(async (req, res) => {
  const r = await query("DELETE FROM documents WHERE id=$1 AND user_id=$2", [Number(req.params.id) || 0, req.user.id]);
  if (!r.rowCount) throw new HttpError(404, "Document not found.");
  res.json({ ok: true });
}));

module.exports = router;
