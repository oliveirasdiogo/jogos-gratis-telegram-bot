import { describe, expect, it } from "vitest";
import {
  parseGamerPowerDate,
  parseGamerPowerGiveaways,
} from "../src/gamerpower";

describe("GamerPower", () => {
  it("interpreta datas sem fuso como UTC", () => {
    expect(parseGamerPowerDate("2026-07-13 12:30:00")).toBe(
      "2026-07-13T12:30:00.000Z",
    );
    expect(parseGamerPowerDate("N/A")).toBeNull();
  });

  it("aceita somente jogos ativos de PC com campos essenciais", () => {
    const result = parseGamerPowerGiveaways([
      {
        id: 10,
        title: "Exemplo",
        type: "Game",
        status: "Active",
        platforms: "PC, Steam",
        worth: "$9.99",
        open_giveaway_url: "https://example.com/claim",
        gamerpower_url: "https://www.gamerpower.com/example",
        published_date: "2026-07-13 10:00:00",
        end_date: "N/A",
      },
      {
        id: 11,
        title: "Apenas console",
        type: "Game",
        status: "Active",
        platforms: "Playstation 5",
        open_giveaway_url: "https://example.com/console",
      },
      {
        id: 12,
        title: "Item de jogo",
        type: "Loot",
        status: "Active",
        platforms: "PC",
        open_giveaway_url: "https://example.com/loot",
      },
    ]);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      sourceId: "10",
      title: "Exemplo",
      platforms: ["steam", "pc"],
      endsAt: null,
    });
  });
});
