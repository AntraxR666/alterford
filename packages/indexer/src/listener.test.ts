import {
  bountyFactoryAbi,
  bondCategoryId,
  bountyRecoveryVaultAbi,
  challengeFactoryAbi,
  marketFactoryAbi,
} from "@alterford/sdk";
import { encodeAbiParameters, encodeEventTopics, padHex, type Address, type Hex } from "viem";
import { describe, expect, it, vi } from "vitest";
import * as listener from "./listener.js";

const creator = "0x0000000000000000000000000000000000000001" as const;
const actor = "0x0000000000000000000000000000000000000002" as const;
const token = "0x0000000000000000000000000000000000000010" as const;
const marketFactory = "0x0000000000000000000000000000000000000100" as const;
const bountyFactory = "0x0000000000000000000000000000000000000200" as const;
const challengeFactory = "0x0000000000000000000000000000000000000300" as const;
const vault = "0x0000000000000000000000000000000000000400" as const;
const hash = (value: number) => padHex(`0x${value.toString(16)}` as Hex, { size: 32 });

function encodedLog(
  abi: readonly any[],
  eventName: string,
  args: Record<string, unknown>,
  address: Address,
  logIndex = 0,
) {
  const event = abi.find((entry) => entry.type === "event" && entry.name === eventName);
  if (!event) throw new Error(`Missing ${eventName} ABI`);
  const topics = encodeEventTopics({ abi: [event], eventName, args } as any);
  const dataInputs = event.inputs.filter((input: any) => !input.indexed);
  const data = encodeAbiParameters(
    dataInputs.map((input: any) => ({ name: input.name, type: input.type })) as any,
    dataInputs.map((input: any) => args[input.name]) as any,
  );
  return {
    address,
    blockNumber: 100n,
    transactionHash: hash(99),
    logIndex,
    data,
    topics,
  };
}

