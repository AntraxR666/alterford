import { privateKeyToAccount } from "viem/accounts";
import { describe, expect, it, vi } from "vitest";
import { XmrConversionLedger, type XmrConversionProvider } from "./xmrConversion.js";
import {
  buildXmrConversionAuthorization,
  XmrConversionService,
} from "./xmrConversionService.js";

const account = privateKeyToAccount(`0x${"1".repeat(64)}`);

describe("XmrConversionService", () => {
  it("routes threshold and voluntary requests to an official assistance case", async () => {
    const { service, provider } = fixture();
    const threshold = await service.createQuote({
      destination: account.address,
      settlementAmountMinor: 1_500_000_000n,
      idempotencyKey: "quote-threshold-0001",
      userIp: "203.0.113.1",
    });
    expect(threshold.mode).toBe("assisted");
    expect(provider.quote).not.toHaveBeenCalled();

    const requested = await service.createQuote({
      destination: account.address,
      settlementAmountMinor: 10_000_000n,
      idempotencyKey: "quote-assisted-0001",
      userIp: "203.0.113.1",
      assistanceRequested: true,
    });
    expect(requested.mode).toBe("assisted");
  });

  it("creates an automatic quote below the threshold", async () => {
    const { service } = fixture();
    const result = await service.createQuote({
      destination: account.address,
      settlementAmountMinor: 100_000_000n,
      idempotencyKey: "quote-automatic-0001",
      userIp: "203.0.113.2",
    });
    expect(result).toMatchObject({
      mode: "automatic",
      nonce: 0n,
      quote: { netSettlementAmountMinor: 100_000_000n },
    });
  });

  it("requires a valid non-replayable EIP-712 authorization before order creation", async () => {
    const { service, ledger } = fixture();
    const quoteResult = await service.createQuote({
      destination: account.address,
      settlementAmountMinor: 100_000_000n,
      idempotencyKey: "quote-signed-0001",
      userIp: "203.0.113.3",
    });
    if (quoteResult.mode !== "automatic") throw new Error("expected automatic quote");
    const authorization = {
      destination: account.address,
      quoteId: quoteResult.quote.id,
      idempotencyKey: "conversion-signed-0001",
      nonce: 0n,
      deadline: 1_800,
    };
    const signature = await account.signTypedData(buildXmrConversionAuthorization(8453, authorization));
    const conversion = await service.createConversion({
      ...authorization,
      signature,
      userIp: "203.0.113.3",
    });
    expect(conversion.destination).toBe(account.address);
    expect(ledger.conversionNonce(account.address)).toBe(1n);
    await expect(service.createConversion({
      ...authorization,
      idempotencyKey: "conversion-replay-0002",
      signature,
      userIp: "203.0.113.3",
    })).rejects.toThrow();
  });

  it("completes only after provider settlement is verified on Base", async () => {
    const { service, ledger, verifier } = fixture();
    const quoteResult = await service.createQuote({
      destination: account.address,
      settlementAmountMinor: 100_000_000n,
      idempotencyKey: "quote-sync-0001",
      userIp: "203.0.113.4",
    });
    if (quoteResult.mode !== "automatic") throw new Error("expected automatic quote");
    const authorization = {
      destination: account.address,
      quoteId: quoteResult.quote.id,
      idempotencyKey: "conversion-sync-0001",
      nonce: 0n,
      deadline: 1_800,
    };
    const signature = await account.signTypedData(buildXmrConversionAuthorization(8453, authorization));
    const conversion = await service.createConversion({ ...authorization, signature, userIp: "203.0.113.4" });
    await service.syncConversion(conversion.id, "203.0.113.4");
    expect(verifier.verify).toHaveBeenCalled();
    expect(ledger.conversion(conversion.id)?.status).toBe("completed");
  });
});

function fixture() {
  const provider = {
    name: "mock-provider",
    capabilities: vi.fn(async () => ({ available: true, minimumDepositAtomic: 1n, maximumDepositAtomic: 10n ** 18n })),
    quote: vi.fn(async ({ destination }: { destination: typeof account.address }) => ({
      provider: "mock-provider",
      providerQuoteId: "provider-quote-0001",
      destination,
      depositAmountAtomic: 1_250_000_000_000n,
      grossSettlementAmountMinor: 101_000_000n,
      providerFeeMinor: 0n,
      networkFeeMinor: 1_000_000n,
      netSettlementAmountMinor: 100_000_000n,
      feeMode: "deducted" as const,
      rate: "80",
      expiresAt: 1_900,
    })),
    createOrder: vi.fn(async () => ({ providerOrderId: "provider-order-0001", depositAddress: "4".repeat(95) })),
    order: vi.fn(async () => ({ status: "settling_base" as const, settlementTransactionHash: `0x${"a".repeat(64)}` as const })),
  } satisfies XmrConversionProvider;
  const verifier = {
    verify: vi.fn(async (transactionHash: `0x${string}`) => ({
      transactionHash,
      amountMinor: 100_000_000n,
      confirmations: 12,
      verifiedAt: 1_200,
    })),
  };
  const ledger = new XmrConversionLedger();
  return {
    provider,
    verifier,
    ledger,
    service: new XmrConversionService({
      chainId: 8453,
      assistedThresholdMinor: 1_500_000_000n,
      provider,
      verifier,
      ledger,
      now: () => 1_000,
      id: (() => { let id = 0; return (prefix: string) => `${prefix}-${String(++id).padStart(4, "0")}`; })(),
    }),
  };
}
