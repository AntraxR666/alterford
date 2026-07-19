import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  createPublicClient,
  createWalletClient,
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
const yesBettor = privateKeyToAccount(
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
);
const noBettor = privateKeyToAccount(
  "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
);

const deployment = JSON.parse(await readFile(resolve("deployments", "31337.json"), "utf8"));
const tokenAbi = await readAbi("MockSettlementToken");
const marketAbi = await readAbi("MarketFactory");
const token = deployment.contracts.settlementToken.address;
const marketFactory = deployment.contracts.marketFactory.address;

const publicClient = createPublicClient({ chain, transport: http(chain.rpcUrls.default.http[0]) });
const creatorWallet = createWalletClient({ account: creator, chain, transport: http(chain.rpcUrls.default.http[0]) });
const yesWallet = createWalletClient({ account: yesBettor, chain, transport: http(chain.rpcUrls.default.http[0]) });
const noWallet = createWalletClient({ account: noBettor, chain, transport: http(chain.rpcUrls.default.http[0]) });

const chainId = await publicClient.getChainId();
if (chainId !== 31337) throw new Error(`Expected Anvil chain 31337, got ${chainId}.`);

await tx(creatorWallet, token, tokenAbi, "mint", [creator.address, 500_000n]);
await tx(creatorWallet, token, tokenAbi, "mint", [yesBettor.address, 1_000_000n]);
await tx(creatorWallet, token, tokenAbi, "mint", [noBettor.address, 3_000_000n]);
await tx(creatorWallet, token, tokenAbi, "approve", [marketFactory, 500_000n]);

const block = await publicClient.getBlock();
const lockTime = (block.timestamp ?? BigInt(Math.floor(Date.now() / 1000))) + 60n;
const resolutionTime = lockTime + 60n;
const createHash = await creatorWallet.sendTransaction({
  to: marketFactory,
  data: encodeFunctionData({
    abi: marketAbi,
    functionName: "createMarket",
    args: [
      token,
      keccak256(toBytes(`alterford-demo-${Date.now()}`)),
      "ipfs://alterford/demo-local-flow",
      ["YES", "NO"],
      lockTime,
      resolutionTime,
      0,
      keccak256(toBytes("SPORTS")),
    ],
  }),
});
const createReceipt = await publicClient.waitForTransactionReceipt({ hash: createHash });
const marketId = await publicClient.readContract({
  address: marketFactory,
  abi: marketAbi,
  functionName: "nextMarketId",
});
const createdMarketId = marketId - 1n;

await tx(yesWallet, token, tokenAbi, "approve", [marketFactory, 1_000_000n]);
await tx(noWallet, token, tokenAbi, "approve", [marketFactory, 3_000_000n]);
await tx(yesWallet, marketFactory, marketAbi, "placeBet", [createdMarketId, 0, 1_000_000n]);
await tx(noWallet, marketFactory, marketAbi, "placeBet", [createdMarketId, 1, 3_000_000n]);

await publicClient.request({ method: "evm_increaseTime", params: [180] });
await publicClient.request({ method: "evm_mine", params: [] });

await tx(creatorWallet, marketFactory, marketAbi, "resolveMarket", [createdMarketId, 0]);
await tx(yesWallet, marketFactory, marketAbi, "claimReward", [createdMarketId]);

const yesBalance = await publicClient.readContract({
  address: token,
  abi: tokenAbi,
  functionName: "balanceOf",
  args: [yesBettor.address],
});

console.log(
  JSON.stringify(
    {
      marketId: createdMarketId.toString(),
      createTx: createReceipt.transactionHash,
      yesBettor: yesBettor.address,
      yesBalance: yesBalance.toString(),
      expectedWinnerBalance: "3910000",
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

async function readAbi(contractName) {
  return JSON.parse(await readFile(resolve("deployments", "abis", `${contractName}.json`), "utf8"));
}
