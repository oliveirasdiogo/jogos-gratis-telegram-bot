CREATE TABLE IF NOT EXISTS access_control (
  chat_id TEXT PRIMARY KEY,
  username TEXT,
  first_name TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'denied')),
  requested_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_at TEXT,
  reviewed_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_access_control_status
  ON access_control(status, requested_at);

-- Preserva o acesso de quem já utilizava o bot antes desta atualização.
INSERT OR IGNORE INTO access_control (
  chat_id,
  username,
  first_name,
  status,
  requested_at,
  reviewed_at,
  reviewed_by
)
SELECT
  chat_id,
  username,
  first_name,
  'approved',
  created_at,
  CURRENT_TIMESTAMP,
  chat_id
FROM subscribers;
