PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS subscribers (
  chat_id TEXT PRIMARY KEY,
  username TEXT,
  first_name TEXT,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS subscriber_platforms (
  chat_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  PRIMARY KEY (chat_id, platform),
  FOREIGN KEY (chat_id) REFERENCES subscribers(chat_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS giveaways (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL,
  source_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  platforms_json TEXT NOT NULL,
  worth TEXT,
  thumbnail_url TEXT,
  giveaway_url TEXT NOT NULL,
  source_url TEXT NOT NULL,
  published_at TEXT,
  ends_at TEXT,
  first_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  UNIQUE (source, source_id)
);

CREATE TABLE IF NOT EXISTS notifications (
  chat_id TEXT NOT NULL,
  giveaway_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent')),
  attempts INTEGER NOT NULL DEFAULT 1,
  claimed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  sent_at TEXT,
  last_error TEXT,
  PRIMARY KEY (chat_id, giveaway_id),
  FOREIGN KEY (chat_id) REFERENCES subscribers(chat_id) ON DELETE CASCADE,
  FOREIGN KEY (giveaway_id) REFERENCES giveaways(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_giveaways_first_seen
  ON giveaways(first_seen_at);

CREATE INDEX IF NOT EXISTS idx_giveaways_active
  ON giveaways(source, active);

CREATE INDEX IF NOT EXISTS idx_notifications_status
  ON notifications(status, claimed_at);
