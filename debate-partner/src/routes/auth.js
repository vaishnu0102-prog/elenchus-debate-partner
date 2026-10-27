const express = require("express");
const bcrypt = require("bcryptjs");
const { z } = require("zod");
const rateLimit = require("express-rate-limit");
const { query } = require("../db");
const config = require("../config");
const { hashToken, makeToken, HttpError, wrap, requireAuth, validate } = require("../middleware");

const router = express.Router();
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: config.isProd ? 20 : 200, standardHeaders: true, legacyHeaders: false,
  message: { error: "Too many attempts. Please wait a few minutes and try again." } });

const email = z.string().trim().toLowerCase().email("must be a valid email").max(200);
const password = z.string().min(8, "must be at least 8 characters").max(200);

const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email, bio: u.bio || "", defaultDifficulty: u.default_difficulty || "medium", defaultTurns: u.default_turns || 4, createdAt: u.created_at });

async function startSession(userId, days) {
  const token = makeToken();
  await query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2, now() + ($3 || ' days')::interval)", [hashToken(token), userId, String(days)]);
  await query("DELETE FROM sessions WHERE expires_at < now()");
  return token;
}

router.post("/signup", authLimiter,
  validate(z.object({ name: z.string().trim().min(1, "is required").max(80), email, password })),
  wrap(async (req, res) => {
    const { name, email: em, password: pw } = req.body;
    const hash = await bcrypt.hash(pw, 11);
    let user;
    try {
      user = (await query("INSERT INTO users(name,email,password_hash) VALUES($1,$2,$3) RETURNING *", [name, em, hash])).rows[0];
    } catch (e) {
      if (e.code === "23505") throw new HttpError(409, "An account with this email already exists.");
      throw e;
    }
    res.status(201).json({ token: await startSession(user.id, config.sessionDays), user: publicUser(user) });
  }));

router.post("/login", authLimiter,
  validate(z.object({ email, password: z.string().min(1).max(200), remember: z.boolean().optional() })),
  wrap(async (req, res) => {
    const { email: em, password: pw, remember } = req.body;
    const user = (await query("SELECT * FROM users WHERE lower(email)=lower($1)", [em])).rows[0];
    // Always run a bcrypt compare so response time doesn't reveal whether the account exists.
    const ok = await bcrypt.compare(pw, user ? user.password_hash : "$2a$11$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvali");
    if (!user || !ok) throw new HttpError(401, "Incorrect email or password.");
    res.json({ token: await startSession(user.id, remember ? config.rememberDays : config.sessionDays), user: publicUser(user) });
  }));

router.post("/logout", requireAuth, wrap(async (req, res) => {
  await query("DELETE FROM sessions WHERE token_hash=$1", [req.tokenHash]);
  res.json({ ok: true });
}));

router.get("/me", requireAuth, (req, res) => res.json({ user: publicUser(req.user) }));

router.put("/me", requireAuth,
  validate(z.object({
    name: z.string().trim().min(1).max(80).optional(),
    bio: z.string().trim().max(300).optional(),
    defaultDifficulty: z.enum(["easy", "medium", "hard"]).optional(),
    defaultTurns: z.number().int().min(1).max(10).optional()
  })),
  wrap(async (req, res) => {
    const b = req.body;
    const { rows } = await query(
      `UPDATE users SET name=COALESCE($2,name), bio=COALESCE($3,bio),
              default_difficulty=COALESCE($4,default_difficulty), default_turns=COALESCE($5,default_turns)
        WHERE id=$1 RETURNING *`,
      [req.user.id, b.name ?? null, b.bio ?? null, b.defaultDifficulty ?? null, b.defaultTurns ?? null]);
    res.json({ user: publicUser(rows[0]) });
  }));

router.post("/me/password", requireAuth, authLimiter,
  validate(z.object({ currentPassword: z.string().min(1), newPassword: password })),
  wrap(async (req, res) => {
    const { rows } = await query("SELECT password_hash FROM users WHERE id=$1", [req.user.id]);
    if (!(await bcrypt.compare(req.body.currentPassword, rows[0].password_hash))) throw new HttpError(401, "Current password is incorrect.");
    await query("UPDATE users SET password_hash=$2 WHERE id=$1", [req.user.id, await bcrypt.hash(req.body.newPassword, 11)]);
    await query("DELETE FROM sessions WHERE user_id=$1 AND token_hash<>$2", [req.user.id, req.tokenHash]); // sign out other devices
    res.json({ ok: true });
  }));

router.delete("/me", requireAuth, authLimiter,
  validate(z.object({ password: z.string().min(1) })),
  wrap(async (req, res) => {
    const { rows } = await query("SELECT password_hash FROM users WHERE id=$1", [req.user.id]);
    if (!(await bcrypt.compare(req.body.password, rows[0].password_hash))) throw new HttpError(401, "Password is incorrect.");
    await query("DELETE FROM users WHERE id=$1", [req.user.id]);
    res.json({ ok: true });
  }));

module.exports = router;
