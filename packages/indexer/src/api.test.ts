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

  it("lists and retrieves metadata-enriched bounties", () => {
    const state = createInitialProjectionState();
    projectEvent(state, {
      id: "84532:201:0",
      chainId: 84532,
      blockNumber: 201n,
      txHash: "0xbounty",
      logIndex: 0,
      type: "BountyCreated",
      payload: {
        bountyId: "3",
        creator: "0x0000000000000000000000000000000000000001",
        rewardPool: 5_000_000n,
        rulesHash: "0xrules",
        metadataURI: "alterford://bounty?title=Audit%20SDK&description=Revisar%20firmas",
      },
    });

    const api = createReadApi(state);

    expect(api.listBounties()).toHaveLength(1);
    expect(api.getBounty("3")).toMatchObject({
      title: "Audit SDK",
      description: "Revisar firmas",
      rewardEscrow: 5_000_000n,
    });
  });

  it("filters bet and claim history by user case-insensitively", () => {
    const state = createInitialProjectionState();
    const user = "0xabcdef0000000000000000000000000000000001" as const;
    const other = "0x0000000000000000000000000000000000000002" as const;
    const events: AlterfordEvent[] = [
      {
        id: "84532:202:0",
        chainId: 84532,
        blockNumber: 202n,
        txHash: "0xbet",
        logIndex: 0,
        type: "BetPlaced",
        payload: { marketId: "7", user, outcome: 0, amount: 10n },
      },
      {
        id: "84532:202:1",
        chainId: 84532,
        blockNumber: 202n,
        txHash: "0xbet2",
        logIndex: 1,
        type: "BetPlaced",
        payload: { marketId: "7", user: other, outcome: 1, amount: 20n },
      },
      {
        id: "84532:203:0",
        chainId: 84532,
        blockNumber: 203n,
        txHash: "0xclaim",
        logIndex: 0,
        type: "RewardClaimed",
        payload: { marketId: "7", user, amount: 15n },
      },
    ];
    for (const event of events) projectEvent(state, event);

    const api = createReadApi(state);

    expect(api.listBets(undefined, user.toUpperCase())).toHaveLength(1);
    expect(api.listClaims("7", user.toUpperCase())).toHaveLength(1);
  });
});
