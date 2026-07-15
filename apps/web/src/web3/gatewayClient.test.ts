import { describe, expect, it, vi } from "vitest";
import { AlterfordGatewayClient } from "./gatewayClient";

const address = "0x00000000000000000000000000000000000000a1" as const;

describe("AlterfordGatewayClient", () => {
  it("parses sponsored request bigint fields without losing precision", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
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
});
