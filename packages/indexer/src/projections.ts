import type { Address, Category, ChallengeState, ModeAffinity } from "@alterford/sdk";
import type { AlterfordEvent } from "./events.js";
import { eventIdentity } from "./events.js";

export interface MarketProjection {
  marketId: string;
  creator: Address;
  title: string;
  description?: string;
  category: Category;
  modeAffinity: ModeAffinity;
  settlementToken?: Address;
  metadataHash?: string;
  metadataURI?: string;
  state?: "Open" | "Resolved";
  winningOutcome?: number;
  totalPool: bigint;
  poolByOutcome: Map<number, bigint>;
}

export interface ChallengeProjection {
  challengeId: string;
  creator: Address;
  executor?: Address;
  settlementToken?: Address;
  title: string;
  description: string;
  rewardPool: bigint;
  deadline?: bigint;
  state: ChallengeState;
  metadataURI?: string;
  rulesHash?: string;
  liveStreamURI?: string;
  evidenceURI?: string;
  evidenceHash?: string;
  winner?: Address;
  executorSucceeded?: boolean;
  rewardPayout?: bigint;
  adminFee?: bigint;
  creatorFee?: bigint;
  lastReasonHash?: string;
}

export interface ReferralProjection {
  user: Address;
  referrer: Address;
  codeHash: string;
}

export interface ReputationProjection {
  creatorQualityScore: number;
  userTrustScore: number;
  sybilRiskScore: number;
}

export interface OracleResultProjection {
  marketId: string;
  outcome: number;
  confidence: number;
  evidenceId: string;
}

export interface ModerationCaseProjection {
  caseId: string;
  entityType: string;
  entityId: string;
  status: "Flagged" | "Hidden" | "Cleared" | "ConfirmedViolation";
  reasonHash: string;
}

export interface BondProjection {
  entityType: string;
  entityId: string;
  creator?: Address;
  requiredBond: bigint;
  paidBond: bigint;
  releasedBond: bigint;
  slashedBond: bigint;
  reasonFlags: number;
  lastReasonHash?: string;
}

export interface BetProjection {
  marketId: string;
  user: Address;
  outcome: number;
  amount: bigint;
}

export interface ClaimProjection {
  marketId: string;
  user: Address;
  amount: bigint;
  type: "Reward" | "Refund";
}

export interface FeeProjection {
  marketId: string;
  admin: Address;
  creator: Address;
  adminFee: bigint;
  creatorFee: bigint;
}

export interface ProjectionState {
  processedEventIds: Set<string>;
  markets: Map<string, MarketProjection>;
  challenges: Map<string, ChallengeProjection>;
  referrals: Map<Address, ReferralProjection>;
  completedQuests: Map<string, Set<Address>>;
  reputation: Map<Address, ReputationProjection>;
  oracleResults: Map<string, OracleResultProjection>;
  moderationCases: Map<string, ModerationCaseProjection>;
  bonds: Map<string, BondProjection>;
  bets: Map<string, BetProjection>;
  claims: Map<string, ClaimProjection>;
  fees: Map<string, FeeProjection>;
}

export function createInitialProjectionState(): ProjectionState {
  return {
    processedEventIds: new Set(),
    markets: new Map(),
    challenges: new Map(),
    referrals: new Map(),
    completedQuests: new Map(),
    reputation: new Map(),
    oracleResults: new Map(),
    moderationCases: new Map(),
    bonds: new Map(),
    bets: new Map(),
    claims: new Map(),
    fees: new Map(),
  };
}

