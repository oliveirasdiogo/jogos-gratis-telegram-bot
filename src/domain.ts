import {
  ALL_PLATFORMS,
  PLATFORM_DEFINITIONS,
  type AccessMode,
  type Giveaway,
  type MessageChunk,
  type PlatformSlug,
} from "./types";

export function normalizeAccessMode(value: string | undefined): AccessMode {
  return value === "owner_only" || value === "open" ? value : "approval";
}

const PLATFORM_ALIASES: Record<string, PlatformSlug> = {
  steam: "steam",
  epic: "epic-games-store",
  "epic-games": "epic-games-store",
  "epic-games-store": "epic-games-store",
  gog: "gog",
  itch: "itchio",
  "itch.io": "itchio",
  itchio: "itchio",
  drm: "drm-free",
  "drm-free": "drm-free",
  pc: "pc",
};

const GAMERPOWER_PLATFORM_MATCHERS: Array<[
  PlatformSlug,
  RegExp,
]> = [
  ["steam", /\bsteam\b/i],
  ["epic-games-store", /\bepic games store\b|\bepic games\b/i],
  ["gog", /\bgog\b/i],
  ["itchio", /\bitch\.io\b|\bitchio\b/i],
  ["drm-free", /\bdrm[- ]?free\b/i],
  ["pc", /(^|,\s*)pc($|,)/i],
];

export function parseCommand(
  text: string,
): { name: string; args: string[] } | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith("/")) return null;

  const [rawName, ...args] = trimmed.split(/\s+/);
  const name = rawName.slice(1).split("@")[0]?.toLowerCase();
  if (!name) return null;

  return { name, args };
}

export function resolvePlatformSelection(args: string[]):
  | { ok: true; platforms: PlatformSlug[] }
  | { ok: false; error: string } {
  if (args.length === 1 && ["todas", "todos", "all"].includes(args[0].toLowerCase())) {
    return { ok: true, platforms: [...ALL_PLATFORMS] };
  }

  const selected = new Set<PlatformSlug>();
  const invalid: string[] = [];

  for (const argument of args) {
    const pieces = argument.split(",").filter(Boolean);
    for (const piece of pieces) {
      const normalized = piece.trim().toLowerCase();
      const platform = PLATFORM_ALIASES[normalized];
      if (platform) selected.add(platform);
      else invalid.push(piece);
    }
  }

  if (invalid.length > 0) {
    return { ok: false, error: `Plataforma não reconhecida: ${invalid.join(", ")}.` };
  }

  if (selected.size === 0) {
    return { ok: false, error: "Escolha pelo menos uma plataforma." };
  }

  return { ok: true, platforms: [...selected] };
}

export function platformsFromGamerPower(value: string): PlatformSlug[] {
  const matches = GAMERPOWER_PLATFORM_MATCHERS.filter(([, pattern]) =>
    pattern.test(value),
  ).map(([platform]) => platform);

  return [...new Set(matches)];
}

export function matchesPreferences(
  giveaway: Giveaway,
  preferences: PlatformSlug[],
): boolean {
  return giveaway.platforms.some((platform) => preferences.includes(platform));
}

export function platformNames(platforms: PlatformSlug[]): string {
  return platforms.map((platform) => PLATFORM_DEFINITIONS[platform]).join(", ");
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function formatDate(value: string | null): string {
  if (!value) return "sem data informada";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "sem data informada";

  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function formatGiveawayBlock(giveaway: Giveaway): string {
  const title = escapeHtml(giveaway.title);
  const url = escapeHtml(giveaway.giveawayUrl);
  const storeNames = escapeHtml(platformNames(giveaway.platforms));
  const price =
    giveaway.worth && giveaway.worth.toLowerCase() !== "n/a"
      ? `\n💰 Preço anterior: ${escapeHtml(giveaway.worth)}`
      : "";
  const end = giveaway.active
    ? giveaway.endsAt
      ? `⏳ Disponível até: ${formatDate(giveaway.endsAt)}`
      : "⏳ Término não informado"
    : "⚪ Campanha não está mais ativa";

  return [
    `🎮 <b>${title}</b>`,
    `🏪 ${storeNames}${price}`,
    end,
    `🔗 <a href="${url}">Abrir oferta</a>`,
  ].join("\n");
}

export function chunkGiveawayMessages(
  giveaways: Giveaway[],
  heading: string,
  maxLength = 3900,
): MessageChunk[] {
  if (giveaways.length === 0) return [];

  const footer = '\n\nFonte: <a href="https://www.gamerpower.com/">GamerPower</a>';
  const chunks: MessageChunk[] = [];
  let currentGiveaways: Giveaway[] = [];
  let currentBody = heading;

  for (const giveaway of giveaways) {
    const block = formatGiveawayBlock(giveaway);
    const candidate = `${currentBody}\n\n${block}${footer}`;

    if (currentGiveaways.length > 0 && candidate.length > maxLength) {
      chunks.push({
        text: `${currentBody}${footer}`,
        giveaways: currentGiveaways,
      });
      currentGiveaways = [giveaway];
      currentBody = `<b>Continuação</b>\n\n${block}`;
    } else {
      currentGiveaways.push(giveaway);
      currentBody = `${currentBody}\n\n${block}`;
    }
  }

  chunks.push({ text: `${currentBody}${footer}`, giveaways: currentGiveaways });
  return chunks;
}
