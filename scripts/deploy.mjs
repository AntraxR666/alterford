import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const args = new Set(process.argv.slice(2));
const chainName = args.has("--chain") ? process.argv[process.argv.indexOf("--chain") + 1] : "local";

const chainConfig = {
  local: {
    id: 31337,
    name: "Anvil",
    rpcUrl: process.env.RPC_URL || "http://127.0.0.1:8545",
    privateKey:
      process.env.PRIVATE_KEY ||
      "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
  },
  "base-sepolia": {
    id: 84532,
    name: "Base Sepolia",
    rpcUrl: process.env.RPC_URL || process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org",
    accountName: process.env.FOUNDRY_ACCOUNT || process.env.ETH_KEYSTORE_ACCOUNT,
    passwordFile: process.env.FOUNDRY_PASSWORD_FILE || process.env.ETH_PASSWORD,
    deployerAddress: process.env.DEPLOYER_ADDRESS,
  },
}[chainName];

if (!chainConfig) {
  throw new Error(`Unknown chain "${chainName}". Use local or base-sepolia.`);
}

if (chainName === "base-sepolia") {
  await deployWithFoundryKeystore();
  process.exit();
}

if (!chainConfig.privateKey) {
  throw new Error("A local Anvil private key is required for this deployment target.");
}

const chain = {
  id: chainConfig.id,
  name: chainConfig.name,
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [chainConfig.rpcUrl] } },
};

const account = privateKeyToAccount(chainConfig.privateKey);
const publicClient = createPublicClient({ chain, transport: http(chainConfig.rpcUrl) });
const walletClient = createWalletClient({ account, chain, transport: http(chainConfig.rpcUrl) });

async function main() {
  const networkChainId = await publicClient.getChainId();
  if (networkChainId !== chainConfig.id) {
    throw new Error(`RPC chain mismatch. Expected ${chainConfig.id}, got ${networkChainId}.`);
  }

  const settlementToken = await deploy("MockSettlementToken");
  const creationBondPolicy = await deploy("CreationBondPolicy", [account.address]);
  const marketFactory = await deploy("MarketFactory", [account.address, creationBondPolicy.address]);
  const bountyFactory = await deploy("BountyFactory", [account.address, creationBondPolicy.address]);
  const challengeFactory = await deploy("ChallengeFactory", [account.address, creationBondPolicy.address]);

  const deployment = {
    chainId: chainConfig.id,
    chainName: chainConfig.name,
    rpcUrl: chainConfig.rpcUrl,
    deployer: account.address,
    deployedAt: new Date().toISOString(),
    startBlock: minBlockNumber([
      settlementToken,
      creationBondPolicy,
      marketFactory,
      bountyFactory,
      challengeFactory,
    ]),
    contracts: {
      settlementToken,
      creationBondPolicy,
      marketFactory,
      bountyFactory,
      challengeFactory,
    },
  };

  await mkdir(resolve("deployments"), { recursive: true });
  await writeFile(
    resolve("deployments", `${chainConfig.id}.json`),
    `${JSON.stringify(deployment, null, 2)}\n`,
  );

  console.log(`Alterford deployed to ${chainConfig.name} (${chainConfig.id})`);
  console.log(JSON.stringify(deployment.contracts, null, 2));
}

