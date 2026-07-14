import {
  ALL_PLATFORMS,
  type AccessEntry,
  type AccessStatus,
  type Giveaway,
  type PlatformSlug,
  type Subscriber,
  type TelegramUser,
} from "./types";

interface GiveawayRow {
  id: number;
  source: "gamerpower";
  source_id: string;
  title: string;
  description: string | null;
  platforms_json: string;
  worth: string | null;
  thumbnail_url: string | null;
  giveaway_url: string;
  source_url: string;
  published_at: string | null;
  ends_at: string | null;
  first_seen_at: string;
  active: number;
}

interface SubscriberRow {
  chat_id: string;
  username: string | null;
  first_name: string | null;
  active: number;
  platforms: string | null;
}

interface AccessRow {
  chat_id: string;
  username: string | null;
  first_name: string | null;
  status: AccessStatus;
  requested_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
}

function parsePlatforms(value: string | null): PlatformSlug[] {
  if (!value) return [];
  const valid = new Set<string>(ALL_PLATFORMS);
  return value
    .split(",")
    .filter((platform): platform is PlatformSlug => valid.has(platform));
}

function rowToGiveaway(row: GiveawayRow): Giveaway {
  let platforms: PlatformSlug[] = [];
  try {
    const parsed = JSON.parse(row.platforms_json) as unknown;
    if (Array.isArray(parsed)) {
      const valid = new Set<string>(ALL_PLATFORMS);
      platforms = parsed.filter(
        (platform): platform is PlatformSlug =>
          typeof platform === "string" && valid.has(platform),
      );
    }
  } catch {
    platforms = [];
  }

  return {
    id: row.id,
    source: row.source,
    sourceId: row.source_id,
    title: row.title,
    description: row.description,
    platforms,
    worth: row.worth,
    thumbnailUrl: row.thumbnail_url,
    giveawayUrl: row.giveaway_url,
    sourceUrl: row.source_url,
    publishedAt: row.published_at,
    endsAt: row.ends_at,
    firstSeenAt: row.first_seen_at,
    active: row.active === 1,
  };
}

function rowToSubscriber(row: SubscriberRow): Subscriber {
  return {
    chatId: row.chat_id,
    username: row.username,
    firstName: row.first_name,
    active: row.active === 1,
    platforms: parsePlatforms(row.platforms),
  };
}

function rowToAccessEntry(row: AccessRow): AccessEntry {
  return {
    chatId: row.chat_id,
    username: row.username,
    firstName: row.first_name,
    status: row.status,
    requestedAt: row.requested_at,
    reviewedAt: row.reviewed_at,
    reviewedBy: row.reviewed_by,
  };
}

const SUBSCRIBER_SELECT = `
  SELECT
    s.chat_id,
    s.username,
    s.first_name,
    s.active,
    group_concat(sp.platform) AS platforms
  FROM subscribers s
  JOIN access_control ac
    ON ac.chat_id = s.chat_id AND ac.status = 'approved'
  LEFT JOIN subscriber_platforms sp ON sp.chat_id = s.chat_id
`;

export async function getAccessEntry(
  db: D1Database,
  chatId: string,
): Promise<AccessEntry | null> {
  const row = await db
    .prepare("SELECT * FROM access_control WHERE chat_id = ?")
    .bind(chatId)
    .first<AccessRow>();

  return row ? rowToAccessEntry(row) : null;
}

export async function ensureOwnerAccess(
  db: D1Database,
  chatId: string,
  user?: TelegramUser,
): Promise<void> {
  await ensureApprovedAccess(db, chatId, user, chatId);
}

