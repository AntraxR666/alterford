import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  createPublicClient,
  createWalletClient,
  decodeEventLog,
  encodeFunctionData,
  http,
  keccak256,
  toBytes,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

const chain = {
  id: 31337,
  name: "Anvil",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [process.env.RPC_URL || "http://127.0.0.1:8545"] } },
};

const creator = privateKeyToAccount(
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
);
const executor = privateKeyToAccount(
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
);

const deployment = JSON.parse(await readFile(resolve("deployments", "31337.json"), "utf8"));
const tokenAbi = await readAbi("MockSettlementToken");
const challengeAbi = await readAbi("ChallengeFactory");
const bondContextResolverAbi = await readAbi("CreationBondContextResolver");
const token = deployment.contracts.settlementToken.address;
const challengeFactory = deployment.contracts.challengeFactory.address;
const bondPolicy = deployment.contracts.creationBondPolicy.address;
const bondContextResolver = deployment.contracts.bondContextResolver.address;

const publicClient = createPublicClient({ chain, transport: http(chain.rpcUrls.default.http[0]) });
const creatorWallet = createWalletClient({ account: creator, chain, transport: http(chain.rpcUrls.default.http[0]) });
const executorWallet = createWalletClient({ account: executor, chain, transport: http(chain.rpcUrls.default.http[0]) });

const chainId = await publicClient.getChainId();
if (chainId !== 31337) throw new Error(`Expected Anvil chain 31337, got ${chainId}.`);

const rewardPool = 100_000_000n;
const categoryId = keccak256(toBytes("UNDERWORLD_CHALLENGE"));
const [creatorBond] = await publicClient.readContract({
  address: bondContextResolver,
  abi: bondContextResolverAbi,
  functionName: "previewBond",
  args: [bondPolicy, creator.address, 2, categoryId, rewardPool],
});
const executorBond = creatorBond;

const creatorBalanceBefore = await balanceOf(creator.address);
const executorBalanceBefore = await balanceOf(executor.address);
const factoryBalanceBefore = await balanceOf(challengeFactory);

await tx(creatorWallet, token, tokenAbi, "mint", [creator.address, rewardPool + creatorBond]);
await tx(creatorWallet, token, tokenAbi, "mint", [executor.address, executorBond]);
await tx(creatorWallet, token, tokenAbi, "approve", [challengeFactory, rewardPool + creatorBond]);
await tx(executorWallet, token, tokenAbi, "approve", [challengeFactory, executorBond]);

const block = await publicClient.getBlock();
const deadline = (block.timestamp ?? BigInt(Math.floor(Date.now() / 1000))) + 86_400n;
await tx(creatorWallet, challengeFactory, challengeAbi, "createChallenge", [
  token,
  rewardPool,
  keccak256(toBytes(`alterford-challenge-rules-${Date.now()}`)),
  "ipfs://alterford/demo-local-challenge",
  deadline,
  categoryId,
]);

const nextChallengeId = await publicClient.readContract({
  address: challengeFactory,
  abi: challengeAbi,
  functionName: "nextChallengeId",
});
const challengeId = nextChallengeId - 1n;

await tx(executorWallet, challengeFactory, challengeAbi, "acceptChallenge", [
  challengeId,
  "https://live.example/alterford-demo",
]);
await tx(executorWallet, challengeFactory, challengeAbi, "submitEvidence", [
  challengeId,
  keccak256(toBytes("demo-evidence")),
  "ipfs://alterford/demo-local-challenge/evidence",
  "https://live.example/alterford-demo",
]);
const resolveHash = await tx(creatorWallet, challengeFactory, challengeAbi, "resolveChallenge", [
  challengeId,
  true,
  false,
  false,
  keccak256(toBytes("fulfilled")),
]);
const resolveReceipt = await publicClient.getTransactionReceipt({ hash: resolveHash });
const resolvedEvent = resolveReceipt.logs
  .filter((log) => log.address.toLowerCase() === challengeFactory.toLowerCase())
  .map((log) => {
    try {
      return decodeEventLog({ abi: challengeAbi, data: log.data, topics: log.topics });
    } catch {
      return null;
    }
  })
  .find((event) => event?.eventName === "ChallengeResolved");
if (!resolvedEvent || resolvedEvent.eventName !== "ChallengeResolved") {
  throw new Error("ChallengeResolved event was not emitted.");
}
const { rewardPayout: executorPayout, adminFee, creatorFee } = resolvedEvent.args;
if (executorPayout + adminFee + creatorFee !== rewardPool) {
  throw new Error("Challenge settlement does not conserve the escrowed reward pool.");
}

const creatorBalance = await balanceOf(creator.address);
const executorBalance = await balanceOf(executor.address);
const factoryBalance = await balanceOf(challengeFactory);
const creatorDelta = creatorBalance - creatorBalanceBefore;
const executorDelta = executorBalance - executorBalanceBefore;
const factoryDelta = factoryBalance - factoryBalanceBefore;
const expectedCreatorDelta = creatorBond + adminFee + creatorFee;
const expectedExecutorDelta = executorBond + executorPayout;
const expectedFactoryDelta = 0n;

if (creatorDelta !== expectedCreatorDelta) {
  throw new Error(`Unexpected creator delta ${creatorDelta}; expected ${expectedCreatorDelta}.`);
}
if (executorDelta !== expectedExecutorDelta) {
  throw new Error(`Unexpected executor delta ${executorDelta}; expected ${expectedExecutorDelta}.`);
}
if (factoryDelta !== expectedFactoryDelta) {
  throw new Error(`Unexpected factory delta ${factoryDelta}; expected ${expectedFactoryDelta}.`);
}

console.log(
  JSON.stringify(
    {
      challengeId: challengeId.toString(),
      creator: creator.address,
      executor: executor.address,
      creatorDelta: creatorDelta.toString(),
      expectedCreatorDelta: expectedCreatorDelta.toString(),
      executorDelta: executorDelta.toString(),
      expectedExecutorDelta: expectedExecutorDelta.toString(),
      factoryDelta: factoryDelta.toString(),
      expectedFactoryDelta: expectedFactoryDelta.toString(),
    },
    null,
    2,
  ),
);

async function tx(wallet, to, abi, functionName, args) {
  const hash = await wallet.sendTransaction({
    to,
    data: encodeFunctionData({ abi, functionName, args }),
  });
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

async function balanceOf(address) {
  return publicClient.readContract({
    address: token,
    abi: tokenAbi,
    functionName: "balanceOf",
    args: [address],
  });
}

async function readAbi(contractName) {
  return JSON.parse(await readFile(resolve("deployments", "abis", `${contractName}.json`), "utf8"));
}
