import type { Address, ChainId, ContractAddresses } from "@alterford/sdk";
import { isAddress } from "viem";

function envAddress(value: string | undefined): Address | undefined {
  return value && isAddress(value) ? value : undefined;
}

export function configuredChainId(): ChainId {
  const parsed = Number(import.meta.env.VITE_CHAIN_ID || "84532");
  return (Number.isFinite(parsed) ? parsed : 84532) as ChainId;
}

export function configuredAddresses(): Partial<ContractAddresses> {
  return {
    settlementToken: envAddress(import.meta.env.VITE_SETTLEMENT_TOKEN_ADDRESS),
    creationBondPolicy: envAddress(import.meta.env.VITE_CREATION_BOND_POLICY_ADDRESS),
    marketFactory: envAddress(import.meta.env.VITE_MARKET_FACTORY_ADDRESS),
    bountyFactory: envAddress(import.meta.env.VITE_BOUNTY_FACTORY_ADDRESS),
    challengeFactory: envAddress(import.meta.env.VITE_CHALLENGE_FACTORY_ADDRESS),
    alterfordForwarder: envAddress(import.meta.env.VITE_ALTERFORD_FORWARDER_ADDRESS),
  };
}

export function hasCoreAddresses(addresses: Partial<ContractAddresses>): addresses is ContractAddresses {
  return Boolean(addresses.settlementToken && addresses.creationBondPolicy && addresses.marketFactory);
}
