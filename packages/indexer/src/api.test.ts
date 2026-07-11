import { describe, expect, it } from "vitest";
import { createReadApi } from "./api.js";
import { createInitialProjectionState, projectEvent } from "./projections.js";
import type { AlterfordEvent } from "./events.js";

describe("Alterford read API", () => {
  it("exposes user-created market question and category from Alterford metadata URIs", () => {
    const state = createInitialProjectionState();
    const event: AlterfordEvent = {
      id: "84532:200:0",
      chainId: 84532,
      blockNumber: 200n,
      txHash: "0xabc",
      logIndex: 0,
      type: "MarketCreated",
      payload: {
        marketId: "7",
        creator: "0x0000000000000000000000000000000000000001",
        title: "Market 7",
        category: "UserMarkets",
        modeAffinity: "Both",
        settlementToken: "0x0000000000000000000000000000000000000010",
        metadataHash: "0xmetadata",
        metadataURI: "alterford://market?question=BTC%20supera%20100k%3F&category=Crypto&mode=Underworld",
      },
    };

    projectEvent(state, event);

    const [market] = createReadApi(state).listMarkets();

    expect(market.title).toBe("BTC supera 100k?");
    expect(market.category).toBe("Crypto");
    expect(market.modeAffinity).toBe("Underworld");
    expect(market.description).toBe("Mercado creado por usuarios en Alterford.");
  });
});
