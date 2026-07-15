import { describe, expect, it } from "vitest";
import { resolveRelayProvider } from "./relayConfig.js";

describe("relay provider configuration", () => {
  it("uses Biconomy staging by default on Base Sepolia", () => {
    expect(resolveRelayProvider({ chainId: 84532 })).toBe("biconomy");
  });

  it("keeps Base mainnet disabled without an explicitly configured provider", () => {
    expect(resolveRelayProvider({ chainId: 8453 })).toBe("disabled");
  });

  it("requires a Gelato key when Gelato is explicitly selected", () => {
    expect(() => resolveRelayProvider({ chainId: 84532, provider: "gelato" }))
      .toThrow("GELATO_API_KEY");
  });

  it("never permits the shared Biconomy testnet sponsorship on Base mainnet", () => {
    expect(() => resolveRelayProvider({ chainId: 8453, provider: "biconomy" }))
      .toThrow("testnet-only");
  });
});
