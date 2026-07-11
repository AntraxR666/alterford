import { create } from "zustand";

interface WalletState {
  connectorPriority: readonly string[];
  account: string | null;
  chainId: number;
  isConnected: boolean;
}

export const useWalletStore = create<WalletState>(() => ({
  connectorPriority: ["WalletConnect", "Binance Web3 Wallet", "Trust Wallet", "MetaMask"],
  account: null,
  chainId: 8453,
  isConnected: false,
}));
