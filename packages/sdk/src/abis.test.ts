import { describe, expect, it } from "vitest";
import * as sdk from "./index.js";

function item(abi: readonly any[], type: string, name: string) {
  return abi.find((entry) => entry.type === type && entry.name === name);
}

describe("phase 1 resilience ABIs", () => {
  it("does not accept caller-supplied creator reputation in creation functions", () => {
    const marketCreate = item((sdk as any).marketFactoryAbi, "function", "createMarket");
    const bountyCreate = item((sdk as any).bountyFactoryAbi, "function", "createBounty");
    const challengeCreate = item((sdk as any).challengeFactoryAbi, "function", "createChallenge");

    expect(marketCreate.inputs.at(-1)).toMatchObject({ name: "categoryId", type: "bytes32" });
    expect(bountyCreate.inputs.at(-1)).toMatchObject({ name: "categoryId", type: "bytes32" });
    expect(challengeCreate.inputs.at(-1)).toMatchObject({ name: "categoryId", type: "bytes32" });
    expect([marketCreate, bountyCreate, challengeCreate].some((entry) =>
      entry.inputs.some((input: any) => input.name === "bondContext"),
    )).toBe(false);
  });

  it("exposes signed bet functions and events", () => {
    const abi = (sdk as any).marketFactoryAbi as readonly any[];

    expect(item(abi, "function", "placeBetBySig")?.inputs.map((input: any) => input.type)).toEqual([
      "tuple",
      "bytes",
    ]);
    expect(item(abi, "function", "nonces")?.outputs[0].type).toBe("uint256");
    expect(item(abi, "function", "invalidateNonce")?.inputs[0].type).toBe("uint256");
    expect(item(abi, "event", "SignedBetExecuted")?.inputs.map((input: any) => input.name)).toEqual([
      "marketId",
      "bettor",
      "relayer",
      "outcome",
      "amount",
      "nonce",
    ]);
    expect(item(abi, "event", "NonceInvalidated")?.inputs.map((input: any) => input.indexed)).toEqual([
      true,
      false,
      false,
    ]);
  });

  it("exposes bounty escrow, amount-aware resolution, cancellation, and recovery", () => {
    expect(Array.isArray((sdk as any).bountyFactoryAbi)).toBe(true);
    const abi = (sdk as any).bountyFactoryAbi as readonly any[];

    expect(item(abi, "function", "bounties")?.outputs.map((output: any) => output.name)).toEqual([
      "creator",
      "settlementToken",
      "rewardPool",
      "deadline",
      "rulesHash",
      "metadataURI",
      "state",
      "categoryId",
      "mode",
      "riskLevel",
    ]);
    expect(item(abi, "function", "rewardEscrowByBounty")?.outputs[0].type).toBe("uint256");
    expect(item(abi, "function", "submitEvidence")?.inputs.map((input: any) => input.type)).toEqual([
      "uint256",
      "bytes32",
      "string",
    ]);
    expect(item(abi, "event", "SubmissionEvidenceCreated")?.inputs.map((input: any) => input.type)).toEqual([
      "uint256",
      "address",
      "bytes32",
      "string",
    ]);
    expect(item(abi, "function", "resolveBounty")?.inputs.map((input: any) => input.type)).toEqual([
      "uint256",
      "address[]",
      "uint256[]",
    ]);
    expect(item(abi, "event", "BountyResolved")?.inputs.map((input: any) => input.type)).toEqual([
      "uint256",
      "address[]",
      "uint256[]",
    ]);
    expect(item(abi, "event", "EmergencyBountyRecovered")?.inputs.map((input: any) => input.name)).toEqual([
      "bountyId",
      "token",
      "recoveryVault",
      "rewardAmount",
      "bondAmount",
      "incidentHash",
      "securityAdmin",
    ]);
  });

  it("exposes the recovery vault interface", () => {
    expect(Array.isArray((sdk as any).bountyRecoveryVaultAbi)).toBe(true);
    const abi = (sdk as any).bountyRecoveryVaultAbi as readonly any[];

    expect(item(abi, "function", "recoverToColdWallet")?.inputs.map((input: any) => input.type)).toEqual([
      "address",
      "uint256",
      "bytes32",
    ]);
    expect(item(abi, "event", "EmergencyLiquidityRecovered")?.inputs.map((input: any) => input.name)).toEqual([
      "token",
      "coldWallet",
      "amount",
      "incidentHash",
      "securityAdmin",
    ]);
  });

  it("exposes challenge proposal, confirmation, dispute, finalization, and early resolution", () => {
    const abi = (sdk as any).challengeFactoryAbi as readonly any[];
    const functions = [
      "proposeResolution",
      "confirmResolution",
      "disputeResolution",
      "finalizeUndisputed",
      "resolveDispute",
      "resolveEarly",
      "resolutionWindowFor",
      "disputeBondFor",
    ];
    const events = [
      "ChallengeResolutionProposed",
      "ChallengeResolutionConfirmed",
      "ChallengeResolutionDisputed",
      "ChallengeDisputeResolved",
      "ChallengeResolvedEarly",
    ];

    expect(functions.every((name) => item(abi, "function", name))).toBe(true);
    expect(events.every((name) => item(abi, "event", name))).toBe(true);
    expect(item(abi, "function", "challenges")?.outputs.at(-1)).toEqual({
      name: "riskLevel",
      type: "uint8",
    });
  });

  it("exposes performer-funded challenge creation and escrow state", () => {
    const abi = (sdk as any).challengeFactoryAbi as readonly any[];

    expect(item(abi, "function", "createPerformerOffer")).toBeUndefined();
    expect(item(abi, "function", "createChallenge")?.inputs.at(-1)).toMatchObject({
      name: "categoryId",
      type: "bytes32",
    });
    expect(item(abi, "function", "fundingModelByChallenge")?.outputs[0].type).toBe("uint8");
    expect(item(abi, "function", "rewardEscrowedByChallenge")?.outputs[0].type).toBe("bool");
    expect(item(abi, "function", "sponsorOf")?.outputs[0].type).toBe("address");
    expect(item(abi, "function", "performerOf")?.outputs[0].type).toBe("address");
    expect(item(abi, "event", "ChallengeRewardFunded")?.inputs.map((input: any) => input.name)).toEqual([
      "challengeId",
      "sponsor",
      "rewardPool",
    ]);
  });
});
