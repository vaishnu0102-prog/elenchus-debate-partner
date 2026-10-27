CREATE TABLE users (
  id            SERIAL PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  bio           TEXT NOT NULL DEFAULT '',
  default_difficulty TEXT NOT NULL DEFAULT 'medium',
  default_turns INTEGER NOT NULL DEFAULT 4,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_email_lower_idx ON users (lower(email));

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX sessions_user_idx ON sessions (user_id);

CREATE TABLE topics (
  id         SERIAL PRIMARY KEY,
  title      TEXT NOT NULL UNIQUE,
  category   TEXT NOT NULL,
  difficulty TEXT NOT NULL CHECK (difficulty IN ('Easy','Medium','Hard')),
  trending   BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE documents (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  filename   TEXT NOT NULL,
  mime       TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  content    TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX documents_user_idx ON documents (user_id);

CREATE TABLE debates (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  topic       TEXT NOT NULL,
  user_side   TEXT NOT NULL CHECK (user_side IN ('for','against')),
  difficulty  TEXT NOT NULL CHECK (difficulty IN ('easy','medium','hard')),
  max_turns   INTEGER NOT NULL CHECK (max_turns BETWEEN 1 AND 10),
  document_id INTEGER REFERENCES documents(id) ON DELETE SET NULL,
  status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed')),
  result      TEXT CHECK (result IN ('Won','Lost','Draw')),
  score       NUMERIC(3,1),
  provider    TEXT,
  model       TEXT,
  started_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at    TIMESTAMPTZ
);
CREATE INDEX debates_user_idx ON debates (user_id, started_at DESC);

CREATE TABLE messages (
  id         SERIAL PRIMARY KEY,
  debate_id  INTEGER NOT NULL REFERENCES debates(id) ON DELETE CASCADE,
  role       TEXT NOT NULL CHECK (role IN ('user','assistant')),
  content    TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX messages_debate_idx ON messages (debate_id, id);

CREATE TABLE evaluations (
  id                SERIAL PRIMARY KEY,
  debate_id         INTEGER NOT NULL UNIQUE REFERENCES debates(id) ON DELETE CASCADE,
  winner            TEXT NOT NULL CHECK (winner IN ('user','ai','draw')),
  overall           NUMERIC(3,1) NOT NULL,
  argument_strength NUMERIC(3,1) NOT NULL,
  evidence          NUMERIC(3,1) NOT NULL,
  rebuttal          NUMERIC(3,1) NOT NULL,
  clarity           NUMERIC(3,1) NOT NULL,
  structure         NUMERIC(3,1) NOT NULL,
  confidence        INTEGER NOT NULL,
  strengths         JSONB NOT NULL DEFAULT '[]',
  weaknesses        JSONB NOT NULL DEFAULT '[]',
  summary           TEXT NOT NULL DEFAULT '',
  degraded          BOOLEAN NOT NULL DEFAULT false,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE user_achievements (
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key         TEXT NOT NULL,
  unlocked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, key)
);
