import {
  deactivateSubscriber,
  ensureApprovedAccess,
  ensureOwnerAccess,
  getAccessEntry,
  getGiveawaysFromLastSevenDays,
  getSubscriber,
  listAccessEntries,
  replaceSubscriberPlatforms,
  requestAccess,
  reviewAccess,
  upsertSubscriber,
} from "./db";
import {
  escapeHtml,
  normalizeAccessMode,
  parseCommand,
  platformNames,
  resolvePlatformSelection,
} from "./domain";
import {
  filterByPreferences,
  refreshCatalog,
  sendManualGiveawayList,
} from "./service";
import { sendMessage } from "./telegram";
import type {
  AccessMode,
  AccessEntry,
  Env,
  Subscriber,
  TelegramUpdate,
} from "./types";

const HELP_TEXT = `
<b>Comandos disponíveis</b>

/start — solicita acesso ou ativa os avisos
/agora — mostra os jogos grátis ativos
/ultimos7dias — mostra o histórico dos últimos 7 dias
/plataformas — mostra ou altera as plataformas
/status — mostra suas configurações
/parar — desativa os avisos automáticos
/meuid — mostra o ID deste chat
/ajuda — mostra esta ajuda

Exemplo: <code>/plataformas steam epic gog</code>
Use <code>/plataformas todas</code> para acompanhar todas.
`.trim();

const ADMIN_HELP_TEXT = `

<b>Comandos administrativos</b>

/pendentes — lista solicitações aguardando análise
/autorizados — lista usuários aprovados
/aprovar ID — autoriza um usuário
/negar ID — nega uma solicitação
/revogar ID — remove um acesso existente
`.trimEnd();

const ADMIN_COMMANDS = new Set([
  "aprovar",
  "negar",
  "revogar",
  "pendentes",
  "autorizados",
]);

function accessModeLabel(mode: AccessMode): string {
  if (mode === "owner_only") return "somente proprietário";
  if (mode === "open") return "aberto";
  return "aprovação manual";
}

function checkIntervalLabel(env: Env): string {
  return env.CHECK_INTERVAL_LABEL?.trim() || "30 minutos";
}

function formatAccessEntry(entry: AccessEntry): string {
  const name = entry.firstName
    ? escapeHtml(entry.firstName)
    : "Nome não informado";
  const username = entry.username
    ? `@${escapeHtml(entry.username)}`
    : "sem nome de usuário";

  return `• <b>${name}</b> (${username})\n  ID: <code>${escapeHtml(entry.chatId)}</code>`;
}

function parseTargetChatId(args: string[]): string | null {
  const value = args[0]?.trim();
  return value && /^-?\d+$/.test(value) ? value : null;
}

async function requireSubscriber(
  env: Env,
  chatId: string,
): Promise<Subscriber | null> {
  const subscriber = await getSubscriber(env.DB, chatId);
  if (!subscriber) {
    await sendMessage(
      env.TELEGRAM_BOT_TOKEN,
      chatId,
      "Seu acesso está aprovado, mas os avisos ainda não foram ativados. Envie /start.",
    );
    return null;
  }
  return subscriber;
}

async function sendCurrentGames(
  env: Env,
  subscriber: Subscriber,
): Promise<void> {
  await sendMessage(
    env.TELEGRAM_BOT_TOKEN,
    subscriber.chatId,
    "🔎 Consultando as ofertas atuais…",
  );
  const active = await refreshCatalog(env);
  const matching = filterByPreferences(active, subscriber.platforms);

  if (matching.length === 0) {
    await sendMessage(
      env.TELEGRAM_BOT_TOKEN,
      subscriber.chatId,
      "Não encontrei jogos grátis ativos nas plataformas escolhidas agora.",
    );
    return;
  }

  await sendManualGiveawayList(
    env,
    subscriber.chatId,
    matching,
    `🎮 <b>Jogos grátis ativos (${matching.length})</b>`,
    true,
  );
}

