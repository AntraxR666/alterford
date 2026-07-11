import type {
  Address,
  ChainId,
  ContractAddresses,
  CreationBondInput,
  CreationEntityType,
  CreatorTier,
  ReputationBand,
  RiskLevel,
} from "./types";

export const BASE_MAINNET_CHAIN_ID = 8453;
export const BASE_SEPOLIA_CHAIN_ID = 84532;
export const LOCAL_ANVIL_CHAIN_ID = 31337;
export const TARGET_TESTNET_CHAIN_ID = BASE_SEPOLIA_CHAIN_ID;

const SUPPORTED_EXECUTION_CHAINS = new Set<number>([
  BASE_MAINNET_CHAIN_ID,
  BASE_SEPOLIA_CHAIN_ID,
  LOCAL_ANVIL_CHAIN_ID,
  42161,
  137,
  10,
]);

export function isSupportedExecutionChain(chainId: number | undefined): chainId is ChainId {
  return typeof chainId === "number" && SUPPORTED_EXECUTION_CHAINS.has(chainId);
}

export function requireAddresses(addresses: Partial<ContractAddresses>): ContractAddresses {
  if (!addresses.settlementToken || !addresses.creationBondPolicy || !addresses.marketFactory) {
    throw new Error("Alterford contract addresses are not configured for this network.");
  }
  return addresses as ContractAddresses;
}

export function toOnchainBondContext(input: CreationBondInput) {
  return {
    entityType: entityTypeIndex(input.entityType),
    mode: input.mode === "Underworld" ? 1 : 0,
    creatorTier: creatorTierIndex(input.creatorTier),
    categoryRisk: riskLevelIndex(input.categoryRisk),
    reputation: reputationIndex(input.reputation),
    expectedVolume: input.expectedVolumeUsdt,
    disputeCount: BigInt(input.disputeCount),
    fraudCount: BigInt(input.fraudCount),
  } as const;
}

export function formatAddress(address: Address | undefined): string {
  if (!address) return "Not connected";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function entityTypeIndex(entityType: CreationEntityType): number {
  return ["Market", "Bounty", "Challenge"].indexOf(entityType);
}

function creatorTierIndex(tier: CreatorTier): number {
  return ["Basic", "Verified", "Premium", "Suspended"].indexOf(tier);
}

function riskLevelIndex(risk: RiskLevel): number {
  return ["Low", "Medium", "High", "Critical"].indexOf(risk);
}

function reputationIndex(reputation: ReputationBand): number {
  return ["New", "Trusted", "Risky"].indexOf(reputation);
}
