interface TelegramSuccess<T> {
  ok: true;
  result: T;
}

interface TelegramFailure {
  ok: false;
  error_code?: number;
  description?: string;
  parameters?: {
    retry_after?: number;
  };
}

type TelegramResponse<T> = TelegramSuccess<T> | TelegramFailure;

export class TelegramApiError extends Error {
  readonly status: number;
  readonly errorCode?: number;
  readonly retryAfter?: number;

  constructor(
    message: string,
    status: number,
    errorCode?: number,
    retryAfter?: number,
  ) {
    super(message);
    this.name = "TelegramApiError";
    this.status = status;
    this.errorCode = errorCode;
    this.retryAfter = retryAfter;
  }
}

async function callTelegram<T>(
  token: string,
  method: string,
  body: Record<string, unknown>,
): Promise<T> {
  const response = await fetch(
    `https://api.telegram.org/bot${encodeURIComponent(token)}/${method}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );

  let data: TelegramResponse<T>;
  try {
    data = (await response.json()) as TelegramResponse<T>;
  } catch {
    throw new TelegramApiError(
      `O Telegram retornou uma resposta inválida em ${method}.`,
      response.status,
    );
  }

  if (!response.ok || !data.ok) {
    const failure = data as TelegramFailure;
    throw new TelegramApiError(
      failure.description ?? `Falha na chamada ${method}.`,
      response.status,
      failure.error_code,
      failure.parameters?.retry_after,
    );
  }

  return data.result;
}

export async function sendMessage(
  token: string,
  chatId: string,
  text: string,
): Promise<void> {
  await callTelegram(token, "sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
  });
}

export async function configureWebhook(
  token: string,
  webhookUrl: string,
  webhookSecret: string,
): Promise<void> {
  await callTelegram(token, "setWebhook", {
    url: webhookUrl,
    secret_token: webhookSecret,
    allowed_updates: ["message"],
    drop_pending_updates: false,
  });

  await callTelegram(token, "setMyCommands", {
    commands: [
      { command: "start", description: "Ativar avisos e mostrar jogos atuais" },
      { command: "agora", description: "Mostrar jogos grátis ativos" },
      { command: "ultimos7dias", description: "Mostrar jogos vistos nos últimos 7 dias" },
      { command: "plataformas", description: "Escolher lojas e plataformas" },
      { command: "status", description: "Ver o estado das notificações" },
      { command: "parar", description: "Desativar avisos automáticos" },
      { command: "meuid", description: "Mostrar o identificador deste chat" },
      { command: "ajuda", description: "Listar comandos" },
    ],
  });
}
