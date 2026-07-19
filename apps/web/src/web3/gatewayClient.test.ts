import { describe, expect, it, vi } from "vitest";
import { AlterfordGatewayClient, isRelayConfigCompatible } from "./gatewayClient";

const address = "0x00000000000000000000000000000000000000a1" as const;

describe("AlterfordGatewayClient", () => {
  it("offers gasless actions only for the exact active deployment", () => {
    const expected = {
      chainId: 84532,
      challengeFactory: "0x1111111111111111111111111111111111111111" as const,
      forwarder: "0x2222222222222222222222222222222222222222" as const,
    };
    expect(isRelayConfigCompatible({ ...expected, relayEnabled: true, fiatEnabled: false }, expected)).toBe(true);
    expect(isRelayConfigCompatible({ ...expected, chainId: 8453, relayEnabled: true, fiatEnabled: false }, expected)).toBe(false);
    expect(isRelayConfigCompatible({ ...expected, relayEnabled: false, fiatEnabled: false }, expected)).toBe(false);
    expect(isRelayConfigCompatible({
      ...expected,
      challengeFactory: "0x3333333333333333333333333333333333333333",
      relayEnabled: true,
      fiatEnabled: false,
    }, expected)).toBe(false);
  });

  it("parses sponsored request bigint fields without losing precision", async () => {
    const fetcher = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => new Response(JSON.stringify({
      action: "acceptChallenge",
      request: {
        from: address,
        to: "0x00000000000000000000000000000000000000b1",
        value: "0",
        gas: "600000",
        nonce: "9007199254740993",
        deadline: 2_000_000_000,
        data: "0x12345678",
      },
    }), { status: 200 }));
    const client = new AlterfordGatewayClient("https://gateway.example", fetcher as typeof fetch);

    const result = await client.prepareRelay({ chainId: 84532, user: address, data: "0x12345678" });

    expect(result.request.nonce).toBe(9_007_199_254_740_993n);
    expect(result.request.gas).toBe(600_000n);
  });

  it("submits signed bigint fields as decimal strings", async () => {
    const fetcher = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
      new Response(JSON.stringify({ taskId: "relay-1" }), { status: 202 }));
    const client = new AlterfordGatewayClient("https://gateway.example/", fetcher as typeof fetch);

    await client.submitRelay({
      request: {
        from: address,
        to: "0x00000000000000000000000000000000000000b1",
        value: 0n,
        gas: 600_000n,
        nonce: 12n,
        deadline: 2_000_000_000,
        data: "0x12345678",
        signature: "0xabcdef",
      },
      idempotencyKey: "relay-test-0001",
    });

    const body = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body));
    expect(body.request.nonce).toBe("12");
    expect(body.request.gas).toBe("600000");
  });

  it("surfaces the gateway error message", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ message: "Policy rejected request." }), { status: 422 }));
    const client = new AlterfordGatewayClient("https://gateway.example", fetcher as typeof fetch);

    await expect(client.relayStatus("bad-task")).rejects.toThrow("Policy rejected request");
  });

  it("uploads image evidence without exposing provider credentials to the browser", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      cid: "bafy-proof",
      uri: "ipfs://bafy-proof",
      sha256: "ab".repeat(32),
      size: 5,
      mimeType: "image/png",
    }), { status: 201 }));
    const client = new AlterfordGatewayClient("https://gateway.example", fetcher as typeof fetch);

    const result = await client.uploadEvidenceImage({
      fileName: "proof.png",
      mimeType: "image/png",
      bytesBase64: "cGhvdG8=",
    });

    expect(result.uri).toBe("ipfs://bafy-proof");
    expect(fetcher).toHaveBeenCalledWith(
      "https://gateway.example/v1/evidence/images",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("does not invoke browser fetch with the gateway client as its receiver", async () => {
    const fetcher = vi.fn(function (this: unknown) {
      if (this !== undefined) throw new TypeError("Illegal invocation");
      return Promise.resolve(new Response(JSON.stringify({
        chainId: 84532,
        challengeFactory: address,
        forwarder: address,
        relayEnabled: true,
        fiatEnabled: false,
      }), { status: 200 }));
    });
    const client = new AlterfordGatewayClient("https://gateway.example", fetcher as typeof fetch);

    await expect(client.config()).resolves.toMatchObject({ chainId: 84532, relayEnabled: true });
  });

  it("creates native XMR deposits using decimal atomic-unit strings", async () => {
    const fetcher = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => new Response(JSON.stringify({
      id: "xmr-deposit-001",
      beneficiary: address,
      address: "8".repeat(95),
      requestedAmountAtomic: "1250000000000",
      receivedAmountAtomic: "0",
      confirmedAmountAtomic: "0",
      status: "awaiting_payment",
      transfers: [],
      createdAt: 1,
      updatedAt: 1,
      addressIndex: 17,
      idempotencyKey: "deposit-key-0001",
    }), { status: 201 }));
    const client = new AlterfordGatewayClient("https://gateway.example", fetcher as typeof fetch);

    const result = await client.createMoneroDeposit({
      beneficiary: address,
      requestedAmountAtomic: 1_250_000_000_000n,
      idempotencyKey: "deposit-key-0001",
    });

    expect(result.requestedAmountAtomic).toBe(1_250_000_000_000n);
    expect(result.address).toBe("8".repeat(95));
    expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).toMatchObject({
      requestedAmountAtomic: "1250000000000",
    });
  });

  it("parses transparent XMR conversion quotes without losing precision", async () => {
    const fetcher = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => new Response(JSON.stringify({
      mode: "automatic",
      nonce: "9007199254740993",
      quote: {
        id: "xmr-quote-0001",
        provider: "sideshift",
        destination: address,
        depositAmountAtomic: "1250000000000",
        grossSettlementAmountMinor: "101250000",
        providerFeeMinor: "1000000",
        networkFeeMinor: "250000",
        netSettlementAmountMinor: "100000000",
        feeMode: "deducted",
        rate: "80",
        expiresAt: 2_000_000_000,
      },
    }), { status: 201 }));
    const client = new AlterfordGatewayClient("https://gateway.example", fetcher as typeof fetch);
    const result = await client.createXmrQuote({
      destination: address,
      settlementAmountMinor: 100_000_000n,
      idempotencyKey: "quote-key-0001",
    });
    if (result.mode !== "automatic") throw new Error("expected automatic quote");
    expect(result.nonce).toBe(9_007_199_254_740_993n);
    expect(result.quote.depositAmountAtomic).toBe(1_250_000_000_000n);
    expect(result.quote.netSettlementAmountMinor).toBe(100_000_000n);
    expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body)).settlementAmountMinor).toBe("100000000");
  });
});
