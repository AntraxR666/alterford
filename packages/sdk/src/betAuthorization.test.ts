import { describe, expect, it } from "vitest";
import * as sdk from "./index.js";

const bettor = "0x0000000000000000000000000000000000000001" as const;
const relayer = "0x0000000000000000000000000000000000000002" as const;
const verifyingContract = "0x0000000000000000000000000000000000000010" as const;

describe("BetAuthorization EIP-712 helpers", () => {
  it("builds a nonce-bound authorization with an unrestricted relayer by default", () => {
    expect(typeof (sdk as any).buildBetAuthorization).toBe("function");

    expect(
      (sdk as any).buildBetAuthorization({
        bettor,
        marketId: 7n,
        outcome: 1,
        amount: 2_500_000n,
        nonce: 3n,
        deadline: 1_800n,
      }),
    ).toEqual({
      bettor,
      marketId: 7n,
      outcome: 1,
      amount: 2_500_000n,
      nonce: 3n,
      deadline: 1_800n,
      authorizedRelayer: "0x0000000000000000000000000000000000000000",
    });
  });

  it("derives deadlines and sequential nonces", () => {
    expect((sdk as any).betAuthorizationDeadline(1_000n, 300n)).toBe(1_300n);
    expect((sdk as any).nextBetAuthorizationNonce(8n)).toBe(9n);
    expect(() => (sdk as any).betAuthorizationDeadline(1_000n, 0n)).toThrow(
      "validitySeconds must be greater than zero",
    );
  });

  it("matches the contract relayer and deadline rules", () => {
    const unrestricted = (sdk as any).buildBetAuthorization({
      bettor,
      marketId: 7n,
      outcome: 1,
      amount: 1n,
      nonce: 0n,
      deadline: 1_800n,
    });
    const restricted = { ...unrestricted, authorizedRelayer: relayer };

    expect((sdk as any).isBetAuthorizationExpired(unrestricted, 1_800n)).toBe(false);
    expect((sdk as any).isBetAuthorizationExpired(unrestricted, 1_801n)).toBe(true);
    expect((sdk as any).isBetAuthorizationRelayerAllowed(unrestricted, bettor)).toBe(true);
    expect((sdk as any).isBetAuthorizationRelayerAllowed(restricted, relayer.toUpperCase())).toBe(true);
    expect((sdk as any).isBetAuthorizationRelayerAllowed(restricted, bettor)).toBe(false);
  });

  it("builds typed data matching MarketFactory's domain and struct", () => {
    const authorization = (sdk as any).buildBetAuthorization({
      bettor,
      marketId: 7n,
      outcome: 1,
      amount: 2_500_000n,
      nonce: 3n,
      deadline: 1_800n,
      authorizedRelayer: relayer,
    });

    expect(
      (sdk as any).buildBetAuthorizationTypedData({
        chainId: 84532,
        verifyingContract,
        authorization,
      }),
    ).toEqual({
      domain: {
        name: "AlterfordMarketFactory",
        version: "1",
        chainId: 84532,
        verifyingContract,
      },
      primaryType: "BetAuthorization",
      types: {
        BetAuthorization: [
          { name: "bettor", type: "address" },
          { name: "marketId", type: "uint256" },
          { name: "outcome", type: "uint8" },
          { name: "amount", type: "uint256" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" },
          { name: "authorizedRelayer", type: "address" },
        ],
      },
      message: authorization,
    });
  });
});
