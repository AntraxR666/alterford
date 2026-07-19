import { describe, expect, it } from "vitest";
import type { AlterfordEvent } from "./events.js";
import { createInitialProjectionState, projectEvent } from "./projections.js";

const creator = "0x0000000000000000000000000000000000000001" as const;
const executor = "0x0000000000000000000000000000000000000002" as const;
const watcher = "0x0000000000000000000000000000000000000003" as const;
const token = "0x0000000000000000000000000000000000000010" as const;
const vault = "0x0000000000000000000000000000000000000020" as const;

function event<T extends AlterfordEvent>(
  type: T["type"],
  payload: T["payload"],
  blockNumber: bigint,
  logIndex = 0,
): T {
  return {
    id: `31337:${blockNumber}:${logIndex}`,
    chainId: 31337,
    blockNumber,
    txHash: `0x${blockNumber.toString(16)}`,
    logIndex,
    type,
    payload,
  } as T;
}

describe("phase 1 resilience projections", () => {
  it("tracks signed bet nonces and explicit invalidation", () => {
    const state = createInitialProjectionState();

    projectEvent(
      state,
      event<Extract<AlterfordEvent, { type: "SignedBetExecuted" }>>(
        "SignedBetExecuted",
        { marketId: "7", bettor: creator, relayer: executor, outcome: 1, amount: 5n, nonce: 2n },
        1n,
      ),
    );
    projectEvent(
      state,
      event<Extract<AlterfordEvent, { type: "NonceInvalidated" }>>(
        "NonceInvalidated",
        { bettor: creator, oldNonce: 3n, newNonce: 10n },
        2n,
      ),
    );

    expect(state.signedBets.get("31337:1:0")?.relayer).toBe(executor);
    expect(state.betNonces.get(creator)).toBe(10n);
  });

  it("projects bounty escrow, submissions, exact winner amounts, and cancellation", () => {
    const state = createInitialProjectionState();

    projectEvent(
      state,
      event<Extract<AlterfordEvent, { type: "BountyCreated" }>>(
        "BountyCreated",
        {
          bountyId: "1",
          creator,
          rewardPool: 3_000_000n,
          rewardEscrow: 3_000_000n,
          rulesHash: "0xrules",
          settlementToken: token,
          deadline: 9_999n,
          metadataURI: "alterford://bounty?title=Audit",
          state: "Open",
        },
        10n,
      ),
    );
    projectEvent(
      state,
      event<Extract<AlterfordEvent, { type: "SubmissionCreated" }>>(
        "SubmissionCreated",
        { bountyId: "1", submitter: executor, submissionHash: "0xsubmission" },
        11n,
      ),
    );
    projectEvent(
      state,
      event<any>(
        "SubmissionEvidenceCreated",
        {
          bountyId: "1",
          submitter: executor,
          submissionHash: "0xevidence",
          evidenceURI: "ipfs://bafy-evidence",
        },
        11n,
        1,
      ),
    );
    projectEvent(
      state,
      event<Extract<AlterfordEvent, { type: "BountyResolved" }>>(
        "BountyResolved",
        { bountyId: "1", winners: [executor, watcher], amounts: [2_000_000n, 1_000_000n] },
        12n,
      ),
    );

    const bounty = state.bounties.get("1");
    expect(bounty?.state).toBe("Resolved");
    expect(bounty?.rewardEscrow).toBe(0n);
    expect(bounty?.submissions).toEqual([{
      submitter: executor,
      submissionHash: "0xevidence",
      evidenceURI: "ipfs://bafy-evidence",
    }]);
    expect(bounty?.winners).toEqual([executor, watcher]);
    expect(bounty?.amounts).toEqual([2_000_000n, 1_000_000n]);

    projectEvent(
      state,
      event<Extract<AlterfordEvent, { type: "BountyCreated" }>>(
        "BountyCreated",
        {
          bountyId: "2",
          creator,
          rewardPool: 1_000_000n,
          rulesHash: "0xrules2",
          settlementToken: token,
          deadline: 10_000n,
          metadataURI: "",
          state: "Open",
        },
        13n,
      ),
    );
    projectEvent(
      state,
      event<Extract<AlterfordEvent, { type: "BountyCancelled" }>>(
        "BountyCancelled",
        { bountyId: "2", reasonHash: "0xcancelled" },
        14n,
      ),
    );
    expect(state.bounties.get("2")).toMatchObject({
      state: "Cancelled",
      rewardEscrow: 0n,
      lastReasonHash: "0xcancelled",
    });
  });

  it("projects emergency bounty and vault recoveries", () => {
    const state = createInitialProjectionState();
    projectEvent(
      state,
      event<Extract<AlterfordEvent, { type: "BountyCreated" }>>(
        "BountyCreated",
        {
          bountyId: "3",
          creator,
          rewardPool: 4_000_000n,
          rulesHash: "0xrules3",
          settlementToken: token,
          deadline: 10_000n,
          metadataURI: "",
          state: "Open",
        },
        20n,
      ),
    );
    projectEvent(
      state,
      event<Extract<AlterfordEvent, { type: "EmergencyBountyRecovered" }>>(
        "EmergencyBountyRecovered",
        {
          bountyId: "3",
          token,
          recoveryVault: vault,
          rewardAmount: 4_000_000n,
          bondAmount: 500_000n,
          incidentHash: "0xincident",
          securityAdmin: watcher,
        },
        21n,
      ),
    );
    projectEvent(
      state,
      event<Extract<AlterfordEvent, { type: "EmergencyLiquidityRecovered" }>>(
        "EmergencyLiquidityRecovered",
        { token, coldWallet: creator, amount: 4_500_000n, incidentHash: "0xincident", securityAdmin: watcher },
        22n,
      ),
    );

    expect(state.bounties.get("3")).toMatchObject({
      state: "EmergencyRecovered",
      rewardEscrow: 0n,
      recoveryVault: vault,
      recoveredRewardAmount: 4_000_000n,
      recoveredBondAmount: 500_000n,
    });
    expect(state.vaultRecoveries.get("31337:22:0")?.amount).toBe(4_500_000n);
  });

  it("persists challenge proposal, dispute, and arbiter resolution details", () => {
    const state = createInitialProjectionState();
    projectEvent(
      state,
      event<Extract<AlterfordEvent, { type: "ChallengeCreated" }>>(
        "ChallengeCreated",
        {
          challengeId: "9",
          creator,
          rewardPool: 8_000_000n,
          rulesHash: "0xrules",
          settlementToken: token,
          deadline: 10_000n,
          state: "Open",
          riskLevel: "High",
        },
        30n,
      ),
    );
    projectEvent(
      state,
      event<Extract<AlterfordEvent, { type: "ChallengeResolutionProposed" }>>(
        "ChallengeResolutionProposed",
        {
          challengeId: "9",
          proposer: executor,
          executorSucceeded: true,
          evidenceHash: "0xevidence",
          disputeDeadline: 20_000n,
        },
        31n,
      ),
    );
    projectEvent(
      state,
      event<Extract<AlterfordEvent, { type: "ChallengeResolutionDisputed" }>>(
        "ChallengeResolutionDisputed",
        { challengeId: "9", disputant: watcher, bondAmount: 1_000_000n, reasonHash: "0xdispute" },
        32n,
      ),
    );
    projectEvent(
      state,
      event<Extract<AlterfordEvent, { type: "ChallengeDisputeResolved" }>>(
        "ChallengeDisputeResolved",
        { challengeId: "9", executorSucceeded: false, disputeSucceeded: true, reasonHash: "0xarbiter" },
        33n,
      ),
    );

    expect(state.challenges.get("9")).toMatchObject({
      state: "Disputed",
      riskLevel: "High",
      resolutionProposal: {
        proposer: executor,
        executorSucceeded: true,
        evidenceHash: "0xevidence",
        disputeDeadline: 20_000n,
      },
      dispute: {
        disputant: watcher,
        bondAmount: 1_000_000n,
        reasonHash: "0xdispute",
        resolved: true,
        disputeSucceeded: true,
        executorSucceeded: false,
        resolutionReasonHash: "0xarbiter",
      },
    });
  });
});
