import { describe, expect, it } from "vitest";
import {
  calculateChallengeFeeSplit,
  calculateFeeSplit,
  calculateMarketFeeSplit,
  calculateMarketSettlement,
  formatUsdt,
  parseUsdt,
} from "./economics";
import { DEFAULT_ECONOMICS } from "./constants";

describe("Alterford economics", () => {
  it("keeps the standard market fee split available for compatibility", () => {
    const split = calculateFeeSplit(1_000_000n, DEFAULT_ECONOMICS);

    expect(split.totalFee).toBe(35_000n);
    expect(split.adminFee).toBe(20_000n);
    expect(split.creatorFee).toBe(15_000n);
  });

  it("uses dynamic market fees by total pool size", () => {
    expect(calculateMarketFeeSplit(50_000_000n, 20_000_000n)).toEqual({
      adminFee: 400_000n,
      creatorFee: 200_000n,
      totalFee: 600_000n,
    });
    expect(calculateMarketFeeSplit(1_000_000_000n, 400_000_000n)).toEqual({
      adminFee: 8_000_000n,
      creatorFee: 6_000_000n,
      totalFee: 14_000_000n,
    });
    expect(calculateMarketFeeSplit(5_000_000_000n, 2_000_000_000n)).toEqual({
      adminFee: 35_000_000n,
      creatorFee: 15_000_000n,
      totalFee: 50_000_000n,
    });
    expect(calculateMarketFeeSplit(50_000_000_000n, 20_000_000_000n)).toEqual({
      adminFee: 300_000_000n,
      creatorFee: 100_000_000n,
      totalFee: 400_000_000n,
    });
  });

  it("uses variable platform-only challenge fees", () => {
    expect(calculateChallengeFeeSplit(100_000_000n)).toEqual({
      adminFee: 10_000_000n,
      creatorFee: 0n,
      totalFee: 10_000_000n,
    });
    expect(calculateChallengeFeeSplit(1_000_000_000n)).toEqual({
      adminFee: 80_000_000n,
      creatorFee: 0n,
      totalFee: 80_000_000n,
    });
    expect(calculateChallengeFeeSplit(10_000_000_000n)).toEqual({
      adminFee: 600_000_000n,
      creatorFee: 0n,
      totalFee: 600_000_000n,
    });
    expect(calculateChallengeFeeSplit(20_000_000_000n)).toEqual({
      adminFee: 800_000_000n,
      creatorFee: 0n,
      totalFee: 800_000_000n,
    });
  });

  it("pays winners principal plus their pro-rata losing pool after fees", () => {
    const settlement = calculateMarketSettlement({
      stakesByOutcome: [1_000_000n, 3_000_000n],
      winningOutcome: 0,
      userWinningStake: 250_000n,
      noWinnersPolicy: "RefundAll",
      economics: DEFAULT_ECONOMICS,
    });

    expect(settlement.status).toBe("WinnerPayout");
    expect(settlement.grossPool).toBe(4_000_000n);
    expect(settlement.winningPool).toBe(1_000_000n);
    expect(settlement.losingPool).toBe(3_000_000n);
    expect(settlement.totalFee).toBe(90_000n);
    expect(settlement.adminFee).toBe(60_000n);
    expect(settlement.creatorFee).toBe(30_000n);
    expect(settlement.userPayout).toBe(977_500n);
  });

  it("charges no fee when there is no losing pool", () => {
    const settlement = calculateMarketSettlement({
      stakesByOutcome: [1_000_000n, 0n],
      winningOutcome: 0,
      userWinningStake: 500_000n,
      noWinnersPolicy: "RefundAll",
      economics: DEFAULT_ECONOMICS,
    });

    expect(settlement.losingPool).toBe(0n);
    expect(settlement.totalFee).toBe(0n);
    expect(settlement.userPayout).toBe(500_000n);
  });

  it("returns RefundAll when the winning outcome has no stakes", () => {
    const settlement = calculateMarketSettlement({
      stakesByOutcome: [1_000_000n, 0n],
      winningOutcome: 1,
      userWinningStake: 0n,
      noWinnersPolicy: "RefundAll",
      economics: DEFAULT_ECONOMICS,
    });

    expect(settlement.status).toBe("RefundAll");
    expect(settlement.totalFee).toBe(0n);
    expect(settlement.userPayout).toBe(0n);
  });

  it("rejects inconsistent fixed fee configurations", () => {
    expect(() =>
      calculateFeeSplit(1_000_000n, {
        adminFeeBps: 200,
        creatorFeeBps: 200,
        totalFeeBps: 350,
        maxTotalFeeBps: 500,
        creationBondUsdt: 10_000_000n,
      }),
    ).toThrow("adminFeeBps + creatorFeeBps must equal totalFeeBps");
  });

  it("formats and parses USDT values with six decimals", () => {
    expect(parseUsdt("10.25")).toBe(10_250_000n);
    expect(formatUsdt(10_250_000n)).toBe("10.25");
  });
});
