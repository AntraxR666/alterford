import { createGelatoEvmRelayerClient } from "@gelatocloud/gasless";
import {
  createMeeClient,
  getDefaultMeeGasTank,
  getDefaultMEENetworkApiKey,
  getDefaultMEENetworkUrl,
  getMEEVersion,
  MEEVersion,
  toMultichainNexusAccount,
} from "@biconomy/abstractjs";
import {
  alterfordForwarderAbi,
  type SignedForwardRequest,
} from "@alterford/sdk";
import { http, type Address, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
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

interface BiconomyClientLike {
  execute(parameters: {
    instructions: Array<{
      chainId: number;
      calls: Array<{ to: Address; data: Hex; value: bigint }>;
    }>;
    sponsorship: true;
    sponsorshipOptions?: unknown;
  }): Promise<{ hash: Hex }>;
  getSupertransactionReceipt(parameters: { hash: Hex }): Promise<{
    transactionStatus: "PENDING" | "MINING" | "SUCCESS" | "MINED_SUCCESS" | "MINED_FAIL" | "FAILED" | "EXPIRED";
    receipts?: Array<{ transactionHash?: Hex }> | null;
  }>;
}

export class BiconomyRelayAdapter implements RelayProvider {
  constructor(
    private readonly client: BiconomyClientLike,
    private readonly sponsorshipOptions?: unknown,
  ) {}

  async submit(transaction: { chainId: number; to: Address; data: Hex }) {
    const result = await this.client.execute({
      instructions: [{
        chainId: transaction.chainId,
        calls: [{ to: transaction.to, data: transaction.data, value: 0n }],
      }],
      sponsorship: true,
      ...(this.sponsorshipOptions ? { sponsorshipOptions: this.sponsorshipOptions } : {}),
    });
    return { taskId: result.hash };
  }

  async status(taskId: string) {
    const receipt = await this.client.getSupertransactionReceipt({ hash: taskId as Hex });
    if (receipt.transactionStatus === "MINED_SUCCESS" || receipt.transactionStatus === "SUCCESS") {
      return {
        state: "confirmed" as const,
        transactionHash: receipt.receipts?.find((item) => item.transactionHash)?.transactionHash,
      };
    }
    if (receipt.transactionStatus === "PENDING" || receipt.transactionStatus === "MINING") {
      return { state: "pending" as const };
    }
    return { state: "failed" as const };
  }
}

export async function createBiconomyTestnetRelayAdapter(rpcUrl: string) {
  const signer = privateKeyToAccount(generatePrivateKey());
  const account = await toMultichainNexusAccount({
    signer,
    chainConfigurations: [{
      chain: baseSepolia,
      transport: http(rpcUrl),
      version: getMEEVersion(MEEVersion.V2_1_0),
    }],
  });
  const client = await createMeeClient({
    account,
    url: getDefaultMEENetworkUrl(true),
    apiKey: getDefaultMEENetworkApiKey(true),
  });
  return new BiconomyRelayAdapter(client as unknown as BiconomyClientLike, {
    url: getDefaultMEENetworkUrl(true),
    gasTank: getDefaultMeeGasTank(true),
  });
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