export async function ensureApprovedAccess(
  db: D1Database,
  chatId: string,
  user: TelegramUser | undefined,
  reviewedBy: string,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO access_control (
         chat_id, username, first_name, status, reviewed_at, reviewed_by
       ) VALUES (?, ?, ?, 'approved', CURRENT_TIMESTAMP, ?)
       ON CONFLICT(chat_id) DO UPDATE SET
         username = COALESCE(excluded.username, access_control.username),
         first_name = COALESCE(excluded.first_name, access_control.first_name),
         status = 'approved',
         reviewed_at = CURRENT_TIMESTAMP,
         reviewed_by = excluded.reviewed_by`,
    )
    .bind(
      chatId,
      user?.username ?? null,
      user?.first_name ?? null,
      reviewedBy,
    )
    .run();
}

export async function requestAccess(
  db: D1Database,
  chatId: string,
  user?: TelegramUser,
): Promise<{ entry: AccessEntry; created: boolean }> {
  const existing = await getAccessEntry(db, chatId);
  if (existing) {
    await db
      .prepare(
        `UPDATE access_control
         SET username = COALESCE(?, username),
             first_name = COALESCE(?, first_name)
         WHERE chat_id = ?`,
      )
      .bind(user?.username ?? null, user?.first_name ?? null, chatId)
      .run();

    const updated = await getAccessEntry(db, chatId);
    return { entry: updated ?? existing, created: false };
  }

  await db
    .prepare(
      `INSERT INTO access_control (
         chat_id, username, first_name, status
       ) VALUES (?, ?, ?, 'pending')`,
    )
    .bind(chatId, user?.username ?? null, user?.first_name ?? null)
    .run();

  const created = await getAccessEntry(db, chatId);
  if (!created) throw new Error("Não foi possível registrar a solicitação.");
  return { entry: created, created: true };
}

export async function reviewAccess(
  db: D1Database,
  chatId: string,
  status: "approved" | "denied",
  reviewedBy: string,
): Promise<AccessEntry | null> {
  const result = await db
    .prepare(
      `UPDATE access_control
       SET status = ?, reviewed_at = CURRENT_TIMESTAMP, reviewed_by = ?
       WHERE chat_id = ?`,
    )
    .bind(status, reviewedBy, chatId)
    .run();

  if (changedRows(result) === 0) return null;
  return getAccessEntry(db, chatId);
}

export async function listAccessEntries(
  db: D1Database,
  status: AccessStatus,
): Promise<AccessEntry[]> {
  const result = await db
    .prepare(
      `SELECT * FROM access_control
       WHERE status = ?
       ORDER BY datetime(requested_at) ASC
       LIMIT 100`,
    )
    .bind(status)
    .all<AccessRow>();

  return result.results.map(rowToAccessEntry);
}

export async function upsertSubscriber(
  db: D1Database,
  chatId: string,
  user?: TelegramUser,
): Promise<void> {
  const preferenceCount = await db
    .prepare(
      "SELECT count(*) AS total FROM subscriber_platforms WHERE chat_id = ?",
    )
    .bind(chatId)
    .first<{ total: number }>();

  await db
    .prepare(
      `INSERT INTO subscribers (chat_id, username, first_name, active)
       VALUES (?, ?, ?, 1)
       ON CONFLICT(chat_id) DO UPDATE SET
         username = excluded.username,
         first_name = excluded.first_name,
         active = 1,
         updated_at = CURRENT_TIMESTAMP`,
    )
    .bind(chatId, user?.username ?? null, user?.first_name ?? null)
    .run();

  if (!preferenceCount || preferenceCount.total === 0) {
    await db.batch(
      ALL_PLATFORMS.map((platform) =>
        db
          .prepare(
            "INSERT OR IGNORE INTO subscriber_platforms (chat_id, platform) VALUES (?, ?)",
          )
          .bind(chatId, platform),
      ),
    );
  }
}

export async function deactivateSubscriber(
  db: D1Database,
  chatId: string,
): Promise<void> {
  await db
    .prepare(
      `UPDATE subscribers
       SET active = 0, updated_at = CURRENT_TIMESTAMP
       WHERE chat_id = ?`,
    )
    .bind(chatId)
    .run();
}

export async function getSubscriber(
  db: D1Database,
  chatId: string,
): Promise<Subscriber | null> {
  const row = await db
    .prepare(
      `${SUBSCRIBER_SELECT}
       WHERE s.chat_id = ?
       GROUP BY s.chat_id, s.username, s.first_name, s.active`,
    )
    .bind(chatId)
    .first<SubscriberRow>();

  return row ? rowToSubscriber(row) : null;
}

export async function listActiveSubscribers(
  db: D1Database,
): Promise<Subscriber[]> {
  const result = await db
    .prepare(
      `${SUBSCRIBER_SELECT}
       WHERE s.active = 1
       GROUP BY s.chat_id, s.username, s.first_name, s.active`,
    )
    .all<SubscriberRow>();

  return result.results.map(rowToSubscriber);
}

export async function replaceSubscriberPlatforms(
  db: D1Database,
  chatId: string,
  platforms: PlatformSlug[],
): Promise<void> {
  await db.batch([
    db
      .prepare("DELETE FROM subscriber_platforms WHERE chat_id = ?")
      .bind(chatId),
    ...platforms.map((platform) =>
      db
        .prepare(
          "INSERT INTO subscriber_platforms (chat_id, platform) VALUES (?, ?)",
        )
        .bind(chatId, platform),
    ),
    db
      .prepare(
        "UPDATE subscribers SET updated_at = CURRENT_TIMESTAMP WHERE chat_id = ?",
      )
      .bind(chatId),
  ]);
}

export async function syncGiveaways(
  db: D1Database,
  giveaways: Giveaway[],
): Promise<Giveaway[]> {
  const statements: D1PreparedStatement[] = [
    db.prepare(
      "UPDATE giveaways SET active = 0 WHERE source = 'gamerpower' AND active = 1",
    ),
  ];

  for (const giveaway of giveaways) {
    statements.push(
      db
        .prepare(
          `INSERT INTO giveaways (
             source, source_id, title, description, platforms_json, worth,
             thumbnail_url, giveaway_url, source_url, published_at, ends_at, active
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
           ON CONFLICT(source, source_id) DO UPDATE SET
             title = excluded.title,
             description = excluded.description,
             platforms_json = excluded.platforms_json,
             worth = excluded.worth,
             thumbnail_url = excluded.thumbnail_url,
             giveaway_url = excluded.giveaway_url,
             source_url = excluded.source_url,
             published_at = excluded.published_at,
             ends_at = excluded.ends_at,
             active = 1,
             last_seen_at = CURRENT_TIMESTAMP`,
        )
        .bind(
          giveaway.source,
          giveaway.sourceId,
          giveaway.title,
          giveaway.description,
          JSON.stringify(giveaway.platforms),
          giveaway.worth,
          giveaway.thumbnailUrl,
          giveaway.giveawayUrl,
          giveaway.sourceUrl,
          giveaway.publishedAt,
          giveaway.endsAt,
        ),
    );
  }

  await db.batch(statements);

  const result = await db
    .prepare(
      `SELECT * FROM giveaways
       WHERE source = 'gamerpower' AND active = 1
       ORDER BY datetime(first_seen_at) DESC, id DESC`,
    )
    .all<GiveawayRow>();

  return result.results.map(rowToGiveaway);
}

export async function getGiveawaysFromLastSevenDays(
  db: D1Database,
): Promise<Giveaway[]> {
  const result = await db
    .prepare(
      `SELECT * FROM giveaways
       WHERE datetime(first_seen_at) >= datetime('now', '-7 days')
       ORDER BY datetime(first_seen_at) DESC, id DESC
       LIMIT 100`,
    )
    .all<GiveawayRow>();

  return result.results.map(rowToGiveaway);
}

function changedRows(result: D1Result): number {
  return typeof result.meta.changes === "number" ? result.meta.changes : 0;
}

export async function claimNotification(
  db: D1Database,
  chatId: string,
  giveawayId: number,
): Promise<boolean> {
  const inserted = await db
    .prepare(
      `INSERT OR IGNORE INTO notifications (
         chat_id, giveaway_id, status, attempts, claimed_at
       ) VALUES (?, ?, 'pending', 1, CURRENT_TIMESTAMP)`,
    )
    .bind(chatId, giveawayId)
    .run();

  if (changedRows(inserted) === 1) return true;

  const reclaimed = await db
    .prepare(
      `UPDATE notifications
       SET attempts = attempts + 1,
           claimed_at = CURRENT_TIMESTAMP,
           last_error = NULL
       WHERE chat_id = ?
         AND giveaway_id = ?
         AND status = 'pending'
         AND datetime(claimed_at) <= datetime('now', '-10 minutes')`,
    )
    .bind(chatId, giveawayId)
    .run();

  return changedRows(reclaimed) === 1;
}

export async function markNotificationsSent(
  db: D1Database,
  chatId: string,
  giveawayIds: number[],
): Promise<void> {
  if (giveawayIds.length === 0) return;
  await db.batch(
    giveawayIds.map((giveawayId) =>
      db
        .prepare(
          `UPDATE notifications
           SET status = 'sent', sent_at = CURRENT_TIMESTAMP, last_error = NULL
           WHERE chat_id = ? AND giveaway_id = ?`,
        )
        .bind(chatId, giveawayId),
    ),
  );
}

export async function recordManualDelivery(
  db: D1Database,
  chatId: string,
  giveawayIds: number[],
): Promise<void> {
  if (giveawayIds.length === 0) return;
  await db.batch(
    giveawayIds.map((giveawayId) =>
      db
        .prepare(
          `INSERT INTO notifications (
             chat_id, giveaway_id, status, attempts, claimed_at, sent_at
           ) VALUES (?, ?, 'sent', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
           ON CONFLICT(chat_id, giveaway_id) DO UPDATE SET
             status = 'sent',
             sent_at = COALESCE(notifications.sent_at, CURRENT_TIMESTAMP),
             last_error = NULL`,
        )
        .bind(chatId, giveawayId),
    ),
  );
}

export async function releaseNotifications(
  db: D1Database,
  chatId: string,
  giveawayIds: number[],
  error: string,
): Promise<void> {
  if (giveawayIds.length === 0) return;
  const message = error.slice(0, 500);
  await db.batch(
    giveawayIds.map((giveawayId) =>
      db
        .prepare(
          `UPDATE notifications
           SET claimed_at = datetime('now', '-11 minutes'), last_error = ?
           WHERE chat_id = ? AND giveaway_id = ? AND status = 'pending'`,
        )
        .bind(message, chatId, giveawayId),
    ),
  );
}
