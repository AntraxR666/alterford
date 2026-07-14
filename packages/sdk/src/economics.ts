import { BPS_DENOMINATOR } from "./constants.js";
import type {
  EconomicsConfig,
  FeeSplit,
  MarketSettlement,
  MarketSettlementInput,
  NoWinnersPolicy,
  SettlementStatus,
} from "./types.js";

function assertEconomics(config: EconomicsConfig): void {
  if (config.adminFeeBps + config.creatorFeeBps !== config.totalFeeBps) {
    throw new Error("adminFeeBps + creatorFeeBps must equal totalFeeBps");
  }

  if (config.totalFeeBps > config.maxTotalFeeBps) {
    throw new Error("totalFeeBps exceeds maxTotalFeeBps");
  }

  if (config.adminFeeBps < 0 || config.creatorFeeBps < 0 || config.totalFeeBps < 0) {
    throw new Error("fee bps cannot be negative");
  }
}

export function calculateFeeSplit(losingPool: bigint, config: EconomicsConfig): FeeSplit {
  assertEconomics(config);

  if (losingPool < 0n) {
    throw new Error("losingPool cannot be negative");
  }

  const adminFee = (losingPool * BigInt(config.adminFeeBps)) / BPS_DENOMINATOR;
  const creatorFee = (losingPool * BigInt(config.creatorFeeBps)) / BPS_DENOMINATOR;
  const totalFee = adminFee + creatorFee;

  return { totalFee, adminFee, creatorFee };
}

export function calculateMarketFeeSplit(totalPool: bigint, losingPool: bigint): FeeSplit {
  if (totalPool < 0n || losingPool < 0n) {
    throw new Error("pool values cannot be negative");
  }
  if (losingPool > totalPool) {
    throw new Error("losingPool cannot exceed totalPool");
  }

  let adminFeeBps: bigint;
  let creatorFeeBps: bigint;

  if (totalPool >= 50_000_000_000n) {
    adminFeeBps = 150n;
    creatorFeeBps = 50n;
  } else if (totalPool >= 5_000_000_000n) {
    adminFeeBps = 175n;
    creatorFeeBps = 75n;
  } else if (totalPool < 100_000_000n) {
    adminFeeBps = 200n;
    creatorFeeBps = 100n;
  } else {
    adminFeeBps = 200n;
    creatorFeeBps = 150n;
  }

  const adminFee = (losingPool * adminFeeBps) / BPS_DENOMINATOR;
  const creatorFee = (losingPool * creatorFeeBps) / BPS_DENOMINATOR;
  return { adminFee, creatorFee, totalFee: adminFee + creatorFee };
}

export function calculateChallengeFeeSplit(rewardPool: bigint): FeeSplit {
  if (rewardPool < 0n) {
    throw new Error("rewardPool cannot be negative");
  }

  const adminFeeBps =
    rewardPool <= 100_000_000n
      ? 1_000n
      : rewardPool <= 1_000_000_000n
        ? 800n
        : rewardPool <= 10_000_000_000n
          ? 600n
          : 400n;
  const adminFee = (rewardPool * adminFeeBps) / BPS_DENOMINATOR;
  return { adminFee, creatorFee: 0n, totalFee: adminFee };
}

export function calculateMarketSettlement(input: MarketSettlementInput): MarketSettlement {
  assertEconomics(input.economics);

  if (input.stakesByOutcome.length === 0) {
    throw new Error("stakesByOutcome cannot be empty");
  }

  if (input.winningOutcome < 0 || input.winningOutcome >= input.stakesByOutcome.length) {
    throw new Error("winningOutcome is out of range");
  }

  if (input.userWinningStake < 0n) {
    throw new Error("userWinningStake cannot be negative");
  }

  const grossPool = input.stakesByOutcome.reduce((sum, amount) => {
    if (amount < 0n) {
      throw new Error("stake cannot be negative");
    }
    return sum + amount;
  }, 0n);

  const winningPool = input.stakesByOutcome[input.winningOutcome] ?? 0n;

  if (winningPool === 0n) {
    return noWinnersSettlement(grossPool, input.noWinnersPolicy);
  }

  if (input.userWinningStake > winningPool) {
    throw new Error("userWinningStake exceeds winningPool");
  }

  const losingPool = grossPool - winningPool;
  const fees = calculateMarketFeeSplit(grossPool, losingPool);
  const losingPoolAfterFees = losingPool - fees.totalFee;
  const proRataProfit = (input.userWinningStake * losingPoolAfterFees) / winningPool;
  const userPayout = input.userWinningStake + proRataProfit;
  const distributable = grossPool - fees.totalFee;

  return {
    status: "WinnerPayout",
    grossPool,
    winningPool,
    losingPool,
    distributable,
    userPayout,
    ...fees,
  };
}

function noWinnersSettlement(
  grossPool: bigint,
  policy: NoWinnersPolicy,
): MarketSettlement {
  const statusByPolicy: Record<NoWinnersPolicy, SettlementStatus> = {
    RefundAll: "RefundAll",
    RolloverToNextMarket: "NoWinnersRollover",
    CreatorDefinedCharityTreasury: "NoWinnersTreasury",
    ProtocolTreasury: "NoWinnersTreasury",
  };

  return {
    status: statusByPolicy[policy],
    grossPool,
    winningPool: 0n,
    losingPool: grossPool,
    totalFee: 0n,
    adminFee: 0n,
    creatorFee: 0n,
    distributable: grossPool,
    userPayout: 0n,
  };
}

export function parseUsdt(value: string): bigint {
  const normalized = value.trim();
  if (!/^\d+(\.\d{1,6})?$/.test(normalized)) {
    throw new Error("USDT value must have up to six decimals");
  }

  const [whole, fraction = ""] = normalized.split(".");
  return BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, "0"));
}

export function formatUsdt(amount: bigint): string {
  if (amount < 0n) {
    throw new Error("amount cannot be negative");
  }

  const whole = amount / 1_000_000n;
  const fraction = (amount % 1_000_000n).toString().padStart(6, "0").replace(/0+$/, "");
  return fraction.length === 0 ? whole.toString() : `${whole}.${fraction}`;
}
