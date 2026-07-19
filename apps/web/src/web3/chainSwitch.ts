import type { Chain } from "viem";

export interface ChainSwitchProvider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
}

export async function ensureProviderChain(
  provider: ChainSwitchProvider | null | undefined,
  chainId: number,
  chain: Pick<Chain, "id" | "name" | "nativeCurrency" | "rpcUrls" | "blockExplorers">,
): Promise<boolean> {
  if (!provider?.request) return false;

  const currentChainId = await readProviderChainId(provider);
  if (currentChainId === chainId) return true;

  const chainIdHex = `0x${chainId.toString(16)}`;

  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: chainIdHex }],
    });
  } catch (error) {
    if (errorCode(error) !== 4902) {
      return (await readProviderChainId(provider)) === chainId;
    }
    await provider.request({
      method: "wallet_addEthereumChain",
      params: [{
        chainId: chainIdHex,
        chainName: chain.name,
        nativeCurrency: chain.nativeCurrency,
        rpcUrls: [...chain.rpcUrls.default.http],
        blockExplorerUrls: chain.blockExplorers?.default?.url ? [chain.blockExplorers.default.url] : undefined,
      }],
    });
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: chainIdHex }],
    });
  }

  return (await readProviderChainId(provider)) === chainId;
}

async function readProviderChainId(provider: ChainSwitchProvider) {
  const raw = await provider.request({ method: "eth_chainId" });
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function errorCode(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const value = error as { code?: unknown; cause?: unknown };
  if (typeof value.code === "number") return value.code;
  return errorCode(value.cause);
}
