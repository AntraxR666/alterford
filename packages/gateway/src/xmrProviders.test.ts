import { describe, expect, it, vi } from "vitest";
import { SideShiftXmrProvider } from "./xmrProviders.js";

const destination = "0x1111111111111111111111111111111111111111" as const;

describe("SideShiftXmrProvider", () => {
  it("checks end-user permission and normalizes a fixed quote", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(response({ createShift: true }))
      .mockResolvedValueOnce(response([{
        depositCoin: "XMR",
        settleCoin: "USDC",
        depositNetwork: "mainnet",
        settleNetwork: "base",
        min: "0.01",
        max: "100",
        rate: "81",
      }]))
      .mockResolvedValueOnce(response({
        id: "provider-quote-0001",
        depositAmount: "1.5",
        settleAmount: "120.5",
        rate: "81",
        expiresAt: "2026-07-17T05:00:00.000Z",
        settleCoinNetworkFee: "1",
      }));
    const provider = fixture(fetcher);

    await expect(provider.capabilities({ userIp: "203.0.113.7" })).resolves.toEqual({
      available: true,
      minimumDepositAtomic: 10_000_000_000n,
      maximumDepositAtomic: 100_000_000_000_000n,
    });
    const quote = await provider.quote({
      destination,
      depositAmountAtomic: 1_500_000_000_000n,
      userIp: "203.0.113.7",
    });
    expect(quote).toMatchObject({
      provider: "sideshift",
      providerQuoteId: "provider-quote-0001",
      destination,
      depositAmountAtomic: 1_500_000_000_000n,
      grossSettlementAmountMinor: 121_500_000n,
      networkFeeMinor: 1_000_000n,
      netSettlementAmountMinor: 120_500_000n,
      feeMode: "deducted",
    });
    expect(fetcher.mock.calls.every((call) => call[1]?.headers["x-user-ip"] === "203.0.113.7"))
      .toBe(true);
  });

  it("creates a direct-to-wallet order and maps provider status", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(response({
        id: "provider-order-0001",
        depositAddress: "4".repeat(95),
        settleAddress: destination,
      }))
      .mockResolvedValueOnce(response({
        id: "provider-order-0001",
        status: "settled",
        settleHash: `0x${"a".repeat(64)}`,
      }));
    const provider = fixture(fetcher);
    const order = await provider.createOrder({ quote: quote(), externalId: "conversion-0001", userIp: "198.51.100.8" });
    expect(order).toEqual({ providerOrderId: "provider-order-0001", depositAddress: "4".repeat(95) });
    const sentBody = JSON.parse(fetcher.mock.calls[0]?.[1]?.body as string);
    expect(sentBody.settleAddress).toBe(destination);
    await expect(provider.order(order.providerOrderId, "198.51.100.8")).resolves.toEqual({
      status: "settling_base",
      settlementTransactionHash: `0x${"a".repeat(64)}`,
    });
  });

  it("fails closed on denied permissions and malformed provider data", async () => {
    const denied = fixture(vi.fn().mockResolvedValue(response({ createShift: false })));
    await expect(denied.capabilities({ userIp: "203.0.113.9" })).resolves.toEqual({ available: false });

    const malformed = fixture(vi.fn().mockResolvedValue(response({ id: "quote" })));
    await expect(malformed.quote({ destination, depositAmountAtomic: 1n, userIp: "203.0.113.9" }))
      .rejects.toThrow("provider response");
  });
});

function fixture(fetcher: typeof fetch) {
  return new SideShiftXmrProvider({
    baseUrl: "https://provider.invalid/api/v2",
    accountId: "affiliate-001",
    secret: "server-secret",
    fetcher,
    now: () => Date.parse("2026-07-17T04:00:00.000Z") / 1_000,
  });
}

function quote() {
  return {
    id: "xmr-quote-0001",
    idempotencyKey: "quote-key-0001",
    provider: "sideshift",
    providerQuoteId: "provider-quote-0001",
    destination,
    depositAmountAtomic: 1_500_000_000_000n,
    grossSettlementAmountMinor: 121_500_000n,
    providerFeeMinor: 0n,
    networkFeeMinor: 1_000_000n,
    netSettlementAmountMinor: 120_500_000n,
    feeMode: "deducted" as const,
    rate: "81",
    createdAt: 100,
    expiresAt: 1_000,
    assisted: false,
  };
}

function response(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}