async function notifyOwnerOfRequest(
  env: Env,
  entry: AccessEntry,
): Promise<void> {
  const username = entry.username
    ? `@${escapeHtml(entry.username)}`
    : "não informado";
  const name = entry.firstName
    ? escapeHtml(entry.firstName)
    : "não informado";
  const id = escapeHtml(entry.chatId);

  await sendMessage(
    env.TELEGRAM_BOT_TOKEN,
    env.OWNER_CHAT_ID,
    [
      "🔔 <b>Nova solicitação de acesso</b>",
      "",
      `Nome: ${name}`,
      `Usuário: ${username}`,
      `Chat ID: <code>${id}</code>`,
      "",
      `Aprovar: <code>/aprovar ${id}</code>`,
      `Negar: <code>/negar ${id}</code>`,
    ].join("\n"),
  );
}

async function sendAccessList(
  env: Env,
  ownerChatId: string,
  status: "pending" | "approved",
): Promise<void> {
  const entries = await listAccessEntries(env.DB, status);
  if (entries.length === 0) {
    await sendMessage(
      env.TELEGRAM_BOT_TOKEN,
      ownerChatId,
      status === "pending"
        ? "Não há solicitações pendentes."
        : "Não há usuários autorizados.",
    );
    return;
  }

  const visible = entries.slice(0, 30);
  const heading =
    status === "pending"
      ? `⏳ <b>Solicitações pendentes (${entries.length})</b>`
      : `✅ <b>Usuários autorizados (${entries.length})</b>`;
  const suffix =
    entries.length > visible.length
      ? `\n\nMostrando os primeiros ${visible.length} resultados.`
      : "";

  await sendMessage(
    env.TELEGRAM_BOT_TOKEN,
    ownerChatId,
    `${heading}\n\n${visible.map(formatAccessEntry).join("\n\n")}${suffix}`,
  );
}

async function notifyReviewedUser(
  env: Env,
  entry: AccessEntry,
  action: "approved" | "denied" | "revoked",
): Promise<boolean> {
  const text =
    action === "approved"
      ? "✅ Seu acesso foi aprovado! Envie /start para ativar as notificações."
      : action === "denied"
        ? "❌ Sua solicitação de acesso foi negada pelo administrador."
        : "🔒 Seu acesso ao bot foi revogado pelo administrador.";

  try {
    await sendMessage(env.TELEGRAM_BOT_TOKEN, entry.chatId, text);
    return true;
  } catch (error) {
    console.error(`Não foi possível avisar o chat ${entry.chatId}.`, error);
    return false;
  }
}

async function handleAdminCommand(
  env: Env,
  ownerChatId: string,
  name: string,
  args: string[],
): Promise<void> {
  if (name === "pendentes") {
    await sendAccessList(env, ownerChatId, "pending");
    return;
  }

  if (name === "autorizados") {
    await sendAccessList(env, ownerChatId, "approved");
    return;
  }

  const targetChatId = parseTargetChatId(args);
  if (!targetChatId) {
    await sendMessage(
      env.TELEGRAM_BOT_TOKEN,
      ownerChatId,
      `Uso correto: <code>/${escapeHtml(name)} CHAT_ID</code>`,
    );
    return;
  }

  if (targetChatId === ownerChatId && name !== "aprovar") {
    await sendMessage(
      env.TELEGRAM_BOT_TOKEN,
      ownerChatId,
      "O proprietário não pode negar ou revogar o próprio acesso.",
    );
    return;
  }

  const status = name === "aprovar" ? "approved" : "denied";
  const entry = await reviewAccess(
    env.DB,
    targetChatId,
    status,
    ownerChatId,
  );

  if (!entry) {
    await sendMessage(
      env.TELEGRAM_BOT_TOKEN,
      ownerChatId,
      "Não encontrei uma solicitação com esse Chat ID.",
    );
    return;
  }

  if (status === "denied") {
    await deactivateSubscriber(env.DB, targetChatId);
  }

  const action =
    name === "aprovar" ? "approved" : name === "revogar" ? "revoked" : "denied";
  const notified = await notifyReviewedUser(env, entry, action);
  const actionLabel =
    name === "aprovar" ? "aprovado" : name === "revogar" ? "revogado" : "negado";

  await sendMessage(
    env.TELEGRAM_BOT_TOKEN,
    ownerChatId,
    `✅ Acesso ${actionLabel} para o chat <code>${escapeHtml(targetChatId)}</code>.${
      notified ? "" : "\n⚠️ A alteração foi salva, mas não consegui avisar o usuário."
    }`,
  );
}

