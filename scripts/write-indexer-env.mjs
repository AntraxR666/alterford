import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const chainId = process.env.CHAIN_ID || process.argv[2] || "31337";
const deployment = JSON.parse(await readFile(resolve("deployments", `${chainId}.json`), "utf8"));
const marketFactory = deployment.contracts?.marketFactory?.address;
const challengeFactory = deployment.contracts?.challengeFactory?.address;
const bountyFactory = deployment.contracts?.bountyFactory?.address;
const bountyRecoveryVault = deployment.contracts?.bountyRecoveryVault?.address;

if (!marketFactory) {
  throw new Error(`deployments/${chainId}.json is missing contracts.marketFactory.address`);
}

const confirmations = deployment.chainId === 31337 ? "0" : process.env.CONFIRMATIONS || "6";
const startBlock = process.env.START_BLOCK || deployment.startBlock;
const defaultStoreName = startBlock
  ? `data/alterford-${deployment.chainId}-${startBlock}.json`
  : `data/alterford-${deployment.chainId}.json`;
const storePath = process.env.INDEXER_STORE || defaultStoreName;
const maxLogBlockRange = process.env.MAX_LOG_BLOCK_RANGE || deployment.maxLogBlockRange || "2000";
const env = [
  `CHAIN_ID=${deployment.chainId}`,
  `RPC_URL=${deployment.rpcUrl}`,
  `MARKET_FACTORY_ADDRESS=${marketFactory}`,
  ...(bountyFactory ? [`BOUNTY_FACTORY_ADDRESS=${bountyFactory}`] : []),
  ...(challengeFactory ? [`CHALLENGE_FACTORY_ADDRESS=${challengeFactory}`] : []),
  ...(bountyRecoveryVault
    ? [`BOUNTY_RECOVERY_VAULT_ADDRESS=${bountyRecoveryVault}`]
    : []),
  `INDEXER_STORE=${storePath}`,
  `CONFIRMATIONS=${confirmations}`,
  ...(startBlock ? [`START_BLOCK=${startBlock}`] : []),
  `MAX_LOG_BLOCK_RANGE=${maxLogBlockRange}`,
  `PORT=${process.env.PORT || "8787"}`,
  `POLL_INTERVAL_MS=${process.env.POLL_INTERVAL_MS || "12000"}`,
  "",
].join("\n");

await mkdir(resolve("deployments"), { recursive: true });
await writeFile(resolve("deployments", `${deployment.chainId}.indexer.env`), env);
console.log(`Wrote deployments/${deployment.chainId}.indexer.env`);
