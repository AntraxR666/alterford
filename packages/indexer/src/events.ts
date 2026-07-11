import type { Address, Category, ChallengeState, ModeAffinity } from "@alterford/sdk";

export interface EventEnvelope<TType extends string, TPayload> {
  id: string;
  chainId: number;
  blockNumber: bigint;
  txHash: string;
  logIndex: number;
  type: TType;
  payload: TPayload;
}

export type BondEntityType = "Market" | "Bounty" | "Challenge" | "ChallengeExecutor";

export type AlterfordEvent =
  | EventEnvelope<
      "MarketCreated",
      {
        marketId: string;
        creator: Address;
        title: string;
        category: Category;
        modeAffinity: ModeAffinity;
        settlementToken?: Address;
        metadataHash?: string;
        metadataURI?: string;
      }
    >
  | EventEnvelope<
      "BetPlaced",
      {
        marketId: string;
        user: Address;
        outcome: number;
        amount: bigint;
      }
    >
  | EventEnvelope<
      "MarketResolved",
      {
        marketId: string;
        winningOutcome: number;
      }
    >
  | EventEnvelope<
      "FeesAccrued",
      {
        marketId: string;
        admin: Address;
        creator: Address;
        adminFee: bigint;
        creatorFee: bigint;
      }
    >
  | EventEnvelope<
      "RewardClaimed",
      {
        marketId: string;
        user: Address;
        amount: bigint;
      }
    >
  | EventEnvelope<
      "RefundClaimed",
      {
        marketId: string;
        user: Address;
        amount: bigint;
      }
    >
  | EventEnvelope<
      "ChallengeCreated",
      {
        challengeId: string;
        creator: Address;
        rewardPool: bigint;
        rulesHash: string;
        settlementToken?: Address;
        metadataURI?: string;
        deadline?: bigint;
        state?: ChallengeState;
      }
    >
  | EventEnvelope<
      "ChallengeAccepted",
      {
        challengeId: string;
        executor: Address;
        executorBond: bigint;
      }
    >
  | EventEnvelope<
      "ChallengeLiveStreamUpdated",
      {
        challengeId: string;
        actor: Address;
        liveStreamURI: string;
      }
    >
  | EventEnvelope<
      "ChallengeEvidenceSubmitted",
      {
        challengeId: string;
        executor: Address;
        evidenceHash: string;
        evidenceURI: string;
        liveStreamURI: string;
      }
    >
  | EventEnvelope<
      "ChallengeResolved",
      {
        challengeId: string;
        winner: Address;
        executorSucceeded: boolean;
        rewardPayout: bigint;
        adminFee: bigint;
        creatorFee: bigint;
      }
    >
  | EventEnvelope<
      "ChallengeCancelled",
      {
        challengeId: string;
        reasonHash: string;
      }
    >
  | EventEnvelope<
      "ChallengeFraudConfirmed",
      {
        challengeId: string;
        offender: Address;
        reasonHash: string;
      }
    >
  | EventEnvelope<
      "ReferralLinked",
      {
        user: Address;
        referrer: Address;
        codeHash: string;
      }
    >
  | EventEnvelope<
      "QuestCompleted",
      {
        questId: string;
        user: Address;
      }
    >
  | EventEnvelope<
      "ReputationUpdated",
      {
        subject: Address;
        scoreType: "creatorQualityScore" | "userTrustScore" | "sybilRiskScore";
        newScore: number;
        reasonHash: string;
      }
    >
  | EventEnvelope<
      "OracleResultSubmitted",
      {
        marketId: string;
        outcome: number;
        confidence: number;
        evidenceId: string;
      }
    >
  | EventEnvelope<
      "ContentFlagged",
      {
        caseId: string;
        entityType: "Market" | "Bounty" | "Challenge";
        entityId: string;
        reasonHash: string;
      }
    >
  | EventEnvelope<
      "BondCalculated",
      {
        entityType: BondEntityType;
        entityId: string;
        creator: Address;
        requiredBond: bigint;
        reasonFlags: number;
      }
    >
  | EventEnvelope<
      "BondLocked",
      {
        entityType: BondEntityType;
        entityId: string;
        creator: Address;
        amount: bigint;
      }
    >
  | EventEnvelope<
      "BondReleased",
      {
        entityType: BondEntityType;
        entityId: string;
        creator: Address;
        amount: bigint;
      }
    >
  | EventEnvelope<
      "BondSlashed",
      {
        entityType: BondEntityType;
        entityId: string;
        amount: bigint;
        reasonHash: string;
      }
    >;

export function eventIdentity(event: Pick<AlterfordEvent, "chainId" | "blockNumber" | "logIndex">): string {
  return `${event.chainId}:${event.blockNumber.toString()}:${event.logIndex}`;
}
