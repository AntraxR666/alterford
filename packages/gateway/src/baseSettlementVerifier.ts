import {
  decodeEventLog,
  erc20Abi,
  getAddress,
  type Address,
  type Hex,
} from "viem";
import type { XmrVerifiedSettlement } from "./xmrConversion.js";

interface SettlementClient {
  getChainId(): Promise<number>;
  getBlockNumber(): Promise<bigint>;
  getTransactionReceipt(input: { hash: Hex }): Promise<{
    status: "success" | "reverted";
    blockNumber: bigint;
    logs: Array<{ address: Address; topics: [Hex, ...Hex[]]; data: Hex }>;
  }>;
}

interface SettlementVerifierOptions {
  chainId: number;
  token: Address;
  confirmations: number;
  now?: () => number;
}

export class ViemBaseSettlementVerifier {
  private readonly now: () => number;

  constructor(
    private readonly client: SettlementClient,
    private readonly options: SettlementVerifierOptions,
  ) {
    this.now = options.now ?? (() => Math.floor(Date.now() / 1_000));
  }

  async verify(
    transactionHash: Hex,
    destination: Address,
    minimumAmountMinor: bigint,
  ): Promise<XmrVerifiedSettlement> {
    if (await this.client.getChainId() !== this.options.chainId) {
      throw new Error("Base settlement verifier is connected to the wrong chain.");
    }
    const receipt = await this.client.getTransactionReceipt({ hash: transactionHash });
    if (receipt.status !== "success") throw new Error("Base settlement transaction failed.");
    const currentBlock = await this.client.getBlockNumber();
    const confirmations = Number(currentBlock - receipt.blockNumber + 1n);
    if (confirmations < this.options.confirmations) {
      throw new Error("Base settlement has insufficient confirmations.");
    }
    const expectedToken = getAddress(this.options.token);
    const expectedDestination = getAddress(destination);
    let amountMinor = 0n;
    for (const log of receipt.logs) {
      if (log.address.toLowerCase() !== expectedToken.toLowerCase()) continue;
      try {
        const decoded = decodeEventLog({
          abi: erc20Abi,
          eventName: "Transfer",
          data: log.data,
          topics: log.topics,
          strict: true,
        });
        if (decoded.args.to?.toLowerCase() === expectedDestination.toLowerCase()) {
          amountMinor += decoded.args.value ?? 0n;
        }
      } catch {
        continue;
      }
    }
    if (amountMinor < minimumAmountMinor) {
      throw new Error("Base transaction does not contain the required settlement-token transfer.");
    }
    return {
      transactionHash,
      amountMinor,
      confirmations,
      verifiedAt: this.now(),
    };
  }
}