async function handleStart(
  env: Env,
  chatId: string,
  isOwner: boolean,
  update: TelegramUpdate,
): Promise<void> {
  const user = update.message?.from;
  const accessMode = normalizeAccessMode(env.ACCESS_MODE);

  if (isOwner) {
    await ensureOwnerAccess(env.DB, chatId, user);
  } else if (accessMode === "owner_only") {
    await sendMessage(
      env.TELEGRAM_BOT_TOKEN,
      chatId,
      "🔒 Este bot está configurado para uso exclusivo do proprietário.",
    );
    return;
  } else if (accessMode === "open") {
    await ensureApprovedAccess(env.DB, chatId, user, "system:open");
  } else {
    const request = await requestAccess(env.DB, chatId, user);
    if (request.entry.status !== "approved") {
      if (request.entry.status === "denied") {
        await sendMessage(
          env.TELEGRAM_BOT_TOKEN,
          chatId,
          "🔒 Seu acesso não está autorizado. Entre em contato com o administrador.",
        );
        return;
      }

      await sendMessage(
        env.TELEGRAM_BOT_TOKEN,
        chatId,
        request.created
          ? "🔐 Este bot é privado. Sua solicitação foi enviada ao administrador. Aguarde a aprovação."
          : "⏳ Sua solicitação ainda está aguardando a aprovação do administrador.",
      );

      if (request.created) {
        try {
          await notifyOwnerOfRequest(env, request.entry);
        } catch (error) {
          console.error("Não foi possível avisar o proprietário.", error);
        }
      }
      return;
    }
  }

  await upsertSubscriber(env.DB, chatId, user);
  const subscriber = await getSubscriber(env.DB, chatId);
  await sendMessage(
    env.TELEGRAM_BOT_TOKEN,
    chatId,
    `✅ Avisos ativados. Vou verificar novas ofertas a cada ${escapeHtml(checkIntervalLabel(env))} e não repetirei a mesma campanha automaticamente.`,
  );
  if (subscriber) await sendCurrentGames(env, subscriber);
}

