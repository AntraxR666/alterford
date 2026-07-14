import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const chainId = process.env.CHAIN_ID || process.argv[2] || "31337";
const deployment = JSON.parse(await readFile(resolve("deployments", `${chainId}.json`), "utf8"));
const contracts = deployment.contracts;

const env = [
  `VITE_CHAIN_ID=${deployment.chainId}`,
  `VITE_LOCAL_RPC_URL=${deployment.chainId === 31337 ? deployment.rpcUrl : ""}`,
  `VITE_BASE_SEPOLIA_RPC_URL=${deployment.chainId === 84532 ? deployment.rpcUrl : "https://sepolia.base.org"}`,
  `VITE_WALLETCONNECT_PROJECT_ID=${process.env.VITE_WALLETCONNECT_PROJECT_ID || ""}`,
  `VITE_APP_URL=${process.env.VITE_APP_URL || (deployment.chainId === 31337 ? "http://127.0.0.1:5173" : "")}`,
  `VITE_SETTLEMENT_TOKEN_ADDRESS=${contracts.settlementToken.address}`,
  `VITE_CREATION_BOND_POLICY_ADDRESS=${contracts.creationBondPolicy.address}`,
  `VITE_MARKET_FACTORY_ADDRESS=${contracts.marketFactory.address}`,
  `VITE_BOUNTY_FACTORY_ADDRESS=${contracts.bountyFactory.address}`,
  `VITE_CHALLENGE_FACTORY_ADDRESS=${contracts.challengeFactory.address}`,
  ...(contracts.bountyRecoveryVault
    ? [`VITE_BOUNTY_RECOVERY_VAULT_ADDRESS=${contracts.bountyRecoveryVault.address}`]
    : []),
  `VITE_INDEXER_URL=${process.env.VITE_INDEXER_URL || "http://127.0.0.1:8787"}`,
  "",
].join("\n");

await writeFile(resolve("apps", "web", ".env.local"), env);
console.log(`Wrote apps/web/.env.local for chain ${deployment.chainId}`);
