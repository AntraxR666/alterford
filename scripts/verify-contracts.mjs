import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { encodeAbiParameters } from "viem";

const chainId = readArg("--chain-id") || process.env.CHAIN_ID || "84532";
const apiKey = process.env.BASESCAN_API_KEY || process.env.ETHERSCAN_API_KEY;

if (!apiKey) {
  console.log("BASESCAN_API_KEY or ETHERSCAN_API_KEY is required for contract verification.");
  process.exitCode = 1;
  process.exit();
}

const deployment = JSON.parse(await readFile(resolve("deployments", `${chainId}.json`), "utf8"));
const deployer = deployment.deployer;
const contracts = deployment.contracts;
const verifications = [
  {
    name: "MockSettlementToken",
    address: contracts.settlementToken.address,
    target: "src/token/MockSettlementToken.sol:MockSettlementToken",
    constructorArgs: "0x",
  },
  {
    name: "CreationBondPolicy",
    address: contracts.creationBondPolicy.address,
    target: "src/bonds/CreationBondPolicy.sol:CreationBondPolicy",
    constructorArgs: encodeAbiParameters([{ type: "address" }], [deployer]),
  },
  {
    name: "MarketFactory",
    address: contracts.marketFactory.address,
    target: "src/factories/MarketFactory.sol:MarketFactory",
    constructorArgs: encodeAbiParameters(
      [{ type: "address" }, { type: "address" }],
      [deployer, contracts.creationBondPolicy.address],
    ),
  },
  {
    name: "BountyFactory",
    address: contracts.bountyFactory.address,
    target: "src/factories/BountyFactory.sol:BountyFactory",
    constructorArgs: encodeAbiParameters(
      [{ type: "address" }, { type: "address" }],
      [deployer, contracts.creationBondPolicy.address],
    ),
  },
  {
    name: "ChallengeFactory",
    address: contracts.challengeFactory.address,
    target: "src/factories/ChallengeFactory.sol:ChallengeFactory",
    constructorArgs: encodeAbiParameters(
      [{ type: "address" }, { type: "address" }],
      [deployer, contracts.creationBondPolicy.address],
    ),
  },
];

let failures = 0;
for (const item of verifications) {
  const args = [
    "verify-contract",
    item.address,
    item.target,
    "--chain-id",
    chainId,
    "--etherscan-api-key",
    apiKey,
    "--constructor-args",
    item.constructorArgs,
    "--watch",
  ];
  const result = runForge(args);
  console.log(JSON.stringify({ contract: item.name, status: result.status === 0 ? "verified" : "failed" }));
  if (result.status !== 0) failures += 1;
}

process.exitCode = failures === 0 ? 0 : 1;

function runForge(args) {
  const native = spawnSync("forge", ["--version"], { encoding: "utf8" });
  if (!native.error && native.status === 0) {
    return spawnSync("forge", args, {
      cwd: resolve("packages/contracts"),
      stdio: "inherit",
    });
  }

  if (process.platform === "win32") {
    const contractsPath = toWslPath(resolve("packages/contracts"));
    if (contractsPath) {
      const command = [
        `cd ${shellQuote(contractsPath)}`,
        `~/.foundry/bin/forge ${args.map(shellQuote).join(" ")}`,
      ].join(" && ");
      return spawnSync("wsl", ["bash", "-lc", command], { stdio: "inherit" });
    }
  }

  return native;
}

function readArg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function toWslPath(path) {
  const result = spawnSync("wsl", ["wslpath", "-a", path], { encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : null;
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}
