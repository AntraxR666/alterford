import { describe, expect, it, vi } from "vitest";
import { encodeFunctionData, type Address, type Hex } from "viem";
import { challengeFactoryAbi } from "@alterford/sdk";
import { GatewayService } from "./service.js";

const challengeFactory = "0x1111111111111111111111111111111111111111" as Address;
const marketFactory = "0x1212121212121212121212121212121212121212" as Address;
const bountyFactory = "0x1313131313131313131313131313131313131313" as Address;
const forwarder = "0x2222222222222222222222222222222222222222" as Address;
const user = "0x3333333333333333333333333333333333333333" as Address;
const signature = `0x${"11".repeat(65)}` as Hex;

function fixture() {
  const chain = {
    getNonce: vi.fn(async () => 7n),
    verify: vi.fn(async () => true),
    simulate: vi.fn(async () => undefined),
  };
  const relay = {
    submit: vi.fn(async (_transaction: { chainId: number; to: Address; data: Hex }) => ({
      taskId: "gelato-task-1",
    })),
    status: vi.fn(async () => ({ state: "confirmed" as const, transactionHash: "0xabc" as Hex })),
  };
  const fiat = {
    createSession: vi.fn(async () => ({
      widgetUrl: "https://global-stg.transak.com?sessionId=one",
      expiresInSeconds: 300,
    })),
  };
  const service = new GatewayService({
    config: {
      chainId: 84532,
      marketFactory,
      bountyFactory,
      challengeFactory,
      forwarder,
      requestTtlSeconds: 600,
      maxCalldataBytes: 4096,
      globalDailyLimit: 100,
      walletDailyLimit: 20,
      ipHourlyLimit: 30,
    },
    chain,
    relay,
    fiat,
    now: () => 1_000,
  });
  return { chain, fiat, relay, service };
}

describe("GatewayService relay flow", () => {
  it("prepares the canonical typed request with the on-chain nonce", async () => {
    const { service } = fixture();
    const data = encodeFunctionData({
      abi: challengeFactoryAbi,
      functionName: "submitEvidence",
      args: [1n, `0x${"22".repeat(32)}`, "ipfs://evidence", ""],
    });

    const prepared = await service.prepareRelay({ chainId: 84532, user, target: challengeFactory, data }, "203.0.113.10");

    expect(prepared.request).toMatchObject({
      from: user,
      to: challengeFactory,
      value: 0n,
      gas: 500_000n,
      nonce: 7n,
      deadline: 1_600,
    });
    expect(prepared.typedData.domain.verifyingContract).toBe(forwarder);
  });

  it("verifies and submits once, returning the same task for an idempotent retry", async () => {
    const { chain, relay, service } = fixture();
    const data = encodeFunctionData({
      abi: challengeFactoryAbi,
      functionName: "submitEvidence",
      args: [1n, `0x${"22".repeat(32)}`, "ipfs://evidence", ""],
    });
    const prepared = await service.prepareRelay({ chainId: 84532, user, target: challengeFactory, data }, "203.0.113.10");
    const input = { request: { ...prepared.request, signature }, idempotencyKey: "request-1" };

    const first = await service.submitRelay(input, "203.0.113.10");
    const second = await service.submitRelay(input, "203.0.113.10");

    expect(first).toEqual({ taskId: "gelato-task-1" });
    expect(second).toEqual(first);
    expect(chain.verify).toHaveBeenCalledOnce();
    expect(chain.simulate).toHaveBeenCalledOnce();
    expect(relay.submit).toHaveBeenCalledOnce();
    expect(relay.submit.mock.calls[0]?.[0]).toMatchObject({ chainId: 84532, to: forwarder });
  });

  it("does not spend sponsorship when on-chain verification fails", async () => {
    const { chain, relay, service } = fixture();
    chain.verify.mockResolvedValue(false);
    const data = encodeFunctionData({
      abi: challengeFactoryAbi,
      functionName: "finalizeUndisputed",
      args: [1n],
    });
    const prepared = await service.prepareRelay({ chainId: 84532, user, target: challengeFactory, data }, "203.0.113.10");

    await expect(
      service.submitRelay(
        { request: { ...prepared.request, signature }, idempotencyKey: "request-2" },
        "203.0.113.10",
      ),
    ).rejects.toThrow("signature or nonce");
    expect(relay.submit).not.toHaveBeenCalled();
  });

  it("creates only one fiat widget session for an idempotent request", async () => {
    const { fiat, service } = fixture();
    const input = {
      idempotencyKey: "fiat-session-0001",
      walletAddress: user,
      fiatAmount: 25,
      fiatCurrency: "USD",
      cryptoCurrencyCode: "ETH",
      network: "base",
      partnerOrderId: "alterford-order-0001",
    };

    const first = await service.createFiatSession(input);
    const second = await service.createFiatSession(input);

    expect(second).toEqual(first);
    expect(fiat.createSession).toHaveBeenCalledOnce();
  });
});
