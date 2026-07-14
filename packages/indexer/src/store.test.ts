import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { projectEvent } from "./projections.js";
import {
  loadIndexerState,
  replayPersistedJournal,
  saveIndexerState,
  snapshotIndexerState,
} from "./store.js";

let tempDir: string | undefined;

describe("persistent indexer store", () => {
  afterEach(async () => {
    if (tempDir) await rm(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  });

  it("round-trips bigint balances, maps, and cursor data", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "alterford-indexer-"));
    const storePath = join(tempDir, "state.json");
    const state = await loadIndexerState(storePath, {
      chainId: 31337,
      confirmations: 0,
      lastProcessedBlock: 0n,
    });

    projectEvent(state.projection, {
      id: "31337:1:0",
      chainId: 31337,
      blockNumber: 1n,
      txHash: "0xmarket",
      logIndex: 0,
      type: "MarketCreated",
      payload: {
        marketId: "1",
        creator: "0x0000000000000000000000000000000000000001",
        title: "Local test market",
        category: "UserMarkets",
        modeAffinity: "Both",
      },
    });
    projectEvent(state.projection, {
      id: "31337:2:0",
      chainId: 31337,
      blockNumber: 2n,
      txHash: "0xbet",
      logIndex: 0,
      type: "BetPlaced",
      payload: {
        marketId: "1",
        user: "0x0000000000000000000000000000000000000002",
        outcome: 0,
        amount: 1_000_000n,
      },
    });
    state.cursor.lastProcessedBlock = 2n;

    await saveIndexerState(storePath, state);
    expect(await readFile(storePath, "utf8")).toContain("\"lastProcessedBlock\": \"2\"");

    const reloaded = await loadIndexerState(storePath, {
      chainId: 31337,
      confirmations: 0,
      lastProcessedBlock: 0n,
    });

    expect(reloaded.cursor.lastProcessedBlock).toBe(2n);
    expect(reloaded.projection.markets.get("1")?.totalPool).toBe(1_000_000n);
    expect(reloaded.projection.markets.get("1")?.poolByOutcome.get(0)).toBe(1_000_000n);
  });

  it("creates restorable snapshots and replays persisted journals", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "alterford-indexer-"));
    const storePath = join(tempDir, "state.json");
    const state = await loadIndexerState(storePath, {
      chainId: 31337,
      confirmations: 0,
      lastProcessedBlock: 0n,
    });
    const event = {
      id: "31337:3:0",
      chainId: 31337,
      blockNumber: 3n,
      txHash: "0xmarket",
      logIndex: 0,
      type: "MarketCreated" as const,
      payload: {
        marketId: "2",
        creator: "0x0000000000000000000000000000000000000001" as const,
        title: "Replay market",
        category: "UserMarkets" as const,
        modeAffinity: "Both" as const,
      },
    };
    state.journal.push(event);
    state.cursor.lastProcessedBlock = 3n;

    const replayed = replayPersistedJournal(state);
    const snapshot = snapshotIndexerState(replayed);

    expect(replayed.projection.markets.get("2")?.title).toBe("Replay market");
    expect(snapshot.cursor.lastProcessedBlock).toBe("3");
    expect(snapshot.journalLength).toBe(1);
    expect(snapshot.readModel.markets).toBe(1);
  });

  it("round-trips bounty, signed nonce, and challenge dispute projections", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "alterford-indexer-"));
    const storePath = join(tempDir, "state.json");
    const state = await loadIndexerState(storePath, {
      chainId: 31337,
      confirmations: 0,
      lastProcessedBlock: 0n,
    });
    const creator = "0x0000000000000000000000000000000000000001" as const;
    const actor = "0x0000000000000000000000000000000000000002" as const;

    projectEvent(state.projection, {
      id: "31337:10:0",
      chainId: 31337,
      blockNumber: 10n,
      txHash: "0xbounty",
      logIndex: 0,
      type: "BountyCreated",
      payload: {
        bountyId: "4",
        creator,
        rewardPool: 5_000_000n,
        rewardEscrow: 5_000_000n,
        rulesHash: "0xrules",
        deadline: 5_000n,
      },
    });
    projectEvent(state.projection, {
      id: "31337:11:0",
      chainId: 31337,
      blockNumber: 11n,
      txHash: "0xsigned",
      logIndex: 0,
      type: "SignedBetExecuted",
      payload: { marketId: "1", bettor: creator, relayer: actor, outcome: 0, amount: 10n, nonce: 6n },
    });
    projectEvent(state.projection, {
      id: "31337:12:0",
      chainId: 31337,
      blockNumber: 12n,
      txHash: "0xchallenge",
      logIndex: 0,
      type: "ChallengeCreated",
      payload: { challengeId: "5", creator, rewardPool: 9_000_000n, rulesHash: "0xrules" },
    });
    projectEvent(state.projection, {
      id: "31337:13:0",
      chainId: 31337,
      blockNumber: 13n,
      txHash: "0xproposal",
      logIndex: 0,
      type: "ChallengeResolutionProposed",
      payload: {
        challengeId: "5",
        proposer: actor,
        executorSucceeded: true,
        evidenceHash: "0xevidence",
        disputeDeadline: 8_000n,
      },
    });
    projectEvent(state.projection, {
      id: "31337:14:0",
      chainId: 31337,
      blockNumber: 14n,
      txHash: "0xdispute",
      logIndex: 0,
      type: "ChallengeResolutionDisputed",
      payload: { challengeId: "5", disputant: creator, bondAmount: 1_000_000n, reasonHash: "0xreason" },
    });

    await saveIndexerState(storePath, state);
    const reloaded = await loadIndexerState(storePath, state.cursor);

    expect(reloaded.projection.bounties.get("4")?.rewardEscrow).toBe(5_000_000n);
    expect(reloaded.projection.betNonces.get(creator)).toBe(7n);
    expect(reloaded.projection.signedBets.get("31337:11:0")?.amount).toBe(10n);
    expect(reloaded.projection.challenges.get("5")?.resolutionProposal?.disputeDeadline).toBe(8_000n);
    expect(reloaded.projection.challenges.get("5")?.dispute?.bondAmount).toBe(1_000_000n);
  });
});