export async function handleTelegramUpdate(
  update: TelegramUpdate,
  env: Env,
): Promise<void> {
  const message = update.message;
  if (!message?.text) return;

  const chatId = String(message.chat.id);
  const command = parseCommand(message.text);
  if (!command) return;

  if (command.name === "meuid") {
    await sendMessage(
      env.TELEGRAM_BOT_TOKEN,
      chatId,
      `ID deste chat: <code>${escapeHtml(chatId)}</code>`,
    );
    return;
  }

  if (message.chat.type !== "private") {
    await sendMessage(
      env.TELEGRAM_BOT_TOKEN,
      chatId,
      "Por segurança, use este bot em uma conversa privada.",
    );
    return;
  }

  const ownerChatId = env.OWNER_CHAT_ID?.trim();
  if (!ownerChatId) {
    await sendMessage(
      env.TELEGRAM_BOT_TOKEN,
      chatId,
      "⚠️ O proprietário do bot ainda não foi configurado.",
    );
    return;
  }

  const isOwner = chatId === ownerChatId;
  const accessMode = normalizeAccessMode(env.ACCESS_MODE);
  if (isOwner) {
    await ensureOwnerAccess(env.DB, chatId, message.from);
  }

  if (ADMIN_COMMANDS.has(command.name)) {
    if (!isOwner) {
      await sendMessage(
        env.TELEGRAM_BOT_TOKEN,
        chatId,
        "Este comando é exclusivo do administrador.",
      );
      return;
    }

    await handleAdminCommand(
      env,
      ownerChatId,
      command.name,
      command.args,
    );
    return;
  }

  if (command.name === "start") {
    await handleStart(env, chatId, isOwner, update);
    return;
  }

  const access = await getAccessEntry(env.DB, chatId);
  if (!isOwner && (accessMode === "owner_only" || access?.status !== "approved")) {
    const text = accessMode === "owner_only"
      ? "🔒 Este bot está configurado para uso exclusivo do proprietário."
      : accessMode === "open"
        ? "Envie /start para ativar os avisos."
        : access?.status === "pending"
          ? "⏳ Sua solicitação ainda está aguardando aprovação."
          : access?.status === "denied"
            ? "🔒 Seu acesso não está autorizado."
            : "🔐 Este bot é privado. Envie /start para solicitar acesso.";
    await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, text);
    return;
  }

  switch (command.name) {
    case "parar": {
      await deactivateSubscriber(env.DB, chatId);
      await sendMessage(
        env.TELEGRAM_BOT_TOKEN,
        chatId,
        "🔕 Avisos automáticos desativados. Envie /start quando quiser reativar.",
      );
      return;
    }

    case "agora": {
      const subscriber = await requireSubscriber(env, chatId);
      if (subscriber) await sendCurrentGames(env, subscriber);
      return;
    }

    case "ultimos7dias": {
      const subscriber = await requireSubscriber(env, chatId);
      if (!subscriber) return;
      const recent = filterByPreferences(
        await getGiveawaysFromLastSevenDays(env.DB),
        subscriber.platforms,
      );

      if (recent.length === 0) {
        await sendMessage(
          env.TELEGRAM_BOT_TOKEN,
          chatId,
          "Ainda não há jogos registrados nos últimos 7 dias para suas plataformas. O histórico começa quando o bot é publicado.",
        );
        return;
      }

      await sendManualGiveawayList(
        env,
        chatId,
        recent,
        `🗓 <b>Jogos encontrados nos últimos 7 dias (${recent.length})</b>`,
        false,
      );
      return;
    }

    case "plataformas": {
      const subscriber = await requireSubscriber(env, chatId);
      if (!subscriber) return;

      if (command.args.length === 0) {
        await sendMessage(
          env.TELEGRAM_BOT_TOKEN,
          chatId,
          [
            `<b>Plataformas atuais:</b> ${escapeHtml(platformNames(subscriber.platforms))}`,
            "",
            "Para alterar, use:",
            "<code>/plataformas steam epic gog itchio drm-free pc</code>",
            "ou <code>/plataformas todas</code>.",
          ].join("\n"),
        );
        return;
      }

      const selection = resolvePlatformSelection(command.args);
      if (!selection.ok) {
        await sendMessage(
          env.TELEGRAM_BOT_TOKEN,
          chatId,
          `${escapeHtml(selection.error)}\n\nUse Steam, Epic, GOG, itchio, drm-free ou pc.`,
        );
        return;
      }

      const platforms = selection.platforms;
      await replaceSubscriberPlatforms(env.DB, chatId, platforms);
      await sendMessage(
        env.TELEGRAM_BOT_TOKEN,
        chatId,
        `✅ Plataformas atualizadas: ${escapeHtml(platformNames(platforms))}.`,
      );
      return;
    }

    case "status": {
      const subscriber = await requireSubscriber(env, chatId);
      if (!subscriber) return;
      await sendMessage(
        env.TELEGRAM_BOT_TOKEN,
        chatId,
        [
          "<b>Status do bot</b>",
          `Acesso: ${isOwner ? "👑 proprietário" : "✅ aprovado"}`,
          `Modo: ${accessModeLabel(accessMode)}`,
          `Avisos: ${subscriber.active ? "✅ ativos" : "🔕 desativados"}`,
          `Plataformas: ${escapeHtml(platformNames(subscriber.platforms))}`,
          `Verificação: a cada ${escapeHtml(checkIntervalLabel(env))}`,
        ].join("\n"),
      );
      return;
    }

    case "ajuda":
    case "help": {
      await sendMessage(
        env.TELEGRAM_BOT_TOKEN,
        chatId,
        isOwner ? `${HELP_TEXT}\n${ADMIN_HELP_TEXT}` : HELP_TEXT,
      );
      return;
    }

    default: {
      await sendMessage(
        env.TELEGRAM_BOT_TOKEN,
        chatId,
        "Não reconheci esse comando. Use /ajuda para ver as opções.",
      );
    }
  }
}