describe("real Alterford log decoder", () => {
  it("is exported for deterministic decoder verification", () => {
    expect(typeof (listener as any).decodeAlterfordLog).toBe("function");
  });

  it("reads market lifecycle timestamps from the getter when MarketCreated is decoded", async () => {
    const client = {
      readContract: vi.fn().mockResolvedValue([
        creator,
        token,
        hash(11),
        "alterford://market?question=Will+ETH+rise%3F",
        11_000n,
        12_000n,
        1,
        0,
        0,
        bondCategoryId("VANILLA_MARKET"),
        0,
        1,
      ]),
    };
    const log = encodedLog(
      marketFactoryAbi,
      "MarketCreated",
      {
        marketId: 5n,
        creator,
        settlementToken: token,
        metadataHash: hash(11),
        metadataURI: "alterford://market?question=Will+ETH+rise%3F",
        categoryId: bondCategoryId("VANILLA_MARKET"),
        mode: 0,
        riskLevel: 1,
      },
      marketFactory,
    );

    const decoded = await (listener as any).decodeAlterfordLog(
      31337,
      log,
      client,
      challengeFactory,
      bountyFactory,
    );

    expect(decoded).toMatchObject({
      type: "MarketCreated",
      payload: {
        marketId: "5",
        settlementToken: token,
        lockTime: 11_000n,
        resolutionTime: 12_000n,
        state: "Open",
      },
    });
    expect(client.readContract).toHaveBeenCalledWith(
      expect.objectContaining({ address: marketFactory, functionName: "markets", args: [5n] }),
    );
  });

  it("hydrates legacy market projections that predate lifecycle indexing", async () => {
    const state = (await import("./projections.js")).createInitialProjectionState();
    state.markets.set("5", {
      marketId: "5",
      creator,
      title: "Legacy market",
      category: "Crypto",
      modeAffinity: "Vanilla",
      state: "Open",
      totalPool: 0n,
      poolByOutcome: new Map(),
    });
    const client = {
      readContract: vi.fn().mockResolvedValue([
        creator,
        token,
        hash(11),
        "alterford://market?question=Legacy",
        11_000n,
        12_000n,
        5,
      ]),
    };

    const hydrated = await listener.hydrateMarketLifecycle(state, client as any, marketFactory);

    expect(hydrated).toBe(1);
    expect(state.markets.get("5")).toMatchObject({
      lockTime: 11_000n,
      resolutionTime: 12_000n,
      state: "Cancelled",
    });
  });

  it("reads bounty details from the getter when BountyCreated is decoded", async () => {
    const client = {
      readContract: vi.fn().mockResolvedValue([
        creator,
        token,
        5_000_000n,
        9_999n,
        hash(1),
        "alterford://bounty?title=Audit",
        0,
        bondCategoryId("VANILLA_BOUNTY"),
        0,
        1,
      ]),
    };
    const log = encodedLog(
      bountyFactoryAbi,
      "BountyCreated",
      {
        bountyId: 4n,
        creator,
        rewardPool: 5_000_000n,
        rulesHash: hash(1),
        categoryId: bondCategoryId("VANILLA_BOUNTY"),
        mode: 0,
        riskLevel: 1,
      },
      bountyFactory,
    );

    const decoded = await (listener as any).decodeAlterfordLog(
      31337,
      log,
      client,
      challengeFactory,
      bountyFactory,
    );

    expect(decoded).toMatchObject({
      type: "BountyCreated",
      payload: {
        bountyId: "4",
        creator,
        settlementToken: token,
        rewardPool: 5_000_000n,
        rewardEscrow: 5_000_000n,
        deadline: 9_999n,
        metadataURI: "alterford://bounty?title=Audit",
        state: "Open",
      },
    });
    expect(client.readContract).toHaveBeenCalledWith(
      expect.objectContaining({ address: bountyFactory, functionName: "bounties", args: [4n] }),
    );
  });

  it("decodes reviewable bounty evidence URI from its on-chain event", async () => {
    const log = encodedLog(
      bountyFactoryAbi,
      "SubmissionEvidenceCreated",
      {
        bountyId: 4n,
        submitter: actor,
        submissionHash: hash(7),
        evidenceURI: "ipfs://bafy-evidence",
      },
      bountyFactory,
    );

    const decoded = await (listener as any).decodeAlterfordLog(
      31337,
      log,
      { readContract: vi.fn() },
      challengeFactory,
      bountyFactory,
    );

    expect(decoded).toMatchObject({
      type: "SubmissionEvidenceCreated",
      payload: {
        bountyId: "4",
        submitter: actor,
        submissionHash: hash(7),
        evidenceURI: "ipfs://bafy-evidence",
      },
    });
  });

  it("reads Challenge riskLevel from the extended getter", async () => {
    const client = {
      readContract: vi.fn().mockResolvedValue([
        creator,
        actor,
        token,
        hash(2),
        "alterford://challenge?title=Stream",
        "https://live.example",
        8_000_000n,
        10_000n,
        0,
        hash(3),
        "ipfs://evidence",
        bondCategoryId("UNDERWORLD_CHALLENGE"),
        1,
        2,
      ]),
    };
    const log = encodedLog(
      challengeFactoryAbi,
      "ChallengeCreated",
      {
        challengeId: 9n,
        creator,
        rewardPool: 8_000_000n,
        rulesHash: hash(2),
        categoryId: bondCategoryId("UNDERWORLD_CHALLENGE"),
        mode: 1,
        riskLevel: 2,
      },
      challengeFactory,
    );

    const decoded = await (listener as any).decodeAlterfordLog(
      31337,
      log,
      client,
      challengeFactory,
      bountyFactory,
    );

    expect(decoded).toMatchObject({
      type: "ChallengeCreated",
      payload: { challengeId: "9", riskLevel: "High", state: "Open" },
    });
  });

  it("decodes signed bet, bounty recovery, vault, and challenge resolution events", async () => {
    const client = { readContract: vi.fn() };
    const cases = [
      {
        abi: marketFactoryAbi,
        name: "SignedBetExecuted",
        address: marketFactory,
        args: { marketId: 7n, bettor: creator, relayer: actor, outcome: 1, amount: 10n, nonce: 3n },
        expected: { type: "SignedBetExecuted", payload: { marketId: "7", bettor: creator, relayer: actor, nonce: 3n } },
      },
      {
        abi: marketFactoryAbi,
        name: "NonceInvalidated",
        address: marketFactory,
        args: { bettor: creator, oldNonce: 4n, newNonce: 12n },
        expected: { type: "NonceInvalidated", payload: { bettor: creator, oldNonce: 4n, newNonce: 12n } },
      },
      {
        abi: bountyFactoryAbi,
        name: "BountyResolved",
        address: bountyFactory,
        args: { bountyId: 4n, winners: [creator, actor], amounts: [6n, 4n] },
        expected: { type: "BountyResolved", payload: { bountyId: "4", winners: [creator, actor], amounts: [6n, 4n] } },
      },
      {
        abi: bountyFactoryAbi,
        name: "EmergencyBountyRecovered",
        address: bountyFactory,
        args: {
          bountyId: 4n,
          token,
          recoveryVault: vault,
          rewardAmount: 10n,
          bondAmount: 2n,
          incidentHash: hash(4),
          securityAdmin: actor,
        },
        expected: {
          type: "EmergencyBountyRecovered",
          payload: { bountyId: "4", recoveryVault: vault, rewardAmount: 10n, bondAmount: 2n },
        },
      },
      {
        abi: bountyRecoveryVaultAbi,
        name: "EmergencyLiquidityRecovered",
        address: vault,
        args: { token, coldWallet: creator, amount: 12n, incidentHash: hash(4), securityAdmin: actor },
        expected: { type: "EmergencyLiquidityRecovered", payload: { token, coldWallet: creator, amount: 12n } },
      },
      {
        abi: challengeFactoryAbi,
        name: "ChallengeResolutionProposed",
        address: challengeFactory,
        args: {
          challengeId: 9n,
          proposer: actor,
          executorSucceeded: true,
          evidenceHash: hash(5),
          disputeDeadline: 20_000n,
        },
        expected: {
          type: "ChallengeResolutionProposed",
          payload: { challengeId: "9", proposer: actor, disputeDeadline: 20_000n },
        },
      },
      {
        abi: challengeFactoryAbi,
        name: "ChallengeResolutionDisputed",
        address: challengeFactory,
        args: { challengeId: 9n, disputant: creator, bondAmount: 1_000_000n, reasonHash: hash(6) },
        expected: {
          type: "ChallengeResolutionDisputed",
          payload: { challengeId: "9", disputant: creator, bondAmount: 1_000_000n },
        },
      },
      {
        abi: challengeFactoryAbi,
        name: "ChallengeDisputeResolved",
        address: challengeFactory,
        args: { challengeId: 9n, executorSucceeded: false, disputeSucceeded: true, reasonHash: hash(7) },
        expected: {
          type: "ChallengeDisputeResolved",
          payload: { challengeId: "9", executorSucceeded: false, disputeSucceeded: true },
        },
      },
      {
        abi: challengeFactoryAbi,
        name: "ChallengeResolvedEarly",
        address: challengeFactory,
        args: { challengeId: 9n, executorSucceeded: true, reasonHash: hash(8) },
        expected: { type: "ChallengeResolvedEarly", payload: { challengeId: "9", executorSucceeded: true } },
      },
    ];

    for (const [index, testCase] of cases.entries()) {
      const decoded = await (listener as any).decodeAlterfordLog(
        31337,
        encodedLog(testCase.abi, testCase.name, testCase.args, testCase.address, index),
        client,
        challengeFactory,
        bountyFactory,
      );
      expect(decoded).toMatchObject(testCase.expected);
    }
  });
});
