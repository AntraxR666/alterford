export type Address = `0x${string}`;
export type ChainId = 8453 | 84532 | 42161 | 137 | 10 | 31337;
export type MarketState =
  | "Draft"
  | "Open"
  | "Locked"
  | "Resolved"
  | "Disputed"
  | "Cancelled"
  | "Fraud"
  | "Expired"
  | "Settled";
export type BountyState =
  | "Open"
  | "SubmissionClosed"
  | "Review"
  | "Resolved"
  | "Cancelled"
  | "Fraud"
  | "Refunded"
  | "Settled"
  | "EmergencyRecovered";
export type ChallengeState =
  | "Open"
  | "Accepted"
  | "EvidenceSubmitted"
  | "Review"
  | "Resolved"
  | "Cancelled"
  | "Fraud"
  | "Refunded"
  | "Disputed";
export type ModeAffinity = "Vanilla" | "Underworld" | "Both";
export type CreationEntityType = "Market" | "Bounty" | "Challenge";
export type CreatorTier = "Basic" | "Verified" | "Premium" | "Suspended";
export type RiskLevel = "Low" | "Medium" | "High" | "Critical";
export type ReputationBand = "New" | "Trusted" | "Risky";
export type BondTier = "VanillaLowRisk" | "VanillaStandard" | "HighRisk";
export type Category =
  | "Sports"
  | "Weather"
  | "Technology"
  | "Crypto"
  | "PopCulture"
  | "News"
  | "Challenges"
  | "Bounties"
  | "UserMarkets"
  | "StrangeEvents"
  | "Viral";
export type NoWinnersPolicy =
  | "RefundAll"
  | "RolloverToNextMarket"
  | "CreatorDefinedCharityTreasury"
  | "ProtocolTreasury";
export type SettlementStatus =
  | "WinnerPayout"
  | "RefundAll"
  | "NoWinnersRollover"
  | "NoWinnersTreasury";

export interface EconomicsConfig {
  adminFeeBps: number;
  creatorFeeBps: number;
  totalFeeBps: number;
  maxTotalFeeBps: number;
  creationBondUsdt: bigint;
}

export interface CreationBondPolicyConfig {
  minBond: bigint;
  lowRiskBaseBond: bigint;
  standardBaseBond: bigint;
  highRiskBaseBond: bigint;
  maxBond: bigint;
  smallMarketVolumeThreshold: bigint;
  volumeStep: bigint;
  volumeStepBond: bigint;
  verifiedDiscountBps: number;
  premiumDiscountBps: number;
  underworldMultiplierBps: number;
  highRiskMultiplierBps: number;
  disputeSurchargeBps: number;
  fraudMultiplierBps: number;
}

export interface CreationBondInput {
  entityType: CreationEntityType;
  mode: "Vanilla" | "Underworld";
  creatorTier: CreatorTier;
  categoryRisk: RiskLevel;
  reputation: ReputationBand;
  expectedVolumeUsdt: bigint;
  disputeCount: number;
  fraudCount: number;
  policy: CreationBondPolicyConfig;
}

export interface CreationBondEstimate {
  amount: bigint;
  tier: BondTier;
  reasonFlags: number;
  reasons: readonly string[];
}

export interface FeeSplit {
  totalFee: bigint;
  adminFee: bigint;
  creatorFee: bigint;
}

export interface MarketSettlementInput {
  stakesByOutcome: readonly bigint[];
  winningOutcome: number;
  userWinningStake: bigint;
  noWinnersPolicy: NoWinnersPolicy;
  economics: EconomicsConfig;
}

export interface MarketSettlement extends FeeSplit {
  status: SettlementStatus;
  grossPool: bigint;
  winningPool: bigint;
  losingPool: bigint;
  distributable: bigint;
  userPayout: bigint;
}

export interface MarketDTO {
  id: string;
  chainId: ChainId;
  address: Address;
  creator: Address;
  title: string;
  description: string;
  category: Category;
  modeAffinity: ModeAffinity;
  outcomes: readonly string[];
  state: MarketState;
  settlementToken: Address;
  totalPool: bigint;
  poolByOutcome: readonly bigint[];
  impliedOddsByOutcome: readonly number[];
  lockTime: string;
  resolutionTime: string;
  metadataURI: string;
  metadataHash: string;
}

export interface ChallengeDTO {
  id: string;
  chainId: ChainId;
  address: Address;
  creator: Address;
  executor?: Address;
  settlementToken?: Address;
  title: string;
  description: string;
  rewardPool: bigint;
  deadline?: string;
  state: ChallengeState;
  riskLevel: RiskLevel;
  modeAffinity?: ModeAffinity;
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
  resolutionProposal?: {
    proposer: Address;
    executorSucceeded: boolean;
    evidenceHash: string;
    disputeDeadline: string;
  };
}

export interface BountyDTO {
  id: string;
  chainId: ChainId;
  address: Address;
  creator: Address;
  settlementToken: Address;
  title: string;
  description: string;
  rewardPool: bigint;
  rewardEscrow: bigint;
  deadline: string;
  state: BountyState;
  modeAffinity?: ModeAffinity;
  riskLevel?: RiskLevel;
  metadataURI: string;
  rulesHash: string;
  winners?: readonly Address[];
  amounts?: readonly bigint[];
  lastReasonHash?: string;
  submissions?: readonly {
    submitter: Address;
    submissionHash: string;
    evidenceURI?: string;
  }[];
}

export interface QuestDTO {
  id: string;
  type: "Daily" | "Weekly" | "Seasonal" | "CreatorQuest" | "UnderworldQuest";
  title: string;
  description: string;
  rewardType: "Badge" | "XP" | "Token" | "FeeRebate";
  startTime: string;
  endTime: string;
  state: "Inactive" | "Active" | "Completed" | "Claimed" | "Expired" | "Revoked";
  userProgress: number;
}

export interface ReputationDTO {
  subject: Address;
  creatorQualityScore: number;
  userTrustScore: number;
  resolverReliabilityScore: number;
  sybilRiskScore: number;
  marketIntegrityScore: number;
  lastUpdated: string;
  explanations: readonly string[];
}

export interface ContractAddresses {
  settlementToken: Address;
  creationBondPolicy: Address;
  bondContextResolver?: Address;
  marketFactory: Address;
  bountyFactory?: Address;
  challengeFactory?: Address;
  alterfordForwarder?: Address;
  creatorRegistry?: Address;
  rewardDistributor?: Address;
}

export type TxLifecycle = "idle" | "preview" | "pending" | "confirmed" | "failed";
