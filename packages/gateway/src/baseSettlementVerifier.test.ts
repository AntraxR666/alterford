import { encodeAbiParameters, encodeEventTopics, erc20Abi, type Hex } from "viem";
import { describe, expect, it, vi } from "vitest";
import { ViemBaseSettlementVerifier } from "./baseSettlementVerifier.js";

const token = "0x2222222222222222222222222222222222222222" as const;
const destination = "0x1111111111111111111111111111111111111111" as const;
const transactionHash = `0x${"a".repeat(64)}` as const;

describe("ViemBaseSettlementVerifier", () => {
  it("accepts a confirmed settlement-token transfer to the user", async () => {
    const verifier = fixture();
    await expect(verifier.verify(transactionHash, destination, 100_000_000n)).resolves.toMatchObject({
      transactionHash,
      amountMinor: 100_000_000n,
      confirmations: 12,
    });
  });

  it("rejects wrong chain, token, recipient, amount, receipt, and confirmations", async () => {
    await expect(fixture({ chainId: 1 }).verify(transactionHash, destination, 1n)).rejects.toThrow("chain");
    await expect(fixture({ logAddress: destination }).verify(transactionHash, destination, 1n)).rejects.toThrow("transfer");
    await expect(fixture({ recipient: token }).verify(transactionHash, destination, 1n)).rejects.toThrow("transfer");
    await expect(fixture({ amount: 99n }).verify(transactionHash, destination, 100n)).rejects.toThrow("transfer");
    await expect(fixture({ status: "reverted" }).verify(transactionHash, destination, 1n)).rejects.toThrow("failed");
    await expect(fixture({ blockNumber: 110n }).verify(transactionHash, destination, 1n)).rejects.toThrow("confirmations");
  });
});

function fixture(overrides: {
  chainId?: number;
  logAddress?: typeof token | typeof destination;
  recipient?: typeof token | typeof destination;
  amount?: bigint;
  status?: "success" | "reverted";
  blockNumber?: bigint;
} = {}) {
  const recipient = overrides.recipient ?? destination;
  const amount = overrides.amount ?? 100_000_000n;
  const topics = encodeEventTopics({
    abi: erc20Abi,
    eventName: "Transfer",
    args: { from: token, to: recipient },
  });
  const client = {
    getChainId: vi.fn(async () => overrides.chainId ?? 8453),
    getBlockNumber: vi.fn(async () => 120n),
    getTransactionReceipt: vi.fn(async () => ({
      status: overrides.status ?? "success",
      blockNumber: overrides.blockNumber ?? 109n,
      logs: [{
        address: overrides.logAddress ?? token,
        topics: topics.filter((topic): topic is Hex => typeof topic === "string") as [Hex, ...Hex[]],
        data: encodeAbiParameters([{ type: "uint256" }], [amount]),
      }],
    })),
  };
  return new ViemBaseSettlementVerifier(client, {
    chainId: 8453,
    token,
    confirmations: 12,
    now: () => 1_000,
  });
}
