import { createGelatoEvmRelayerClient } from "@gelatocloud/gasless";
import {
  alterfordForwarderAbi,
  type SignedForwardRequest,
} from "@alterford/sdk";
import type { Address, Hex } from "viem";
import type { GatewayChain, RelayProvider } from "./service.js";

interface GelatoClientLike {
  sendTransaction(parameters: {
    chainId: number;
    to: Address;
    data: Hex;
    gas?: bigint;
  }): Promise<Hex>;
  getStatus(parameters: { id: string }): Promise<{
    status: number;
    hash?: Hex;
    receipt?: unknown;
  }>;
}

interface PublicClientLike {
  readContract(parameters: Record<string, unknown>): Promise<unknown>;
  simulateContract(parameters: Record<string, unknown>): Promise<unknown>;
}

export class GelatoRelayAdapter implements RelayProvider {
  constructor(private readonly client: GelatoClientLike) {}

  async submit(transaction: { chainId: number; to: Address; data: Hex }) {
    const taskId = await this.client.sendTransaction({ ...transaction, gas: 2_000_000n });
    return { taskId };
  }

  async status(taskId: string) {
    const result = await this.client.getStatus({ id: taskId });
    if (result.status === 200) {
      return {
        state: "confirmed" as const,
        transactionHash: transactionHashFrom(result.receipt),
      };
    }
    if (result.status >= 400) return { state: "failed" as const };
    return { state: "pending" as const, transactionHash: result.hash };
  }
}

export function createGelatoRelayAdapter(apiKey: string, testnet: boolean) {
  if (!apiKey) throw new Error("GELATO_API_KEY is required to enable sponsored transactions.");
  return new GelatoRelayAdapter(createGelatoEvmRelayerClient({ apiKey, testnet }));
}

export class ViemGatewayChain implements GatewayChain {
  constructor(
    private readonly client: PublicClientLike,
    private readonly forwarder: Address,
  ) {}

  async getNonce(user: Address) {
    return await this.client.readContract({
      address: this.forwarder,
      abi: alterfordForwarderAbi,
      functionName: "nonces",
      args: [user],
    }) as bigint;
  }

  async verify(request: SignedForwardRequest) {
    return await this.client.readContract({
      address: this.forwarder,
      abi: alterfordForwarderAbi,
      functionName: "verify",
      args: [forwarderRequest(request)],
    }) as boolean;
  }

  async simulate(request: SignedForwardRequest) {
    await this.client.simulateContract({
      account: request.from,
      address: this.forwarder,
      abi: alterfordForwarderAbi,
      functionName: "execute",
      args: [forwarderRequest(request)],
      value: request.value,
    });
  }
}

function forwarderRequest(request: SignedForwardRequest) {
  return {
    from: request.from,
    to: request.to,
    value: request.value,
    gas: request.gas,
    deadline: request.deadline,
    data: request.data,
    signature: request.signature,
  };
}

function transactionHashFrom(receipt: unknown): Hex | undefined {
  if (!receipt || typeof receipt !== "object" || !("transactionHash" in receipt)) return undefined;
  const hash = receipt.transactionHash;
  return typeof hash === "string" && hash.startsWith("0x") ? hash as Hex : undefined;
}
