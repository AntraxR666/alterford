import { describe, expect, it } from "vitest";
import {
  calculateCreationBond,
  DEFAULT_BOND_POLICY,
  explainBondEstimate,
  formatUsdt,
} from "./index";

describe("dynamic creation bond policy", () => {
  it("keeps small low-risk Vanilla markets accessible", () => {
    const estimate = calculateCreationBond({
      entityType: "Market",
      mode: "Vanilla",
      creatorTier: "Basic",
      categoryRisk: "Low",
      reputation: "New",
      expectedVolumeUsdt: 20_000_000n,
      disputeCount: 0,
      fraudCount: 0,
      policy: DEFAULT_BOND_POLICY,
    });

    expect(estimate.amount).toBe(500_000n);
    expect(estimate.tier).toBe("VanillaLowRisk");
    expect(estimate.reasons).toContain("Small low-risk Vanilla market");
  });

  it("uses a standard bond for normal Vanilla markets", () => {
    const estimate = calculateCreationBond({
      entityType: "Market",
      mode: "Vanilla",
      creatorTier: "Basic",
      categoryRisk: "Medium",
      reputation: "New",
      expectedVolumeUsdt: 200_000_000n,
      disputeCount: 0,
      fraudCount: 0,
      policy: DEFAULT_BOND_POLICY,
    });

    expect(estimate.amount).toBe(3_000_000n);
    expect(estimate.tier).toBe("VanillaStandard");
  });

  it("raises bond for Underworld and high-risk markets", () => {
    const estimate = calculateCreationBond({
      entityType: "Market",
      mode: "Underworld",
      creatorTier: "Basic",
      categoryRisk: "High",
      reputation: "New",
      expectedVolumeUsdt: 500_000_000n,
      disputeCount: 1,
      fraudCount: 0,
      policy: DEFAULT_BOND_POLICY,
    });

    expect(estimate.amount).toBe(10_000_000n);
    expect(estimate.tier).toBe("HighRisk");
    expect(estimate.reasons).toContain("Underworld mode increases required commitment");
  });

  it("discounts verified creators without dropping below the configured minimum", () => {
    const estimate = calculateCreationBond({
      entityType: "Market",
      mode: "Vanilla",
      creatorTier: "Verified",
      categoryRisk: "Low",
      reputation: "Trusted",
      expectedVolumeUsdt: 20_000_000n,
      disputeCount: 0,
      fraudCount: 0,
      policy: DEFAULT_BOND_POLICY,
    });

    expect(estimate.amount).toBe(500_000n);
    expect(estimate.reasons).toContain("Verified creator discount applied");
  });

  it("escalates creators with fraud history toward max bond", () => {
    const estimate = calculateCreationBond({
      entityType: "Bounty",
      mode: "Underworld",
      creatorTier: "Suspended",
      categoryRisk: "Critical",
      reputation: "Risky",
      expectedVolumeUsdt: 1_000_000_000n,
      disputeCount: 4,
      fraudCount: 1,
      policy: DEFAULT_BOND_POLICY,
    });

    expect(estimate.amount).toBe(10_000_000n);
    expect(estimate.reasons).toContain("Fraud history applies maximum friction");
  });

  it("explains the bond in user-facing copy", () => {
    const estimate = calculateCreationBond({
      entityType: "Market",
      mode: "Vanilla",
      creatorTier: "Basic",
      categoryRisk: "Low",
      reputation: "New",
      expectedVolumeUsdt: 20_000_000n,
      disputeCount: 0,
      fraudCount: 0,
      policy: DEFAULT_BOND_POLICY,
    });

    expect(explainBondEstimate(estimate)).toBe(
      `Required creation bond: ${formatUsdt(estimate.amount)} USDT. Small low-risk Vanilla market.`,
    );
  });
});