async function deploy(contractName, constructorArgs = []) {
  const artifact = await readArtifact(contractName);
  const hash = await walletClient.deployContract({
    abi: artifact.abi,
    bytecode: artifact.bytecode.object ?? artifact.bytecode,
    args: constructorArgs,
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (!receipt.contractAddress) {
    throw new Error(`${contractName} deployment did not return a contract address.`);
  }
  return {
    address: receipt.contractAddress,
    txHash: hash,
    blockNumber: Number(receipt.blockNumber),
    artifact: `${contractName}.sol/${contractName}.json`,
  };
}

async function readArtifact(contractName) {
  const artifactPath = resolve(
    "packages",
    "contracts",
    "out",
    `${contractName}.sol`,
    `${contractName}.json`,
  );
  return JSON.parse(await readFile(artifactPath, "utf8"));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function deployWithFoundryKeystore() {
  if (!chainConfig.accountName) {
    throw new Error("FOUNDRY_ACCOUNT or ETH_KEYSTORE_ACCOUNT is required for Base Sepolia deploy.");
  }
  if (!chainConfig.passwordFile && process.env.ALLOW_INTERACTIVE_KEYSTORE !== "1") {
    throw new Error(
      "FOUNDRY_PASSWORD_FILE or ETH_PASSWORD is required for non-interactive keystore deploy. Set ALLOW_INTERACTIVE_KEYSTORE=1 to allow Foundry to prompt.",
    );
  }

  const networkChainId = await createPublicClient({
    chain: {
      id: chainConfig.id,
      name: chainConfig.name,
      nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
      rpcUrls: { default: { http: [chainConfig.rpcUrl] } },
    },
    transport: http(chainConfig.rpcUrl),
  }).getChainId();
  if (networkChainId !== chainConfig.id) {
    throw new Error(`RPC chain mismatch. Expected ${chainConfig.id}, got ${networkChainId}.`);
  }

  const deployer = chainConfig.deployerAddress || getKeystoreAddress(chainConfig);
  const forgeArgs = [
    "script",
    "script/DeployAlterford.s.sol:DeployAlterford",
    "--sig",
    "run(address)",
    deployer,
    "--rpc-url",
    chainConfig.rpcUrl,
    "--chain-id",
    String(chainConfig.id),
    "--broadcast",
    "--slow",
    "--account",
    chainConfig.accountName,
  ];
  if (chainConfig.passwordFile) {
    forgeArgs.push("--password-file", normalizeFoundryPath(chainConfig.passwordFile));
  }

  runFoundry("forge", forgeArgs, { stdio: "inherit", cwd: resolve("packages/contracts") });
  const client = createPublicClient({
    chain: {
      id: chainConfig.id,
      name: chainConfig.name,
      nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
      rpcUrls: { default: { http: [chainConfig.rpcUrl] } },
    },
    transport: http(chainConfig.rpcUrl),
  });
  const contracts = await readFoundryBroadcast(chainConfig.id, client);
  const deployment = {
    chainId: chainConfig.id,
    chainName: chainConfig.name,
    rpcUrl: chainConfig.rpcUrl,
    deployer,
    deployedAt: new Date().toISOString(),
    startBlock: minBlockNumber(Object.values(contracts)),
    contracts,
  };

  await mkdir(resolve("deployments"), { recursive: true });
  await writeFile(
    resolve("deployments", `${chainConfig.id}.json`),
    `${JSON.stringify(deployment, null, 2)}\n`,
  );

  console.log(`Alterford deployed to ${chainConfig.name} (${chainConfig.id})`);
  console.log(JSON.stringify(deployment.contracts, null, 2));
}

function getKeystoreAddress(config) {
  const args = ["wallet", "address", "--account", config.accountName];
  if (config.passwordFile) args.push("--password-file", normalizeFoundryPath(config.passwordFile));
  const result = runFoundry("cast", args, { stdio: "pipe", cwd: resolve(".") });
  return result.stdout.trim();
}

async function readFoundryBroadcast(chainId, client) {
  const broadcast = JSON.parse(
    await readFile(
      resolve("packages", "contracts", "broadcast", "DeployAlterford.s.sol", String(chainId), "run-latest.json"),
      "utf8",
    ),
  );
  const byName = new Map();
  for (const tx of broadcast.transactions ?? []) {
    if (tx.contractName && tx.contractAddress) byName.set(tx.contractName, tx);
  }
  const required = [
    ["settlementToken", "MockSettlementToken"],
    ["creationBondPolicy", "CreationBondPolicy"],
    ["marketFactory", "MarketFactory"],
    ["bountyFactory", "BountyFactory"],
    ["challengeFactory", "ChallengeFactory"],
  ];
  return Object.fromEntries(
    await Promise.all(required.map(async ([key, contractName]) => {
      const tx = byName.get(contractName);
      if (!tx) throw new Error(`Missing ${contractName} in Foundry broadcast output.`);
      const txHash = tx.hash ?? tx.transactionHash;
      const receipt = await client.getTransactionReceipt({ hash: txHash });
      return [
        key,
        {
          address: tx.contractAddress,
          txHash,
          blockNumber: Number(receipt.blockNumber),
          artifact: `${contractName}.sol/${contractName}.json`,
        },
      ];
    })),
  );
}

function minBlockNumber(contracts) {
  const blockNumbers = contracts
    .map((contract) => contract.blockNumber)
    .filter((blockNumber) => Number.isInteger(blockNumber));
  return blockNumbers.length > 0 ? Math.min(...blockNumbers) : undefined;
}

function runFoundry(command, args, options) {
  const native = spawnSync(command, ["--version"], { encoding: "utf8" });
  if (!native.error && native.status === 0) {
    const result = spawnSync(command, args, { encoding: "utf8", ...options });
    if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed.`);
    return result;
  }

  if (process.platform === "win32") {
    const cwd = toWslPath(options.cwd ?? resolve("."));
    const executable = command === "forge" ? "~/.foundry/bin/forge" : "~/.foundry/bin/cast";
    const shellCommand = [
      `cd ${shellQuote(cwd)}`,
      `${executable} ${args.map(shellQuote).join(" ")}`,
    ].join(" && ");
    const result = spawnSync("wsl", ["bash", "-lc", shellCommand], {
      encoding: "utf8",
      stdio: options.stdio,
    });
    if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed.`);
    return result;
  }

  throw native.error ?? new Error(`${command} is not available.`);
}

function toWslPath(path) {
  const result = spawnSync("wsl", ["wslpath", "-a", path], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(`Failed to convert path for WSL: ${path}`);
  return result.stdout.trim();
}

function normalizeFoundryPath(path) {
  if (process.platform !== "win32") return path;
  if (!/^[a-zA-Z]:[\\/]/.test(path)) return path;
  return toWslPath(resolve(path));
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}
