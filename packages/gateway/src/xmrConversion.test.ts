import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { XmrConversionLedger } from "./xmrConversion.js";
import {
  atomicXmrConversionWriter,
  loadXmrConversionSnapshot,
} from "./xmrConversionLedger.js";

const wallet = "0x1111111111111111111111111111111111111111" as const;

describe("XmrConversionLedger", () => {
  it("creates decimal-safe idempotent quotes with transparent fees", () => {
    const ledger = new XmrConversionLedger();
    const quote = ledger.createQuote({
      id: "xmr-quote-0001",
      idempotencyKey: "quote-key-0001",
      provider: "sideshift",
      providerQuoteId: "provider-quote-0001",
      destination: wallet,
      depositAmountAtomic: 1_234_567_890_123n,
      grossSettlementAmountMinor: 101_250_000n,
      providerFeeMinor: 1_000_000n,
      networkFeeMinor: 250_000n,
      netSettlementAmountMinor: 100_000_000n,
      feeMode: "deducted",
      rate: "81.000000",
      createdAt: 100,
      expiresAt: 1_000,
      assisted: false,
    });

    expect(ledger.createQuote({ ...quote, id: "ignored-quote-id" })).toEqual(quote);
    expect(ledger.snapshot().quotes[0]?.depositAmountAtomic).toBe("1234567890123");
  });

  it("rejects fee double charging and immutable-destination conflicts", () => {
    const ledger = new XmrConversionLedger();
    const input = quoteInput();
    ledger.createQuote(input);

    expect(() => ledger.createQuote({
      ...input,
      destination: "0x2222222222222222222222222222222222222222",
    })).toThrow("idempotency");
    expect(() => ledger.createQuote({
      ...input,
      id: "xmr-quote-0002",
      idempotencyKey: "quote-key-0002",
      netSettlementAmountMinor: 99_000_000n,
      feeMode: "added",
    })).toThrow("fee accounting");
  });

  it("creates one conversion and enforces its state machine", () => {
    const ledger = new XmrConversionLedger();
    ledger.createQuote(quoteInput());
    const conversion = ledger.createConversion({
      id: "xmr-conversion-0001",
      idempotencyKey: "conversion-key-0001",
      quoteId: "xmr-quote-0001",
      destination: wallet,
      providerOrderId: "provider-order-0001",
      depositAddress: "4".repeat(95),
      createdAt: 101,
    });
    expect(ledger.createConversion({ ...conversion, id: "ignored-conversion-id" })).toEqual(conversion);

    ledger.transition("xmr-conversion-0001", "confirming_xmr", 110);
    ledger.transition("xmr-conversion-0001", "converting", 120);
    ledger.transition("xmr-conversion-0001", "settling_base", 130);
    expect(() => ledger.transition("xmr-conversion-0001", "completed", 140))
      .toThrow("verified Base settlement");
    ledger.recordVerifiedSettlement("xmr-conversion-0001", {
      transactionHash: `0x${"a".repeat(64)}`,
      amountMinor: 100_000_000n,
      confirmations: 12,
      verifiedAt: 140,
    });
    expect(ledger.conversion("xmr-conversion-0001")?.status).toBe("completed");
    expect(() => ledger.transition("xmr-conversion-0001", "converting", 150)).toThrow("transition");
    expect(ledger.conversionNonce(wallet)).toBe(0n);
    ledger.consumeConversionNonce(wallet, 0n);
    expect(ledger.conversionNonce(wallet)).toBe(1n);
    expect(() => ledger.consumeConversionNonce(wallet, 0n)).toThrow("nonce");
  });

  it("creates idempotent assistance cases without payment instructions", () => {
    const ledger = new XmrConversionLedger();
    const first = ledger.createAssistanceCase({
      id: "xmr-case-0001",
      idempotencyKey: "case-key-0001",
      destination: wallet,
      requestedSettlementMinor: 1_500_000_000n,
      reason: "threshold",
      createdAt: 100,
    });
    expect(ledger.createAssistanceCase({ ...first, id: "ignored-case-id" })).toEqual(first);
    expect(first).not.toHaveProperty("depositAddress");
  });

  it("round-trips an atomic bigint-safe snapshot", () => {
    const directory = mkdtempSync(join(tmpdir(), "alterford-xmr-conversion-"));
    const path = join(directory, "ledger.json");
    const writer = atomicXmrConversionWriter(path);
    const ledger = new XmrConversionLedger(undefined, writer);
    ledger.createQuote(quoteInput());

    expect(readFileSync(path, "utf8")).toContain('"netSettlementAmountMinor": "100000000"');
    const restored = new XmrConversionLedger(loadXmrConversionSnapshot(path));
    expect(restored.quote("xmr-quote-0001")?.netSettlementAmountMinor).toBe(100_000_000n);
  });
});

function quoteInput() {
  return {
    id: "xmr-quote-0001",
    idempotencyKey: "quote-key-0001",
    provider: "sideshift",
    providerQuoteId: "provider-quote-0001",
    destination: wallet,
    depositAmountAtomic: 1_234_567_890_123n,
    grossSettlementAmountMinor: 101_250_000n,
    providerFeeMinor: 1_000_000n,
    networkFeeMinor: 250_000n,
    netSettlementAmountMinor: 100_000_000n,
    feeMode: "deducted" as const,
    rate: "81.000000",
    createdAt: 100,
    expiresAt: 1_000,
    assisted: false,
  };
}
