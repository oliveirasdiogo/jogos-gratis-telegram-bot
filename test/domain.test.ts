import { describe, expect, it } from "vitest";
import {
  chunkGiveawayMessages,
  matchesPreferences,
  normalizeAccessMode,
  parseCommand,
  platformsFromGamerPower,
  resolvePlatformSelection,
} from "../src/domain";
import type { Giveaway } from "../src/types";

const giveaway: Giveaway = {
  id: 1,
  source: "gamerpower",
  sourceId: "123",
  title: "Jogo <Grátis>",
  description: null,
  platforms: ["steam", "pc"],
  worth: "$19.99",
  thumbnailUrl: null,
  giveawayUrl: "https://example.com/game?a=1&b=2",
  sourceUrl: "https://www.gamerpower.com/",
  publishedAt: "2026-07-10T12:00:00.000Z",
  endsAt: "2026-07-20T15:00:00.000Z",
  active: true,
};

describe("comandos", () => {
  it("remove o nome do bot e separa os argumentos", () => {
    expect(parseCommand("/plataformas@MeuBot steam epic")).toEqual({
      name: "plataformas",
      args: ["steam", "epic"],
    });
  });

  it("ignora mensagens que não são comandos", () => {
    expect(parseCommand("bom dia")).toBeNull();
  });
});

describe("controle de acesso", () => {
  it("usa aprovação manual por padrão", () => {
    expect(normalizeAccessMode(undefined)).toBe("approval");
    expect(normalizeAccessMode("valor-inválido")).toBe("approval");
  });

  it("aceita os modos somente proprietário e aberto", () => {
    expect(normalizeAccessMode("owner_only")).toBe("owner_only");
    expect(normalizeAccessMode("open")).toBe("open");
  });
});

describe("plataformas", () => {
  it("normaliza plataformas da GamerPower", () => {
    expect(platformsFromGamerPower("PC, Steam, Epic Games Store")).toEqual([
      "steam",
      "epic-games-store",
      "pc",
    ]);
  });

  it("aceita nomes amigáveis do comando", () => {
    expect(resolvePlatformSelection(["steam", "epic", "itch"])).toEqual({
      ok: true,
      platforms: ["steam", "epic-games-store", "itchio"],
    });
  });

  it("filtra ofertas pelas preferências", () => {
    expect(matchesPreferences(giveaway, ["steam"])).toBe(true);
    expect(matchesPreferences(giveaway, ["gog"])).toBe(false);
  });
});

describe("mensagens", () => {
  it("escapa HTML e permanece abaixo do limite configurado", () => {
    const chunks = chunkGiveawayMessages(
      [giveaway],
      "<b>Oferta atual</b>",
      3900,
    );

    expect(chunks).toHaveLength(1);
    expect(chunks[0].text).toContain("Jogo &lt;Grátis&gt;");
    expect(chunks[0].text).toContain("a=1&amp;b=2");
    expect(chunks[0].text.length).toBeLessThanOrEqual(3900);
  });

  it("divide listas extensas sem perder ofertas", () => {
    const offers = Array.from({ length: 40 }, (_, index) => ({
      ...giveaway,
      id: index + 1,
      sourceId: String(index + 1),
      title: `Jogo gratuito número ${index + 1}`,
    }));
    const chunks = chunkGiveawayMessages(offers, "<b>Ofertas</b>", 900);

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.text.length <= 900)).toBe(true);
    expect(chunks.flatMap((chunk) => chunk.giveaways)).toHaveLength(40);
  });
});
