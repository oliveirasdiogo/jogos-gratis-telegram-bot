import { platformsFromGamerPower } from "./domain";
import type { Giveaway } from "./types";

const GAMERPOWER_API_URL =
  "https://www.gamerpower.com/api/giveaways?type=game&sort-by=date";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function asString(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);
  return "";
}

export function parseGamerPowerDate(value: unknown): string | null {
  const raw = asString(value);
  if (!raw || raw.toLowerCase() === "n/a") return null;

  let normalized = raw;
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(raw)) {
    normalized = `${raw.replace(" ", "T")}Z`;
  }

  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function parseGamerPowerGiveaways(payload: unknown): Giveaway[] {
  if (!Array.isArray(payload)) {
    throw new Error("A GamerPower retornou um formato de resposta inesperado.");
  }

  const giveaways: Giveaway[] = [];

  for (const item of payload) {
    const record = asRecord(item);
    if (!record) continue;

    const sourceId = asString(record.id);
    const title = asString(record.title);
    const type = asString(record.type).toLowerCase();
    const status = asString(record.status).toLowerCase();
    const rawPlatforms = asString(record.platforms);
    const platforms = platformsFromGamerPower(rawPlatforms);
    const giveawayUrl =
      asString(record.open_giveaway_url) || asString(record.open_giveaway);
    const sourceUrl =
      asString(record.gamerpower_url) || "https://www.gamerpower.com/";

    if (!sourceId || !title || !giveawayUrl || platforms.length === 0) continue;
    if (type && type !== "game") continue;
    if (status && status !== "active") continue;

    const worth = asString(record.worth);
    const description = asString(record.description);
    const thumbnailUrl = asString(record.thumbnail) || asString(record.image);

    giveaways.push({
      source: "gamerpower",
      sourceId,
      title,
      description: description || null,
      platforms,
      worth: worth && worth.toLowerCase() !== "n/a" ? worth : null,
      thumbnailUrl: thumbnailUrl || null,
      giveawayUrl,
      sourceUrl,
      publishedAt: parseGamerPowerDate(record.published_date),
      endsAt: parseGamerPowerDate(record.end_date),
      active: true,
    });
  }

  return giveaways;
}

export async function fetchActiveGiveaways(): Promise<Giveaway[]> {
  const response = await fetch(GAMERPOWER_API_URL, {
    headers: {
      Accept: "application/json",
    },
  });

  if (response.status === 201) return [];
  if (!response.ok) {
    throw new Error(
      `Falha ao consultar a GamerPower: HTTP ${response.status}.`,
    );
  }

  return parseGamerPowerGiveaways(await response.json());
}
