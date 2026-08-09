import type {
  Address,
  BountyState,
  Category,
  ChallengeFundingModel,
  ChallengeState,
  MarketState,
  ModeAffinity,
  RiskLevel,
} from "@alterford/sdk";

export interface EventEnvelope<TType extends string, TPayload> {
  id: string;
  chainId: number;
  blockNumber: bigint;
  txHash: string;
  logIndex: number;
  type: TType;
  payload: TPayload;
}

export type BondEntityType =
  | "Market"
  | "Bounty"
  | "Challenge"
  | "ChallengeExecutor"
  | "ChallengeDispute";

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
        categoryId?: string;
        riskLevel?: RiskLevel;
        lockTime?: bigint;
        resolutionTime?: bigint;
        state?: MarketState;
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
  | EventEnvelope<"MarketLocked", { marketId: string }>
  | EventEnvelope<"MarketCancelled", { marketId: string; reasonHash: string }>
  | EventEnvelope<"MarketFraudConfirmed", { marketId: string; reasonHash: string }>
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
      "SignedBetExecuted",
      {
        marketId: string;
        bettor: Address;
        relayer: Address;
        outcome: number;
        amount: bigint;
        nonce: bigint;
      }
    >
  | EventEnvelope<
      "NonceInvalidated",
      {
        bettor: Address;
        oldNonce: bigint;
        newNonce: bigint;
      }
    >
  | EventEnvelope<
      "BountyCreated",
      {
        bountyId: string;
        creator: Address;
        rewardPool: bigint;
        rewardEscrow?: bigint;
        rulesHash: string;
        settlementToken?: Address;
        deadline?: bigint;
        metadataURI?: string;
        state?: BountyState;
        categoryId?: string;
        modeAffinity?: ModeAffinity;
        riskLevel?: RiskLevel;
      }
    >
  | EventEnvelope<
      "SubmissionCreated",
      {
        bountyId: string;
        submitter: Address;
        submissionHash: string;
      }
    >
  | EventEnvelope<
      "SubmissionEvidenceCreated",
      {
        bountyId: string;
        submitter: Address;
        submissionHash: string;
        evidenceURI: string;
      }
    >
  | EventEnvelope<
      "BountyResolved",
      {
        bountyId: string;
        winners: Address[];
        amounts: bigint[];
      }
    >
  | EventEnvelope<
      "BountyCancelled",
      {
        bountyId: string;
        reasonHash: string;
      }
    >
  | EventEnvelope<
      "RecoveryVaultUpdated",
      {
        oldVault: Address;
        newVault: Address;
      }
    >
  | EventEnvelope<
      "EmergencyBountyRecovered",
      {
        bountyId: string;
        token: Address;
        recoveryVault: Address;
        rewardAmount: bigint;
        bondAmount: bigint;
        incidentHash: string;
        securityAdmin: Address;
      }
    >
  | EventEnvelope<
      "EmergencyLiquidityRecovered",
      {
        token: Address;
        coldWallet: Address;
        amount: bigint;
        incidentHash: string;
        securityAdmin: Address;
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
        riskLevel?: RiskLevel;
        categoryId?: string;
        modeAffinity?: ModeAffinity;
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
      "ChallengeFundingModelSelected",
      {
        challengeId: string;
        fundingModel: ChallengeFundingModel;
        performer: Address;
        sponsor: Address;
      }
    >
  | EventEnvelope<
      "ChallengeRewardFunded",
      {
        challengeId: string;
        sponsor: Address;
        rewardPool: bigint;
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
      "ResolutionWindowUpdated",
      {
        oldWindow: bigint;
        newWindow: bigint;
      }
    >
  | EventEnvelope<
      "ChallengeResolutionProposed",
      {
        challengeId: string;
        proposer: Address;
        executorSucceeded: boolean;
        evidenceHash: string;
        disputeDeadline: bigint;
      }
    >
  | EventEnvelope<
      "ChallengeResolutionConfirmed",
      {
        challengeId: string;
        confirmer: Address;
        executorSucceeded: boolean;
      }
    >
  | EventEnvelope<
      "ChallengeResolutionDisputed",
      {
        challengeId: string;
        disputant: Address;
        bondAmount: bigint;
        reasonHash: string;
      }
    >
  | EventEnvelope<
      "ChallengeDisputeResolved",
      {
        challengeId: string;
        executorSucceeded: boolean;
        disputeSucceeded: boolean;
        reasonHash: string;
      }
    >
  | EventEnvelope<
      "ChallengeResolvedEarly",
      {
        challengeId: string;
        executorSucceeded: boolean;
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
