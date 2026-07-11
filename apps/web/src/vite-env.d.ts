/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_WALLETCONNECT_PROJECT_ID?: string;
  readonly VITE_BASE_SEPOLIA_RPC_URL?: string;
  readonly VITE_LOCAL_RPC_URL?: string;
  readonly VITE_CHAIN_ID?: string;
  readonly VITE_SETTLEMENT_TOKEN_ADDRESS?: `0x${string}`;
  readonly VITE_CREATION_BOND_POLICY_ADDRESS?: `0x${string}`;
  readonly VITE_MARKET_FACTORY_ADDRESS?: `0x${string}`;
  readonly VITE_BOUNTY_FACTORY_ADDRESS?: `0x${string}`;
  readonly VITE_CHALLENGE_FACTORY_ADDRESS?: `0x${string}`;
  readonly VITE_INDEXER_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