export function projectEvent(state: ProjectionState, event: AlterfordEvent): ProjectionState {
  const id = event.id || eventIdentity(event);
  if (state.processedEventIds.has(id)) {
    return state;
  }
  state.processedEventIds.add(id);

  switch (event.type) {
    case "MarketCreated":
      state.markets.set(event.payload.marketId, {
        ...event.payload,
        state: "Open",
        totalPool: 0n,
        poolByOutcome: new Map(),
      });
      break;
    case "BetPlaced": {
      const market = state.markets.get(event.payload.marketId);
      if (market) {
        market.totalPool += event.payload.amount;
        market.poolByOutcome.set(
          event.payload.outcome,
          (market.poolByOutcome.get(event.payload.outcome) ?? 0n) + event.payload.amount,
        );
      }
      state.bets.set(`${event.payload.marketId}:${event.payload.user}:${event.logIndex}`, event.payload);
      break;
    }
    case "MarketResolved": {
      const market = state.markets.get(event.payload.marketId);
      if (market) {
        market.state = "Resolved";
        market.winningOutcome = event.payload.winningOutcome;
      }
      break;
    }
    case "FeesAccrued":
      state.fees.set(event.payload.marketId, event.payload);
      break;
    case "RewardClaimed":
      state.claims.set(`${event.payload.marketId}:${event.payload.user}:reward`, {
        ...event.payload,
        type: "Reward",
      });
      break;
    case "RefundClaimed":
      state.claims.set(`${event.payload.marketId}:${event.payload.user}:refund`, {
        ...event.payload,
        type: "Refund",
      });
      break;
    case "ChallengeCreated":
      state.challenges.set(event.payload.challengeId, {
        challengeId: event.payload.challengeId,
        creator: event.payload.creator,
        settlementToken: event.payload.settlementToken,
        title: `Reto ${event.payload.challengeId}`,
        description: "Reto Underworld creado por usuario.",
        rewardPool: event.payload.rewardPool,
        deadline: event.payload.deadline,
        state: event.payload.state ?? "Open",
        metadataURI: event.payload.metadataURI,
        rulesHash: event.payload.rulesHash,
      });
      break;
    case "ChallengeAccepted": {
      const challenge = state.challenges.get(event.payload.challengeId);
      if (challenge) {
        challenge.executor = event.payload.executor;
        challenge.state = "Accepted";
      }
      break;
    }
    case "ChallengeLiveStreamUpdated": {
      const challenge = state.challenges.get(event.payload.challengeId);
      if (challenge) challenge.liveStreamURI = event.payload.liveStreamURI;
      break;
    }
    case "ChallengeEvidenceSubmitted": {
      const challenge = state.challenges.get(event.payload.challengeId);
      if (challenge) {
        challenge.executor = event.payload.executor;
        challenge.evidenceHash = event.payload.evidenceHash;
        challenge.evidenceURI = event.payload.evidenceURI;
        challenge.liveStreamURI = event.payload.liveStreamURI;
        challenge.state = "EvidenceSubmitted";
      }
      break;
    }
    case "ChallengeResolved": {
      const challenge = state.challenges.get(event.payload.challengeId);
      if (challenge) {
        challenge.state = "Resolved";
        challenge.winner = event.payload.winner;
        challenge.executorSucceeded = event.payload.executorSucceeded;
        challenge.rewardPayout = event.payload.rewardPayout;
        challenge.adminFee = event.payload.adminFee;
        challenge.creatorFee = event.payload.creatorFee;
      }
      break;
    }
    case "ChallengeCancelled": {
      const challenge = state.challenges.get(event.payload.challengeId);
      if (challenge) {
        challenge.state = "Cancelled";
        challenge.lastReasonHash = event.payload.reasonHash;
      }
      break;
    }
    case "ChallengeFraudConfirmed": {
      const challenge = state.challenges.get(event.payload.challengeId);
      if (challenge) {
        challenge.state = "Fraud";
        challenge.lastReasonHash = event.payload.reasonHash;
      }
      break;
    }
    case "ReferralLinked":
      state.referrals.set(event.payload.user, event.payload);
      break;
    case "QuestCompleted": {
      const users = state.completedQuests.get(event.payload.questId) ?? new Set<Address>();
      users.add(event.payload.user);
      state.completedQuests.set(event.payload.questId, users);
      break;
    }
    case "ReputationUpdated": {
      const current = state.reputation.get(event.payload.subject) ?? {
        creatorQualityScore: 0,
        userTrustScore: 0,
        sybilRiskScore: 0,
      };
      state.reputation.set(event.payload.subject, {
        ...current,
        [event.payload.scoreType]: event.payload.newScore,
      });
      break;
    }
    case "OracleResultSubmitted":
      state.oracleResults.set(event.payload.marketId, event.payload);
      break;
    case "ContentFlagged":
      state.moderationCases.set(event.payload.caseId, {
        ...event.payload,
        status: "Flagged",
      });
      break;
    case "BondCalculated": {
      const key = bondKey(event.payload.entityType, event.payload.entityId);
      const current = state.bonds.get(key) ?? emptyBond(event.payload.entityType, event.payload.entityId);
      state.bonds.set(key, {
        ...current,
        creator: event.payload.creator,
        requiredBond: event.payload.requiredBond,
        reasonFlags: event.payload.reasonFlags,
      });
      break;
    }
    case "BondLocked": {
      const key = bondKey(event.payload.entityType, event.payload.entityId);
      const current = state.bonds.get(key) ?? emptyBond(event.payload.entityType, event.payload.entityId);
      state.bonds.set(key, {
        ...current,
        creator: event.payload.creator,
        paidBond: event.payload.amount,
      });
      break;
    }
    case "BondReleased": {
      const key = bondKey(event.payload.entityType, event.payload.entityId);
      const current = state.bonds.get(key) ?? emptyBond(event.payload.entityType, event.payload.entityId);
      state.bonds.set(key, {
        ...current,
        releasedBond: event.payload.amount,
      });
      break;
    }
    case "BondSlashed": {
      const key = bondKey(event.payload.entityType, event.payload.entityId);
      const current = state.bonds.get(key) ?? emptyBond(event.payload.entityType, event.payload.entityId);
      state.bonds.set(key, {
        ...current,
        slashedBond: event.payload.amount,
        lastReasonHash: event.payload.reasonHash,
      });
      break;
    }
  }

  return state;
}

function bondKey(entityType: string, entityId: string): string {
  return `${entityType}:${entityId}`;
}

function emptyBond(entityType: string, entityId: string): BondProjection {
  return {
    entityType,
    entityId,
    requiredBond: 0n,
    paidBond: 0n,
    releasedBond: 0n,
    slashedBond: 0n,
    reasonFlags: 0,
  };
}
