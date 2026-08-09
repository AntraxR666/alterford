import { describe, expect, it } from "vitest";
import {
  connectionWithTimeout,
  hasMetaMaskProvider,
  selectMetaMaskConnector,
  selectWalletConnectConnector,
} from "./walletConnection";

const connector = (id: string, name: string) => ({ id, name });

describe("wallet connection selection", () => {
  it("selects MetaMask explicitly when several injected wallets coexist", () => {
    const connectors = [
      connector("com.binance.wallet", "Binance Web3 Wallet"),
      connector("metaMask", "MetaMask"),
      connector("injected", "Injected"),
    ];

    expect(selectMetaMaskConnector(connectors)).toEqual(connectors[1]);
  });

  it("selects MetaMask using EIP-6963 RDNS or injected fallback", () => {
    const eip6963Connectors = [
      connector("io.metamask", "MetaMask"),
    ];
    expect(selectMetaMaskConnector(eip6963Connectors)).toEqual(eip6963Connectors[0]);

    const injectedFallback = [
      connector("injected", "Browser Wallet"),
    ];
    expect(selectMetaMaskConnector(injectedFallback)).toEqual(injectedFallback[0]);
  });

  it("selects WalletConnect without falling back to an unrelated connector", () => {
    const connectors = [
      connector("metaMask", "MetaMask"),
      connector("walletConnect", "WalletConnect"),
    ];

    expect(selectWalletConnectConnector(connectors)).toEqual(connectors[1]);
    expect(selectWalletConnectConnector([connectors[0]])).toBeUndefined();
  });

  it("detects MetaMask inside a multi-provider browser", () => {
    expect(hasMetaMaskProvider({ providers: [{ isBinance: true }, { isMetaMask: true }] })).toBe(true);
    expect(hasMetaMaskProvider({ isBinance: true })).toBe(false);
    expect(hasMetaMaskProvider(undefined)).toBe(false);
  });

  it("releases a connection attempt that never answers", async () => {
    await expect(connectionWithTimeout(new Promise(() => undefined), 5)).rejects.toThrow(
      "La wallet no respondio",
    );
  });
});
