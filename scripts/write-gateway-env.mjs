import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const chainId = process.env.CHAIN_ID || process.argv[2] || "84532";
const deployment = JSON.parse(await readFile(resolve("deployments", `${chainId}.json`), "utf8"));
const challengeFactory = deployment.contracts?.challengeFactory?.address;
const forwarder = deployment.contracts?.alterfordForwarder?.address;
if (!challengeFactory || !forwarder) {
  throw new Error(`deployments/${chainId}.json is missing ChallengeFactory or AlterfordForwarder.`);
}

const env = [
  `CHAIN_ID=${deployment.chainId}`,
  `RPC_URL=${deployment.rpcUrl}`,
  `CHALLENGE_FACTORY_ADDRESS=${challengeFactory}`,
  `ALTERFORD_FORWARDER_ADDRESS=${forwarder}`,
  `GATEWAY_ALLOWED_ORIGINS=${process.env.GATEWAY_ALLOWED_ORIGINS || "http://127.0.0.1:5173,http://localhost:5173"}`,
  `GATEWAY_LEDGER_PATH=${process.env.GATEWAY_LEDGER_PATH || "data/sponsorship-ledger.json"}`,
  `RELAY_REQUEST_TTL_SECONDS=${process.env.RELAY_REQUEST_TTL_SECONDS || "600"}`,
  `RELAY_MAX_CALLDATA_BYTES=${process.env.RELAY_MAX_CALLDATA_BYTES || "4096"}`,
  `RELAY_GLOBAL_DAILY_LIMIT=${process.env.RELAY_GLOBAL_DAILY_LIMIT || "10000"}`,
  `RELAY_WALLET_DAILY_LIMIT=${process.env.RELAY_WALLET_DAILY_LIMIT || "20"}`,
  `RELAY_IP_HOURLY_LIMIT=${process.env.RELAY_IP_HOURLY_LIMIT || "100"}`,
  `PORT=${process.env.GATEWAY_PORT || "8790"}`,
  "# Add GELATO_API_KEY and Transak credentials only in the server secret store.",
  "",
].join("\n");

await mkdir(resolve("deployments"), { recursive: true });
await writeFile(resolve("deployments", `${deployment.chainId}.gateway.env`), env);
console.log(`Wrote deployments/${deployment.chainId}.gateway.env (no secrets)`);
