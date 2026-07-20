import { describe, expect, it } from "vitest";
import { encodeFunctionData, type Address, type Hex } from "viem";
import { challengeFactoryAbi } from "@alterford/sdk";
import { PolicyViolation, SponsorshipPolicy } from "./policy.js";

const target = "0x1111111111111111111111111111111111111111" as Address;
const marketFactory = "0x3333333333333333333333333333333333333333" as Address;
const bountyFactory = "0x4444444444444444444444444444444444444444" as Address;
const user = "0x2222222222222222222222222222222222222222" as Address;

describe("SponsorshipPolicy", () => {
  const policy = new SponsorshipPolicy({
    chainId: 84532,
    marketFactory,
    bountyFactory,
    challengeFactory: target,
    requestTtlSeconds: 600,
    maxCalldataBytes: 4096,
  });

  it("allows only configured factory selectors and assigns bounded gas", () => {
    const data = encodeFunctionData({
      abi: challengeFactoryAbi,
      functionName: "acceptChallengeWithPermit",
      args: [1n, "https://live.example/session", { value: 1n, deadline: 2n, v: 27, r: `0x${"00".repeat(32)}`, s: `0x${"00".repeat(32)}` }],
    });

    expect(policy.authorize({ chainId: 84532, target, user, value: 0n, data }, 1_000)).toEqual({
      action: "acceptChallengeWithPermit",
      deadline: 1_600,
      gas: 700_000n,
    });
  });

  it.each([
    ["wrong chain", { chainId: 1, target, user, value: 0n, data: "0x12345678" as Hex }],
    ["wrong target", { chainId: 84532, target: user, user, value: 0n, data: "0x12345678" as Hex }],
    ["native value", { chainId: 84532, target, user, value: 1n, data: "0x12345678" as Hex }],
    ["unknown selector", { chainId: 84532, target, user, value: 0n, data: "0x12345678" as Hex }],
  ])("rejects %s", (_label, request) => {
    expect(() => policy.authorize(request, 1_000)).toThrow(PolicyViolation);
  });
});
