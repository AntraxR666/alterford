import { describe, expect, it } from "vitest";
import type { AlterfordEvent } from "./events.js";
import {
  createBlockCheckpoint,
  replayEventJournal,
  rollbackJournalToBlock,
  shouldReorgFromBlock,
} from "./reorg.js";
import { createInitialProjectionState } from "./projections.js";

const marketEvent: AlterfordEvent = {
  id: "31337:10:0",
  chainId: 31337,
  blockNumber: 10n,
  txHash: "0xmarket",
  logIndex: 0,
  type: "MarketCreated",
  payload: {
    marketId: "1",
    creator: "0x0000000000000000000000000000000000000001",
    title: "Canonical market",
    category: "UserMarkets",
    modeAffinity: "Both",
  },
};

const betEvent: AlterfordEvent = {
  id: "31337:11:0",
  chainId: 31337,
  blockNumber: 11n,
  txHash: "0xbet",
  logIndex: 0,
  type: "BetPlaced",
  payload: {
    marketId: "1",
    user: "0x0000000000000000000000000000000000000002",
    outcome: 0,
    amount: 1_000_000n,
  },
};

describe("indexer reorg journal", () => {
  it("detects a canonical block hash mismatch and identifies the first rollback block", () => {
    const checkpoints = new Map([
      ["10", createBlockCheckpoint(10n, "0xaaa")],
      ["11", createBlockCheckpoint(11n, "0xbbb")],
    ]);

    expect(shouldReorgFromBlock(checkpoints, 10n, "0xaaa")).toBe(null);
    expect(shouldReorgFromBlock(checkpoints, 11n, "0xccc")).toBe(11n);
  });

  it("rolls back journal events after the reorg block and replays the canonical read model", () => {
    const journal = [marketEvent, betEvent];
    const rolledBack = rollbackJournalToBlock(journal, 11n);
    const state = replayEventJournal(createInitialProjectionState(), rolledBack);

    expect(rolledBack).toHaveLength(1);
    expect(state.markets.get("1")?.totalPool).toBe(0n);
    expect(state.bets.size).toBe(0);
  });
});
