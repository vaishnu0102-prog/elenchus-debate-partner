# Debate Partner (DebateX)

A full-stack AI debate practice platform. You pick a motion and a side, debate a streaming AI opponent
turn by turn, then an AI judge scores you. Everything on the dashboard is computed from your real debates.

**Stack:** Node.js + Express · PostgreSQL (`pg`, SQL migrations) · Server-Sent Events streaming ·
pluggable LLM provider (Anthropic, OpenAI-compatible, or an offline mock) · vanilla HTML/CSS/JS · Chart.js

## Run it (Windows / Mac / Linux)

1. **PostgreSQL** — either
   - Docker: `docker compose up -d` (matches the default settings), **or**
   - install PostgreSQL, then in `psql`/pgAdmin run:
     `CREATE USER dp WITH PASSWORD 'dp'; CREATE DATABASE debatex OWNER dp;`
2. In the project folder:
   ```
   npm install
   copy .env.example .env      (Mac/Linux: cp .env.example .env)
   ```
3. Edit `.env`: set `DATABASE_URL` if yours differs, and add an AI key:
   `ANTHROPIC_API_KEY=...` **or** `OPENAI_API_KEY=...`
4. `npm start` → open http://localhost:3000. Tables are created automatically on first start.

Demo login (dev only): `demo@debatepartner.ai` / `demo1234`. Set `SEED_DEMO=false` (automatic when `NODE_ENV=production`) to disable it.

> **No API key?** The app still runs with an **offline mock AI** (scripted replies, heuristic scoring) so you can try the whole flow. A banner makes this obvious. Add a key for real debates.

## AI providers (`.env`)

| Variable | Meaning |
|---|---|
| `LLM_PROVIDER` | `anthropic`, `openai` or `mock`. Empty = auto-detect from whichever key is set |
| `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` | credentials (never sent to the browser) |
| `LLM_MODEL` | override model (defaults: `claude-sonnet-5-5`, `gpt-4o-mini`) |
| `LLM_BASE_URL` | any OpenAI-compatible server (OpenRouter, Groq, local Ollama `http://localhost:11434/v1`) |

Add another provider by creating `src/llm/<name>.js` exposing `stream()` and `complete()` and registering it in `src/llm/index.js`.

## What's implemented

- **Auth:** bcrypt-hashed passwords, hashed expiring session tokens (7 days, 30 with "Remember me"), rate-limited login/signup, change password (signs out other devices), delete account.
- **Debate flow:** setup page (topic, side, difficulty, turns, optional reference document) → live room with token-by-token streaming, turn limit, timer → AI judge returns scores (argument, evidence, rebuttal, clarity, structure), winner, strengths/weaknesses, saved to the DB. Unfinished debates can be resumed. If the AI fails mid-turn the turn is rolled back so you can resend.
- **Documents:** upload `.txt`, `.md`, `.pdf` (5 MB); text is extracted and given to the AI as source material (isolated from instructions).
- **Dashboard & analytics:** stats, win rate, average score, practice hours, streak, XP/level, score-trend chart, recent debates, AI feedback and 7 achievements — all derived from your data (a new account shows empty states, not fake numbers).
- **Pages:** Dashboard, Start Debate, Debate room, History (search/filter/paginate/delete), AI Feedback (skill radar), Topics, Leaderboard, Profile, Settings, global Search, notifications bell.
- **Security:** parameterised SQL everywhere, zod validation, helmet + CSP, per-route rate limits, per-user data isolation, upload type/size checks, no secrets in the browser, XSS-safe rendering.

## Tests

`npm test` (needs PostgreSQL; no API key needed). Covers auth, validation, streaming, turn limits, evaluation, isolation between users,
uploads, failure/rollback paths, and the Anthropic/OpenAI streaming adapters (against local fake servers).

## Project layout

```
server.js                 app wiring, security middleware, startup
src/config.js             env config           src/db.js          pool + migration runner
src/seed.js               topics + legacy data.json account import
src/debateService.js      prompts, evaluation, achievements, stats
src/llm/                  provider abstraction (anthropic, openai, mock, SSE parser)
src/routes/               auth.js · debates.js (streaming) · misc.js (dashboard, topics, docs, leaderboard…)
db/migrations/            SQL migrations (applied automatically, in order)
public/                   pages + js/ + css/        test/    API & provider tests
data.json                 legacy file: only its accounts are imported (once); its fake stats are ignored
```

## Notes / known limits

- Used plain `pg` + SQL migrations instead of Prisma (see delivery notes); the schema is in `db/migrations/001_init.sql`.
- Password-reset-by-email is not implemented (needs an SMTP server); use Settings → Change password.
- Debates are text-based; there's no speech input yet.
- For production: set `NODE_ENV=production`, serve behind HTTPS, and use a strong `DATABASE_URL` password.
