import { describe, expect, it, vi } from "vitest";
import type { Chain } from "viem";
import { ensureProviderChain } from "./chainSwitch";

function provider(initialChainId = "0x14a34") {
  let activeChainId = initialChainId;
  return {
    request: vi.fn(async ({ method, params }: { method: string; params?: unknown[] }) => {
      if (method === "eth_chainId") return activeChainId;
      if (method === "wallet_switchEthereumChain") {
        const next = params?.[0] as { chainId?: string } | undefined;
        activeChainId = next?.chainId ?? activeChainId;
        return null;
      }
      if (method === "wallet_addEthereumChain") return null;
      return null;
    }),
  };
}

const baseSepoliaLike = {
  id: 84532,
  name: "Base Sepolia",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://sepolia.base.org"] } },
  blockExplorers: { default: { name: "BaseScan", url: "https://sepolia.basescan.org" } },
} satisfies Pick<Chain, "id" | "name" | "nativeCurrency" | "rpcUrls" | "blockExplorers">;

describe("ensureProviderChain", () => {
  it("treats the provider as ready when it is already on the requested chain", async () => {
    const embedded = provider("0x14a34");

    await expect(ensureProviderChain(embedded, 84532, baseSepoliaLike)).resolves.toBe(true);

    expect(embedded.request).toHaveBeenCalledTimes(1);
    expect(embedded.request).toHaveBeenCalledWith({ method: "eth_chainId" });
  });

  it("switches the provider when it is on a different configured chain", async () => {
    const embedded = provider("0x1");

    await expect(ensureProviderChain(embedded, 84532, baseSepoliaLike)).resolves.toBe(true);

    expect(embedded.request).toHaveBeenCalledWith({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: "0x14a34" }],
    });
  });

  it("adds the chain before retrying when the provider does not know it yet", async () => {
    let added = false;
    const embedded = {
      request: vi.fn(async ({ method, params }: { method: string; params?: unknown[] }) => {
        if (method === "eth_chainId") return added ? "0x14a34" : "0x1";
        if (method === "wallet_switchEthereumChain") {
          if (added) return null;
          const error = new Error("Unknown chain");
          (error as Error & { code?: number }).code = 4902;
          throw error;
        }
        if (method === "wallet_addEthereumChain") {
          added = true;
          return null;
        }
        return null;
      }),
    };

    await expect(ensureProviderChain(embedded, 84532, baseSepoliaLike)).resolves.toBe(true);

    expect(embedded.request).toHaveBeenCalledWith({
      method: "wallet_addEthereumChain",
      params: [{
        chainId: "0x14a34",
        chainName: "Base Sepolia",
        nativeCurrency: baseSepoliaLike.nativeCurrency,
        rpcUrls: ["https://sepolia.base.org"],
        blockExplorerUrls: ["https://sepolia.basescan.org"],
      }],
    });
  });
});
