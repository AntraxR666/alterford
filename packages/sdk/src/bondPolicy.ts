import { BPS_DENOMINATOR } from "./constants";
import type {
  BondTier,
  CreationBondEstimate,
  CreationBondInput,
  CreationBondPolicyConfig,
} from "./types";
import { formatUsdt } from "./economics";

const REASON_SMALL_LOW_RISK = 1 << 0;
const REASON_UNDERWORLD = 1 << 1;
const REASON_HIGH_RISK = 1 << 2;
const REASON_VERIFIED_DISCOUNT = 1 << 3;
const REASON_FRAUD_HISTORY = 1 << 4;
const REASON_DISPUTE_HISTORY = 1 << 5;
const REASON_VOLUME = 1 << 6;

export function calculateCreationBond(input: CreationBondInput): CreationBondEstimate {
  assertBondPolicy(input.policy);

  let amount = baseBond(input);
  let reasonFlags = 0;
  const reasons: string[] = [];

  if (isSmallLowRiskVanilla(input)) {
    reasonFlags |= REASON_SMALL_LOW_RISK;
    reasons.push("Small low-risk Vanilla market");
  }

  const volumePremium = calculateVolumePremium(input.expectedVolumeUsdt, input.policy);
  if (volumePremium > 0n) {
    amount += volumePremium;
    reasonFlags |= REASON_VOLUME;
    reasons.push("Expected volume increases anti-spam bond");
  }

  if (input.mode === "Underworld") {
    amount = applyBps(amount, input.policy.underworldMultiplierBps);
    reasonFlags |= REASON_UNDERWORLD;
    reasons.push("Underworld mode increases required commitment");
  }

  if (input.categoryRisk === "High" || input.categoryRisk === "Critical") {
    amount = applyBps(amount, input.policy.highRiskMultiplierBps);
    reasonFlags |= REASON_HIGH_RISK;
    reasons.push("High-risk category increases bond");
  }

  if (input.disputeCount > 0) {
    amount = applyBps(amount, BPS_DENOMINATOR_NUMBER + input.disputeCount * input.policy.disputeSurchargeBps);
    reasonFlags |= REASON_DISPUTE_HISTORY;
    reasons.push("Dispute history adds progressive friction");
  }

  if (input.fraudCount > 0 || input.creatorTier === "Suspended" || input.reputation === "Risky") {
    amount = applyBps(amount, input.policy.fraudMultiplierBps);
    reasonFlags |= REASON_FRAUD_HISTORY;
    reasons.push("Fraud history applies maximum friction");
  }

  if (input.creatorTier === "Verified" || input.creatorTier === "Premium" || input.reputation === "Trusted") {
    const discount =
      input.creatorTier === "Premium" ? input.policy.premiumDiscountBps : input.policy.verifiedDiscountBps;
    amount = (amount * BigInt(BPS_DENOMINATOR_NUMBER - discount)) / BPS_DENOMINATOR;
    reasonFlags |= REASON_VERIFIED_DISCOUNT;
    reasons.push(input.creatorTier === "Premium" ? "Premium creator discount applied" : "Verified creator discount applied");
  }

  amount = clamp(amount, input.policy.minBond, input.policy.maxBond);

  return {
    amount,
    tier: bondTier(input),
    reasonFlags,
    reasons: reasons.length > 0 ? reasons : ["Standard creator commitment"],
  };
}

export function explainBondEstimate(estimate: CreationBondEstimate): string {
  return `Required creation bond: ${formatUsdt(estimate.amount)} USDT. ${estimate.reasons.join(" ")}.`;
}

function baseBond(input: CreationBondInput): bigint {
  if (isSmallLowRiskVanilla(input)) {
    return input.policy.lowRiskBaseBond;
  }

  if (
    input.mode === "Underworld" ||
    input.categoryRisk === "High" ||
    input.categoryRisk === "Critical" ||
    input.entityType === "Challenge"
  ) {
    return input.policy.highRiskBaseBond;
  }

  return input.policy.standardBaseBond;
}

function bondTier(input: CreationBondInput): BondTier {
  if (isSmallLowRiskVanilla(input)) {
    return "VanillaLowRisk";
  }
  if (input.mode === "Underworld" || input.categoryRisk === "High" || input.categoryRisk === "Critical") {
    return "HighRisk";
  }
  return "VanillaStandard";
}

function isSmallLowRiskVanilla(input: CreationBondInput): boolean {
  return (
    input.entityType === "Market" &&
    input.mode === "Vanilla" &&
    input.categoryRisk === "Low" &&
    input.expectedVolumeUsdt <= input.policy.smallMarketVolumeThreshold &&
    input.disputeCount === 0 &&
    input.fraudCount === 0
  );
}

function calculateVolumePremium(expectedVolume: bigint, policy: CreationBondPolicyConfig): bigint {
  if (expectedVolume <= policy.volumeStep) {
    return 0n;
  }
  return (expectedVolume / policy.volumeStep) * policy.volumeStepBond;
}

function applyBps(amount: bigint, bps: number): bigint {
  return (amount * BigInt(bps)) / BPS_DENOMINATOR;
}

function clamp(amount: bigint, min: bigint, max: bigint): bigint {
  if (amount < min) return min;
  if (amount > max) return max;
  return amount;
}

function assertBondPolicy(policy: CreationBondPolicyConfig): void {
  if (policy.minBond <= 0n) {
    throw new Error("minBond must be positive");
  }
  if (policy.maxBond < policy.minBond) {
    throw new Error("maxBond must be greater than minBond");
  }
}

const BPS_DENOMINATOR_NUMBER = 10_000;
