import {
  claimNotification,
  deactivateSubscriber,
  listActiveSubscribers,
  markNotificationsSent,
  recordManualDelivery,
  releaseNotifications,
  syncGiveaways,
} from "./db";
import {
  chunkGiveawayMessages,
  matchesPreferences,
  normalizeAccessMode,
} from "./domain";
import { fetchActiveGiveaways } from "./gamerpower";
import { sendMessage, TelegramApiError } from "./telegram";
import type { Env, Giveaway, PlatformSlug, Subscriber } from "./types";

export async function refreshCatalog(env: Env): Promise<Giveaway[]> {
  const remoteGiveaways = await fetchActiveGiveaways();
  return syncGiveaways(env.DB, remoteGiveaways);
}

export async function sendManualGiveawayList(
  env: Env,
  chatId: string,
  giveaways: Giveaway[],
  heading: string,
  recordAsDelivered: boolean,
): Promise<void> {
  const chunks = chunkGiveawayMessages(giveaways, heading);

  for (const chunk of chunks) {
    await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, chunk.text);
    if (recordAsDelivered) {
      await recordManualDelivery(
        env.DB,
        chatId,
        chunk.giveaways.flatMap((giveaway) =>
          giveaway.id === undefined ? [] : [giveaway.id],
        ),
      );
    }
  }
}

async function notifySubscriber(
  env: Env,
  subscriber: Subscriber,
  activeGiveaways: Giveaway[],
): Promise<void> {
  const candidates = activeGiveaways.filter((giveaway) =>
    matchesPreferences(giveaway, subscriber.platforms),
  );
  const claimed: Giveaway[] = [];

  for (const giveaway of candidates) {
    if (giveaway.id === undefined) continue;
    if (await claimNotification(env.DB, subscriber.chatId, giveaway.id)) {
      claimed.push(giveaway);
    }
  }

  if (claimed.length === 0) return;

  const heading =
    claimed.length === 1
      ? "🎁 <b>Novo jogo grátis encontrado!</b>"
      : `🎁 <b>${claimed.length} novos jogos grátis encontrados!</b>`;
  const chunks = chunkGiveawayMessages(claimed, heading);
  const sentIds = new Set<number>();

  try {
    for (const chunk of chunks) {
      await sendMessage(env.TELEGRAM_BOT_TOKEN, subscriber.chatId, chunk.text);
      const ids = chunk.giveaways.flatMap((giveaway) =>
        giveaway.id === undefined ? [] : [giveaway.id],
      );
      await markNotificationsSent(env.DB, subscriber.chatId, ids);
      ids.forEach((id) => sentIds.add(id));
    }
  } catch (error) {
    const pendingIds = claimed.flatMap((giveaway) =>
      giveaway.id !== undefined && !sentIds.has(giveaway.id) ? [giveaway.id] : [],
    );
    const message = error instanceof Error ? error.message : String(error);
    await releaseNotifications(env.DB, subscriber.chatId, pendingIds, message);

    if (error instanceof TelegramApiError && error.status === 403) {
      await deactivateSubscriber(env.DB, subscriber.chatId);
      console.warn(
        `Assinante ${subscriber.chatId} desativado porque bloqueou o bot.`,
      );
      return;
    }

    throw error;
  }
}

export async function runScheduledCheck(env: Env): Promise<void> {
  const activeGiveaways = await refreshCatalog(env);
  const allSubscribers = await listActiveSubscribers(env.DB);
  const subscribers = normalizeAccessMode(env.ACCESS_MODE) === "owner_only"
    ? allSubscribers.filter(
        (subscriber) => subscriber.chatId === env.OWNER_CHAT_ID.trim(),
      )
    : allSubscribers;

  for (const subscriber of subscribers) {
    try {
      await notifySubscriber(env, subscriber, activeGiveaways);
    } catch (error) {
      console.error(`Falha ao avisar o chat ${subscriber.chatId}.`, error);
    }
  }
}

export function filterByPreferences(
  giveaways: Giveaway[],
  preferences: PlatformSlug[],
): Giveaway[] {
  return giveaways.filter((giveaway) =>
    matchesPreferences(giveaway, preferences),
  );
}
