import { describe, expect, it } from "vitest";
import { approvalTarget, approvalTierLabel } from "./approvalPolicy";

const USDT = 1_000_000n;

describe("approval policy", () => {
  it("uses the exact operation amount in exact mode", () => {
    expect(approvalTarget(7n * USDT, "exact")).toBe(7n * USDT);
  });

  it("keeps small operations inside a bounded reusable allowance", () => {
    expect(approvalTarget(500_000n, "smart")).toBe(25n * USDT);
    expect(approvalTarget(25n * USDT, "smart")).toBe(100n * USDT);
  });

  it("adds useful headroom for high roller operations without unlimited approval", () => {
    expect(approvalTarget(250n * USDT, "smart")).toBe(500n * USDT);
    expect(approvalTarget(1_000n * USDT, "smart")).toBe(2_000n * USDT);
    expect(approvalTarget(2_500n * USDT, "smart")).toBe(2_500n * USDT);
  });

  it("does not request an allowance for a zero-cost operation", () => {
    expect(approvalTarget(0n, "smart")).toBe(0n);
  });

  it("describes both approval modes in user-facing language", () => {
    expect(approvalTierLabel("smart")).toMatch(/reutilizable/i);
    expect(approvalTierLabel("exact")).toMatch(/operacion/i);
  });
});
