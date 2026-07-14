import type { CreationBondPolicyConfig, EconomicsConfig } from "./types.js";

export const BPS_DENOMINATOR = 10_000n;

export const DEFAULT_ECONOMICS: EconomicsConfig = {
  adminFeeBps: 200,
  creatorFeeBps: 150,
  totalFeeBps: 350,
  maxTotalFeeBps: 500,
  creationBondUsdt: 10_000_000n,
};

export const DEFAULT_BOND_POLICY: CreationBondPolicyConfig = {
  minBond: 500_000n,
  lowRiskBaseBond: 500_000n,
  standardBaseBond: 3_000_000n,
  highRiskBaseBond: 5_000_000n,
  maxBond: 10_000_000n,
  smallMarketVolumeThreshold: 50_000_000n,
  volumeStep: 250_000_000n,
  volumeStepBond: 1_000_000n,
  verifiedDiscountBps: 2_000,
  premiumDiscountBps: 4_000,
  underworldMultiplierBps: 15_000,
  highRiskMultiplierBps: 15_000,
  disputeSurchargeBps: 1_000,
  fraudMultiplierBps: 20_000,
};

export const QUICK_BET_AMOUNTS_USDT = [
  500_000n,
  1_000_000n,
  5_000_000n,
  10_000_000n,
] as const;

export const HIGH_ROLLER_AMOUNTS_USDT = [
  50_000_000n,
  250_000_000n,
  1_000_000_000n,
] as const;

export const SUPPORTED_CHAIN_IDS = [8453, 84532, 42161, 137, 10] as const;
