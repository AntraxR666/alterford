import { describe, expect, it, vi } from "vitest";
import JSONbigFactory from "json-bigint";
import { MoneroWalletRpcClient } from "./moneroRpc.js";

const rpcUrl = "http://127.0.0.1:18088/json_rpc";
const JSONbig = JSONbigFactory({ useNativeBigInt: true });

describe("MoneroWalletRpcClient", () => {
  it("creates a uniquely indexed subaddress", async () => {
    const fetcher = vi.fn(async () => jsonResponse({
      result: {
        address: "8".repeat(95),
        address_index: 17,
      },
    }));
    const client = new MoneroWalletRpcClient({ rpcUrl, fetcher });

    await expect(client.createAddress("deposit-001")).resolves.toEqual({
      address: "8".repeat(95),
      addressIndex: 17,
    });
    expect(rpcBody(fetcher)).toMatchObject({
      method: "create_address",
      params: { account_index: 0, label: "deposit-001" },
    });
  });

  it("normalizes incoming transfers without losing atomic-unit precision", async () => {
    const fetcher = vi.fn(async () => jsonResponse({
      result: {
        in: [{
          txid: "a".repeat(64),
          amount: 9_007_199_254_740_993n,
          confirmations: 12,
          double_spend_seen: false,
          locked: false,
          subaddr_index: { major: 0, minor: 17 },
        }],
      },
    }));
    const client = new MoneroWalletRpcClient({ rpcUrl, fetcher });

    await expect(client.incomingTransfers(17)).resolves.toEqual([{
      txHash: "a".repeat(64),
      amountAtomic: 9_007_199_254_740_993n,
      confirmations: 12,
      doubleSpendSeen: false,
      locked: false,
      addressIndex: 17,
    }]);
  });

  it("submits exact atomic-unit withdrawals", async () => {
    const fetcher = vi.fn(async () => jsonResponse({
      result: { tx_hash: "b".repeat(64), fee: 42_000_000 },
    }));
    const client = new MoneroWalletRpcClient({ rpcUrl, fetcher });

    await expect(client.transfer("4".repeat(95), 1_250_000_000_000n)).resolves.toEqual({
      txHash: "b".repeat(64),
      feeAtomic: 42_000_000n,
    });
    expect(rpcBody(fetcher)).toMatchObject({
      method: "transfer",
      params: {
        account_index: 0,
        destinations: [{ address: "4".repeat(95), amount: 1_250_000_000_000 }],
        get_tx_key: true,
      },
    });
  });

  it("performs an HTTP digest retry when rpc-login is configured", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response("", {
        status: 401,
        headers: {
          "www-authenticate": 'Digest realm="monero-rpc", nonce="abc123", qop="auth", opaque="opaque"',
        },
      }))
      .mockResolvedValueOnce(jsonResponse({ result: { height: 12345 } }));
    const client = new MoneroWalletRpcClient({
      rpcUrl,
      username: "alterford",
      password: "secret",
      fetcher,
      cnonce: () => "deadbeef",
    });

    await expect(client.height()).resolves.toBe(12_345);
    const authorization = new Headers(fetcher.mock.calls[1]?.[1]?.headers).get("authorization");
    expect(authorization).toContain('Digest username="alterford"');
    expect(authorization).toContain('nonce="abc123"');
    expect(authorization).toContain("nc=00000001");
    expect(authorization).toContain('cnonce="deadbeef"');
  });

  it("rejects malformed and upstream error responses", async () => {
    const malformed = new MoneroWalletRpcClient({
      rpcUrl,
      fetcher: vi.fn(async () => jsonResponse({ result: { address_index: 1 } })),
    });
    await expect(malformed.createAddress("deposit")).rejects.toThrow("invalid address");

    const upstream = new MoneroWalletRpcClient({
      rpcUrl,
      fetcher: vi.fn(async () => jsonResponse({
        error: { code: -1, message: "wallet unavailable" },
      })),
    });
    await expect(upstream.height()).rejects.toThrow("wallet unavailable");
  });
});

function jsonResponse(value: unknown) {
  return new Response(JSONbig.stringify(value), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function rpcBody(fetcher: ReturnType<typeof vi.fn>) {
  return JSON.parse(String(fetcher.mock.calls.at(-1)?.[1]?.body));
}
