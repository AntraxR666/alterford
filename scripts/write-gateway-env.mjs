import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const chainId = process.env.CHAIN_ID || process.argv[2] || "84532";
const deployment = JSON.parse(await readFile(resolve("deployments", `${chainId}.json`), "utf8"));
const marketFactory = deployment.contracts?.marketFactory?.address;
const bountyFactory = deployment.contracts?.bountyFactory?.address;
const challengeFactory = deployment.contracts?.challengeFactory?.address;
const forwarder = deployment.contracts?.alterfordForwarder?.address;
if (!marketFactory || !bountyFactory || !challengeFactory || !forwarder) {
  throw new Error(`deployments/${chainId}.json is missing a factory or AlterfordForwarder.`);
}

const env = [
  `CHAIN_ID=${deployment.chainId}`,
  `RPC_URL=${deployment.rpcUrl}`,
  `MARKET_FACTORY_ADDRESS=${marketFactory}`,
  `BOUNTY_FACTORY_ADDRESS=${bountyFactory}`,
  `CHALLENGE_FACTORY_ADDRESS=${challengeFactory}`,
  `ALTERFORD_FORWARDER_ADDRESS=${forwarder}`,
  `RELAY_PROVIDER=${process.env.RELAY_PROVIDER || (String(deployment.chainId) === "84532" ? "biconomy" : "disabled")}`,
  `GATEWAY_ALLOWED_ORIGINS=${process.env.GATEWAY_ALLOWED_ORIGINS || "http://127.0.0.1:5173,http://localhost:5173"}`,
  `GATEWAY_LEDGER_PATH=${process.env.GATEWAY_LEDGER_PATH || "data/sponsorship-ledger.json"}`,
  `MONERO_NETWORK=${process.env.MONERO_NETWORK || "stagenet"}`,
  `MONERO_LEDGER_PATH=${process.env.MONERO_LEDGER_PATH || "data/monero-ledger.json"}`,
  `MONERO_MIN_CONFIRMATIONS=${process.env.MONERO_MIN_CONFIRMATIONS || "10"}`,
  `MONERO_SYNC_INTERVAL_MS=${process.env.MONERO_SYNC_INTERVAL_MS || "30000"}`,
  `MONERO_WITHDRAWALS_ENABLED=${process.env.MONERO_WITHDRAWALS_ENABLED || "false"}`,
  `RELAY_REQUEST_TTL_SECONDS=${process.env.RELAY_REQUEST_TTL_SECONDS || "600"}`,
  `RELAY_MAX_CALLDATA_BYTES=${process.env.RELAY_MAX_CALLDATA_BYTES || "4096"}`,
  `RELAY_GLOBAL_DAILY_LIMIT=${process.env.RELAY_GLOBAL_DAILY_LIMIT || "10000"}`,
  `RELAY_WALLET_DAILY_LIMIT=${process.env.RELAY_WALLET_DAILY_LIMIT || "20"}`,
  `RELAY_IP_HOURLY_LIMIT=${process.env.RELAY_IP_HOURLY_LIMIT || "100"}`,
  `PORT=${process.env.GATEWAY_PORT || "8790"}`,
  "# Biconomy staging needs no API key on Base Sepolia.",
  "# XMR remains disabled until MONERO_RPC_URL, MONERO_GATEWAY_ID and MONERO_SYNC_TOKEN are added to the server secret store.",
  "# Fiat providers are optional and are never required for the permissionless crypto flow.",
  "",
].join("\n");

await mkdir(resolve("deployments"), { recursive: true });
await writeFile(resolve("deployments", `${deployment.chainId}.gateway.env`), env);
console.log(`Wrote deployments/${deployment.chainId}.gateway.env (no secrets)`);
