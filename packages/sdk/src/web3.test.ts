import { describe, expect, it } from "vitest";
import { DEFAULT_BOND_POLICY } from "./constants";
import {
  BASE_SEPOLIA_CHAIN_ID,
  formatAddress,
  isSupportedExecutionChain,
  toOnchainBondContext,
} from "./web3";

describe("web3 helpers", () => {
  it("recognizes Base Sepolia and local anvil as executable chains", () => {
    expect(isSupportedExecutionChain(BASE_SEPOLIA_CHAIN_ID)).toBe(true);
    expect(isSupportedExecutionChain(31337)).toBe(true);
    expect(isSupportedExecutionChain(1)).toBe(false);
  });

  it("maps bond input to Solidity enum indexes and bigint counts", () => {
    const context = toOnchainBondContext({
      entityType: "Market",
      mode: "Underworld",
      creatorTier: "Verified",
      categoryRisk: "High",
      reputation: "Trusted",
      expectedVolumeUsdt: 500_000_000n,
      disputeCount: 2,
      fraudCount: 1,
      policy: DEFAULT_BOND_POLICY,
    });

    expect(context).toEqual({
      entityType: 0,
      mode: 1,
      creatorTier: 1,
      categoryRisk: 2,
      reputation: 1,
      expectedVolume: 500_000_000n,
      disputeCount: 2n,
      fraudCount: 1n,
    });
  });

  it("formats addresses for dense wallet UI", () => {
    expect(formatAddress("0x1234567890abcdef1234567890abcdef12345678")).toBe("0x1234...5678");
  });
});
