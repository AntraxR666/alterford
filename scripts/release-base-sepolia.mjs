import { spawnSync } from "node:child_process";

const steps = [
  ["preflight", "pnpm", ["deploy:base-sepolia:preflight"]],
  ["deploy", "pnpm", ["deploy:base-sepolia"]],
  ["export-abis", "pnpm", ["contracts:export-abis"]],
  ["web-env", "pnpm", ["web:env", "84532"]],
  ["web-env-check", "pnpm", ["web:env:check", "84532"]],
  ["indexer-env", "pnpm", ["indexer:env", "84532"]],
];

if (process.env.BASESCAN_API_KEY || process.env.ETHERSCAN_API_KEY) {
  steps.push(["verify", "pnpm", ["deploy:base-sepolia:verify"]]);
} else if (process.env.SKIP_VERIFY === "1") {
  console.log("Skipping verification: BASESCAN_API_KEY or ETHERSCAN_API_KEY is not set.");
} else {
  console.error("BASESCAN_API_KEY or ETHERSCAN_API_KEY is required. Set SKIP_VERIFY=1 to deploy without verification.");
  process.exit(1);
}

for (const [name, command, args] of steps) {
  console.log(`\n==> ${name}`);
  const result = runStep(command, args);
  if (result.error) {
    console.error(result.error.message);
  }
  if (result.status !== 0) {
    console.error(`Release step failed: ${name}`);
    process.exit(result.status ?? 1);
  }
}

console.log("\nBase Sepolia release artifacts are ready.");

function runStep(command, args) {
  if (command === "pnpm" && process.env.npm_execpath) {
    return spawnSync(process.execPath, [process.env.npm_execpath, ...args], { stdio: "inherit" });
  }

  const executable = process.platform === "win32" && command === "pnpm" ? "pnpm.cmd" : command;
  return spawnSync(executable, args, { stdio: "inherit" });
}
