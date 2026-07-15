export type RelayProviderName = "biconomy" | "gelato" | "disabled";

export function resolveRelayProvider(input: {
  chainId: number;
  provider?: string;
  gelatoKey?: string;
}): RelayProviderName {
  const requested = input.provider?.trim().toLowerCase();
  const provider = requested || (input.chainId === 84532 ? "biconomy" : "disabled");

  if (provider === "biconomy") {
    if (input.chainId !== 84532) {
      throw new Error("The shared Biconomy sponsorship is testnet-only and cannot run on Base mainnet.");
    }
    return provider;
  }
  if (provider === "gelato") {
    if (!input.gelatoKey?.trim()) {
      throw new Error("GELATO_API_KEY is required when RELAY_PROVIDER=gelato.");
    }
    return provider;
  }
  if (provider === "disabled") return provider;
  throw new Error(`Unsupported RELAY_PROVIDER: ${input.provider}.`);
}
