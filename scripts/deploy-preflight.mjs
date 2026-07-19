import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { createPublicClient, formatEther, http, isAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { redactedRpcUrl } from "./deploy-config.mjs";

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
    settlementTokenAddress: process.env.SETTLEMENT_TOKEN_ADDRESS,
    creationBondPolicyAddress: process.env.CREATION_BOND_POLICY_ADDRESS,
    securityCouncil: process.env.SECURITY_COUNCIL_ADDRESS,
    coldWallet: process.env.COLD_WALLET_ADDRESS,
  },
}[chainName];

if (!chainConfig) {
  throw new Error(`Unknown chain "${chainName}". Use local or base-sepolia.`);
}

const checks = [];
let failed = false;

function record(name, ok, details = {}) {
  checks.push({ name, ok, ...details });
  if (!ok) failed = true;
}

let account;
const existingDeployment = await readOptionalJson(resolve("deployments", `${chainConfig.id}.json`));
const settlementTokenAddress =
  chainConfig.settlementTokenAddress || existingDeployment?.contracts?.settlementToken?.address;
const creationBondPolicyAddress =
  chainConfig.creationBondPolicyAddress || existingDeployment?.contracts?.creationBondPolicy?.address;
const securityCouncil = chainConfig.securityCouncil || existingDeployment?.securityCouncil;
const coldWallet = chainConfig.coldWallet || existingDeployment?.coldWallet;
if (chainName === "base-sepolia") {
  record("foundry_account_present", Boolean(chainConfig.accountName), { required: true });
  record("keystore_password_file_present", Boolean(chainConfig.passwordFile) || process.env.ALLOW_INTERACTIVE_KEYSTORE === "1", {
    required: process.env.ALLOW_INTERACTIVE_KEYSTORE !== "1",
  });
  if (chainConfig.accountName && (chainConfig.passwordFile || process.env.ALLOW_INTERACTIVE_KEYSTORE === "1")) {
    try {
      account = { address: getKeystoreAddress(chainConfig) };
      record("foundry_account_valid", isAddress(account.address), { address: account.address });
    } catch (error) {
      record("foundry_account_valid", false, { error: errorMessage(error) });
    }
  }
  record("security_council_valid", isAddress(securityCouncil ?? ""), {
    address: securityCouncil,
  });
  record("cold_wallet_valid", isAddress(coldWallet ?? ""), {
    address: coldWallet,
  });
  record(
    "security_council_is_not_cold_wallet",
    isAddress(securityCouncil ?? "")
      && isAddress(coldWallet ?? "")
      && securityCouncil.toLowerCase() !== coldWallet.toLowerCase(),
  );
  record("settlement_token_reuse_address", isAddress(settlementTokenAddress ?? ""), {
    address: settlementTokenAddress,
  });
  record("bond_policy_reuse_address", isAddress(creationBondPolicyAddress ?? ""), {
    address: creationBondPolicyAddress,
  });
} else {
  record("private_key_present", Boolean(chainConfig.privateKey), { required: false });
  try {
    account = privateKeyToAccount(chainConfig.privateKey);
    record("private_key_valid", true, { address: account.address });
  } catch (error) {
    record("private_key_valid", false, { error: errorMessage(error) });
  }
}

for (const artifact of [
  "MockSettlementToken",
  "CreationBondPolicy",
  "CreationBondContextResolver",
  "AlterfordForwarder",
  "MarketFactory",
  "BountyFactory",
  "ChallengeFactory",
  "BountyRecoveryVault",
]) {
  try {
    const compiled = await readArtifact(artifact);
    record(`artifact_${artifact}`, Boolean(compiled.abi?.length && compiled.bytecode), {
      path: `${artifact}.sol/${artifact}.json`,
    });
  } catch (error) {
    record(`artifact_${artifact}`, false, { error: errorMessage(error) });
  }
}

try {
  const chain = {
    id: chainConfig.id,
    name: chainConfig.name,
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [chainConfig.rpcUrl] } },
  };
  const publicClient = createPublicClient({ chain, transport: http(chainConfig.rpcUrl) });
  const rpcChainId = await publicClient.getChainId();
  record("rpc_chain_id", rpcChainId === chainConfig.id, {
    expected: chainConfig.id,
    actual: rpcChainId,
    rpcUrl: redactedRpcUrl(chainConfig.rpcUrl),
  });

  if (account) {
    const balance = await publicClient.getBalance({ address: account.address });
    record("deployer_balance", balance > 0n, {
      address: account.address,
      balanceEth: formatEther(balance),
    });
  }
  if (chainName === "base-sepolia" && isAddress(settlementTokenAddress ?? "")) {
    const code = await publicClient.getBytecode({ address: settlementTokenAddress });
    record("settlement_token_has_code", Boolean(code && code !== "0x"), {
      address: settlementTokenAddress,
    });
  }
  if (chainName === "base-sepolia" && isAddress(creationBondPolicyAddress ?? "")) {
    const code = await publicClient.getBytecode({ address: creationBondPolicyAddress });
    record("bond_policy_has_code", Boolean(code && code !== "0x"), {
      address: creationBondPolicyAddress,
    });
  }
} catch (error) {
  record("rpc_reachable", false, {
    rpcUrl: redactedRpcUrl(chainConfig.rpcUrl),
    error: errorMessage(error),
  });
}

if (existingDeployment) {
  const coreAddresses = [
    existingDeployment.contracts?.settlementToken?.address,
    existingDeployment.contracts?.creationBondPolicy?.address,
    existingDeployment.contracts?.marketFactory?.address,
  ];
  record("existing_deployment_shape", coreAddresses.every((address) => isAddress(address ?? "")), {
    path: `deployments/${chainConfig.id}.json`,
  });
} else {
  record("existing_deployment_shape", true, { path: `deployments/${chainConfig.id}.json`, status: "not_found" });
}

console.log(JSON.stringify({ chain: chainConfig.name, chainId: chainConfig.id, ok: !failed, checks }, null, 2));
process.exitCode = failed ? 1 : 0;

async function readArtifact(contractName) {
  return JSON.parse(
    await readFile(
      resolve("packages", "contracts", "out", `${contractName}.sol`, `${contractName}.json`),
      "utf8",
    ),
  );
}

async function readOptionalJson(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return null;
  }
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function getKeystoreAddress(config) {
  const args = ["wallet", "address", "--account", config.accountName];
  if (config.passwordFile) args.push("--password-file", normalizeFoundryPath(config.passwordFile));
  const result = runFoundry("cast", args, { stdio: "pipe", cwd: resolve(".") });
  return result.stdout.trim();
}

function runFoundry(command, args, options) {
  const native = spawnSync(command, ["--version"], { encoding: "utf8" });
  if (!native.error && native.status === 0) {
    const result = spawnSync(command, args, { encoding: "utf8", ...options });
    if (result.status !== 0) throw new Error(result.stderr || `${command} failed`);
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
    if (result.status !== 0) throw new Error(result.stderr || `${command} failed`);
    return result;
  }

  throw native.error ?? new Error(`${command} is not available.`);
}

function normalizeFoundryPath(path) {
  if (process.platform !== "win32") return path;
  if (!/^[a-zA-Z]:[\\/]/.test(path)) return path;
  return toWslPath(resolve(path));
}

function toWslPath(path) {
  const result = spawnSync("wsl", ["wslpath", "-a", path], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(`Failed to convert path for WSL: ${path}`);
  return result.stdout.trim();
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}
