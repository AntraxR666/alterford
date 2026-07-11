import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { isAddress } from "viem";

const chainId = process.env.CHAIN_ID || process.argv[2] || "84532";
const envPath = resolve("apps", "web", ".env.local");
const env = parseEnv(await readFile(envPath, "utf8"));
const expected = JSON.parse(await readFile(resolve("deployments", `${chainId}.json`), "utf8"));

const checks = [
  ["VITE_CHAIN_ID", env.VITE_CHAIN_ID === String(expected.chainId)],
  ["VITE_SETTLEMENT_TOKEN_ADDRESS", isAddress(env.VITE_SETTLEMENT_TOKEN_ADDRESS ?? "")],
  ["VITE_CREATION_BOND_POLICY_ADDRESS", isAddress(env.VITE_CREATION_BOND_POLICY_ADDRESS ?? "")],
  ["VITE_MARKET_FACTORY_ADDRESS", isAddress(env.VITE_MARKET_FACTORY_ADDRESS ?? "")],
  ["VITE_BOUNTY_FACTORY_ADDRESS", isAddress(env.VITE_BOUNTY_FACTORY_ADDRESS ?? "")],
  ["VITE_CHALLENGE_FACTORY_ADDRESS", isAddress(env.VITE_CHALLENGE_FACTORY_ADDRESS ?? "")],
  ["VITE_INDEXER_URL", Boolean(env.VITE_INDEXER_URL)],
];

const requiresWalletConnectProjectId = expected.chainId !== 31337;
checks.push([
  "VITE_WALLETCONNECT_PROJECT_ID",
  !requiresWalletConnectProjectId || Boolean(process.env.VITE_WALLETCONNECT_PROJECT_ID || env.VITE_WALLETCONNECT_PROJECT_ID),
]);

const failed = checks.filter(([, ok]) => !ok).map(([name]) => name);
console.log(JSON.stringify({ chainId: expected.chainId, ok: failed.length === 0, failed }, null, 2));
process.exitCode = failed.length === 0 ? 0 : 1;

function parseEnv(value) {
  return Object.fromEntries(
    value
      .split(/\r?\n/)
      .filter((line) => line && !line.trimStart().startsWith("#"))
      .map((line) => {
        const index = line.indexOf("=");
        return [line.slice(0, index), line.slice(index + 1)];
      }),
  );
}
