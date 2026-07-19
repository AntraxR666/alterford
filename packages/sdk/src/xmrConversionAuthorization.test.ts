import { describe, expect, it } from "vitest";
import { hashTypedData } from "viem";
import { buildXmrConversionAuthorization } from "./xmrConversionAuthorization.js";

describe("XMR conversion authorization", () => {
  it("binds the destination, quote, idempotency key and nonce to the active chain", () => {
    const typedData = buildXmrConversionAuthorization(8453, {
      destination: "0x1111111111111111111111111111111111111111",
      quoteId: "xmr-quote-0001",
      idempotencyKey: "xmr-order-0001",
      nonce: 7n,
      deadline: 2_000_000_000,
    });

    expect(typedData.domain).toEqual({
      name: "Alterford XMR Conversion",
      version: "1",
      chainId: 8453,
    });
    expect(typedData.message).toMatchObject({
      destination: "0x1111111111111111111111111111111111111111",
      quoteId: "xmr-quote-0001",
      idempotencyKey: "xmr-order-0001",
      nonce: 7n,
      deadline: 2_000_000_000n,
    });
    expect(hashTypedData(typedData)).toMatch(/^0x[0-9a-f]{64}$/);
  });
});
