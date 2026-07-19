import { describe, expect, it } from "vitest";
import { missingNativeGasMessage, readableTransactionError } from "./transactionErrors";

describe("readableTransactionError", () => {
  it("does not tell an email wallet user to open MetaMask for a provider gas-limit error", () => {
    const message = readableTransactionError(
      new Error("exceeds max transaction gas limit\nprovider chain request failed"),
      { walletKind: "embedded", targetChainName: "Base Sepolia" },
    );

    expect(message).toMatch(/wallet con email/i);
    expect(message).not.toMatch(/MetaMask/i);
    expect(message).toMatch(/No se movieron fondos/i);
  });

  it("explains a closed market rejection without suggesting a network change", () => {
    const message = readableTransactionError(
      new Error("execution reverted, data: 0xbaf3f0f7"),
      { walletKind: "embedded", targetChainName: "Base Sepolia" },
    );

    expect(message).toMatch(/ya no esta abierto/i);
    expect(message).toMatch(/No se movieron fondos/i);
    expect(message).not.toMatch(/MetaMask/i);
  });

  it("keeps network guidance neutral for an email wallet", () => {
    const message = readableTransactionError(
      new Error("switch chain failed"),
      { walletKind: "embedded", targetChainName: "Base Sepolia" },
    );

    expect(message).toMatch(/wallet con email/i);
    expect(message).not.toMatch(/MetaMask/i);
  });

  it("explains when a wallet lacks Base Sepolia gas before sending", () => {
    const message = missingNativeGasMessage({ walletKind: "embedded", targetChainName: "Base Sepolia" });

    expect(message).toMatch(/wallet con email/i);
    expect(message).toMatch(/ETH suficiente en Base Sepolia/i);
    expect(message).toMatch(/No se movieron fondos/i);
  });
});
