import { describe, expect, it } from "vitest";
import { createInitialProjectionState, projectEvent } from "./projections.js";
import type { AlterfordEvent } from "./events.js";

const marketCreated: AlterfordEvent = {
  id: "8453:100:0",
  chainId: 8453,
  blockNumber: 100n,
  txHash: "0xabc",
  logIndex: 0,
  type: "MarketCreated",
  payload: {
    marketId: "1",
    creator: "0x0000000000000000000000000000000000000001",
    title: "Will ETH close above $4,000 this week?",
    category: "Crypto",
    modeAffinity: "Vanilla",
    settlementToken: "0x0000000000000000000000000000000000000010",
    metadataHash: "0xmetadata",
    metadataURI: "ipfs://metadata",
    lockTime: 1_000n,
    resolutionTime: 2_000n,
    state: "Open",
  },
};

describe("Alterford indexer projections", () => {
  it("projects a market event exactly once by event identity", () => {
    const state = createInitialProjectionState();

    projectEvent(state, marketCreated);
    projectEvent(state, marketCreated);

    expect(state.processedEventIds.size).toBe(1);
    expect(state.markets.get("1")?.title).toBe("Will ETH close above $4,000 this week?");
    expect(state.markets.get("1")?.lockTime).toBe(1_000n);
    expect(state.markets.get("1")?.resolutionTime).toBe(2_000n);
  });

  it("tracks terminal market lifecycle events", () => {
    const state = createInitialProjectionState();
    projectEvent(state, marketCreated);
    projectEvent(state, {
      id: "8453:101:1",
      chainId: 8453,
      blockNumber: 101n,
      txHash: "0xcancel",
      logIndex: 1,
      type: "MarketCancelled",
      payload: { marketId: "1", reasonHash: "0xexpired" },
    });

    expect(state.markets.get("1")?.state).toBe("Cancelled");
  });

  it("projects v1.1 growth, reputation, oracle, and moderation events", () => {
    const state = createInitialProjectionState();

    const events: AlterfordEvent[] = [
      marketCreated,
      {
        id: "8453:101:0",
        chainId: 8453,
        blockNumber: 101n,
        txHash: "0xdef",
        logIndex: 0,
        type: "ReferralLinked",
        payload: {
          user: "0x0000000000000000000000000000000000000002",
          referrer: "0x0000000000000000000000000000000000000001",
          codeHash: "0xcode",
        },
      },
      {
        id: "8453:102:0",
        chainId: 8453,
        blockNumber: 102n,
        txHash: "0x123",
        logIndex: 0,
        type: "ReputationUpdated",
        payload: {
          subject: "0x0000000000000000000000000000000000000001",
          scoreType: "creatorQualityScore",
          newScore: 9200,
          reasonHash: "0xquality",
        },
      },
      {
        id: "8453:103:0",
        chainId: 8453,
        blockNumber: 103n,
        txHash: "0x456",
        logIndex: 0,
        type: "OracleResultSubmitted",
        payload: {
          marketId: "1",
          outcome: 0,
          confidence: 9200,
          evidenceId: "7",
        },
      },
      {
        id: "8453:104:0",
        chainId: 8453,
        blockNumber: 104n,
        txHash: "0x789",
        logIndex: 0,
        type: "ContentFlagged",
        payload: {
          caseId: "1",
          entityType: "Market",
          entityId: "1",
          reasonHash: "0xrisk",
        },
      },
      {
        id: "8453:105:0",
        chainId: 8453,
        blockNumber: 105n,
        txHash: "0xbond1",
        logIndex: 0,
        type: "BondCalculated",
        payload: {
          entityType: "Market",
          entityId: "1",
          creator: "0x0000000000000000000000000000000000000001",
          requiredBond: 500_000n,
          reasonFlags: 1,
        },
      },
      {
        id: "8453:106:0",
        chainId: 8453,
        blockNumber: 106n,
        txHash: "0xbond2",
        logIndex: 0,
        type: "BondSlashed",
        payload: {
          entityType: "Market",
          entityId: "1",
          amount: 500_000n,
          reasonHash: "0xfraud",
        },
      },
    ];

    for (const event of events) {
      projectEvent(state, event);
    }

    expect(state.referrals.get("0x0000000000000000000000000000000000000002")?.referrer).toBe(
      "0x0000000000000000000000000000000000000001",
    );
    expect(state.reputation.get("0x0000000000000000000000000000000000000001")?.creatorQualityScore).toBe(9200);
    expect(state.oracleResults.get("1")?.confidence).toBe(9200);
    expect(state.moderationCases.get("1")?.status).toBe("Flagged");
    expect(state.bonds.get("Market:1")?.requiredBond).toBe(500_000n);
    expect(state.bonds.get("Market:1")?.slashedBond).toBe(500_000n);
  });

  it("projects real market flow events for bets, resolution, fees, rewards, and refunds", () => {
    const state = createInitialProjectionState();

    const events: AlterfordEvent[] = [
      marketCreated,
      {
        id: "8453:107:0",
        chainId: 8453,
        blockNumber: 107n,
        txHash: "0xbet1",
        logIndex: 0,
        type: "BetPlaced",
        payload: {
          marketId: "1",
          user: "0x0000000000000000000000000000000000000002",
          outcome: 0,
          amount: 1_000_000n,
        },
      },
      {
        id: "8453:108:0",
        chainId: 8453,
        blockNumber: 108n,
        txHash: "0xbet2",
        logIndex: 0,
        type: "BetPlaced",
        payload: {
          marketId: "1",
          user: "0x0000000000000000000000000000000000000003",
          outcome: 1,
          amount: 3_000_000n,
        },
      },
      {
        id: "8453:109:0",
        chainId: 8453,
        blockNumber: 109n,
        txHash: "0xresolve",
        logIndex: 0,
        type: "MarketResolved",
        payload: {
          marketId: "1",
          winningOutcome: 0,
        },
      },
      {
        id: "8453:109:1",
        chainId: 8453,
        blockNumber: 109n,
        txHash: "0xfees",
        logIndex: 1,
        type: "FeesAccrued",
        payload: {
          marketId: "1",
          admin: "0x0000000000000000000000000000000000000009",
          creator: "0x0000000000000000000000000000000000000001",
          adminFee: 60_000n,
          creatorFee: 45_000n,
        },
      },
      {
        id: "8453:110:0",
        chainId: 8453,
        blockNumber: 110n,
        txHash: "0xclaim",
        logIndex: 0,
        type: "RewardClaimed",
        payload: {
          marketId: "1",
          user: "0x0000000000000000000000000000000000000002",
          amount: 3_895_000n,
        },
      },
      {
        id: "8453:111:0",
        chainId: 8453,
        blockNumber: 111n,
        txHash: "0xrefund",
        logIndex: 0,
        type: "RefundClaimed",
        payload: {
          marketId: "1",
          user: "0x0000000000000000000000000000000000000004",
          amount: 500_000n,
        },
      },
    ];

    for (const event of events) projectEvent(state, event);

    expect(state.markets.get("1")?.totalPool).toBe(4_000_000n);
    expect(state.markets.get("1")?.poolByOutcome.get(1)).toBe(3_000_000n);
    expect(state.markets.get("1")?.state).toBe("Resolved");
    expect(state.fees.get("1")?.creatorFee).toBe(45_000n);
    expect(state.claims.get("1:0x0000000000000000000000000000000000000002:reward")?.amount).toBe(3_895_000n);
    expect(state.claims.get("1:0x0000000000000000000000000000000000000004:refund")?.type).toBe("Refund");
  });

  it("projects performer offers and marks the reward escrowed when a sponsor accepts", () => {
    const state = createInitialProjectionState();
    const performer = "0x0000000000000000000000000000000000000001";
    const sponsor = "0x0000000000000000000000000000000000000002";

    const events: AlterfordEvent[] = [
      {
        id: "8453:200:0",
        chainId: 8453,
        blockNumber: 200n,
        txHash: "0xoffer",
        logIndex: 0,
        type: "ChallengeCreated",
        payload: {
          challengeId: "7",
          creator: performer,
          rewardPool: 100_000_000n,
          rulesHash: "0xrules",
          state: "Open",
        },
      },
      {
        id: "8453:200:1",
        chainId: 8453,
        blockNumber: 200n,
        txHash: "0xoffer",
        logIndex: 1,
        type: "ChallengeFundingModelSelected",
        payload: {
          challengeId: "7",
          fundingModel: "PerformerOffer",
          performer,
          sponsor: "0x0000000000000000000000000000000000000000",
        },
      },
      {
        id: "8453:201:0",
        chainId: 8453,
        blockNumber: 201n,
        txHash: "0xfund",
        logIndex: 0,
        type: "ChallengeRewardFunded",
        payload: { challengeId: "7", sponsor, rewardPool: 100_000_000n },
      },
      {
        id: "8453:201:1",
        chainId: 8453,
        blockNumber: 201n,
        txHash: "0xfund",
        logIndex: 1,
        type: "ChallengeAccepted",
        payload: { challengeId: "7", executor: sponsor, executorBond: 0n },
      },
    ];

    for (const event of events) projectEvent(state, event);

    expect(state.challenges.get("7")).toMatchObject({
      fundingModel: "PerformerOffer",
      performer,
      sponsor,
      rewardEscrowed: true,
      state: "Accepted",
    });
  });
});
