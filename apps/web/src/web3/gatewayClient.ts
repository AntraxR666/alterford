import type { SignedForwardRequest, UnsignedForwardRequest } from "@alterford/sdk";
import type { Address, Hex } from "viem";

export interface GatewayPublicConfig {
  chainId: number;
  challengeFactory: Address;
  forwarder: Address;
  relayEnabled: boolean;
  fiatEnabled: boolean;
  monero?: {
    enabled: boolean;
    network: "mainnet" | "stagenet" | "testnet";
    minimumConfirmations: number;
    withdrawalsEnabled: boolean;
    nativeSettlementEnabled: false;
  };
  xmrConversion?: {
    enabled: boolean;
    provider: string;
    assistedThresholdMinor: string;
    settlementChainId: number;
  };
  evidenceUploads?: {
    enabled: boolean;
    maxBytes: number;
    mimeTypes: readonly string[];
  };
}

export interface EvidenceImageUpload {
  cid: string;
  uri: string;
  sha256: string;
  size: number;
  mimeType: string;
}

export function isRelayConfigCompatible(
  config: GatewayPublicConfig,
  expected: { chainId: number; challengeFactory: Address; forwarder: Address },
): boolean {
  return config.relayEnabled
    && config.chainId === expected.chainId
    && config.challengeFactory.toLowerCase() === expected.challengeFactory.toLowerCase()
    && config.forwarder.toLowerCase() === expected.forwarder.toLowerCase();
}

export interface XmrConversionQuote {
  id: string;
  provider: string;
  destination: Address;
  depositAmountAtomic: bigint;
  grossSettlementAmountMinor: bigint;
  providerFeeMinor: bigint;
  networkFeeMinor: bigint;
  netSettlementAmountMinor: bigint;
  feeMode: "deducted" | "added";
  rate: string;
  expiresAt: number;
}

export interface XmrConversionRecord {
  id: string;
  quoteId: string;
  destination: Address;
  depositAddress: string;
  status: string;
  settlement?: { transactionHash: Hex; amountMinor: bigint; confirmations: number; verifiedAt: number };
}

export interface XmrAssistanceRecord {
  id: string;
  status: string;
  reason: string;
}

export interface RelayTaskStatus {
  state: "pending" | "confirmed" | "failed";
  transactionHash?: Hex;
}

export interface FiatSessionRequest {
  walletAddress: Address;
  fiatAmount: number;
  fiatCurrency: string;
  cryptoCurrencyCode: string;
  network: string;
  partnerOrderId: string;
  idempotencyKey: string;
}

export interface MoneroDeposit {
  id: string;
  idempotencyKey: string;
  beneficiary: Address;
  address: string;
  addressIndex: number;
  requestedAmountAtomic?: bigint;
  receivedAmountAtomic: bigint;
  confirmedAmountAtomic: bigint;
  status: "awaiting_payment" | "confirming" | "confirmed";
  transfers: Array<{
    txHash: string;
    amountAtomic: bigint;
    confirmations: number;
    doubleSpendSeen: boolean;
    locked: boolean;
    addressIndex: number;
  }>;
  createdAt: number;
  updatedAt: number;
  confirmedAt?: number;
}

export class AlterfordGatewayClient {
  private readonly baseUrl: string;

  constructor(baseUrl: string, private readonly fetcher: typeof fetch = fetch) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    if (!/^https?:\/\//.test(this.baseUrl)) throw new Error("VITE_GATEWAY_URL no es valida.");
  }

  config() {
    return this.request<GatewayPublicConfig>("/v1/config");
  }

  async prepareRelay(input: { chainId: number; user: Address; data: Hex }) {
    const response = await this.request<{
      action: string;
      request: Record<string, unknown>;
    }>("/v1/relay/prepare", { method: "POST", body: JSON.stringify(input) });
    return {
      action: response.action,
      request: parseUnsignedRequest(response.request),
    };
  }

  submitRelay(input: { request: SignedForwardRequest; idempotencyKey: string }) {
    return this.request<{ taskId: string }>("/v1/relay/submit", {
      method: "POST",
      body: JSON.stringify(input, (_key, value) => typeof value === "bigint" ? value.toString() : value),
    });
  }

  relayStatus(taskId: string) {
    return this.request<RelayTaskStatus>(`/v1/relay/tasks/${encodeURIComponent(taskId)}`);
  }

  uploadEvidenceImage(input: { fileName: string; mimeType: string; bytesBase64: string }) {
    return this.request<EvidenceImageUpload>("/v1/evidence/images", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  createFiatSession(input: FiatSessionRequest) {
    return this.request<{ widgetUrl: string; expiresInSeconds: number }>("/v1/fiat/sessions", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  async createMoneroDeposit(input: {
    beneficiary: Address;
    requestedAmountAtomic?: bigint;
    idempotencyKey: string;
  }) {
    const response = await this.request<Record<string, unknown>>("/v1/crypto/xmr/deposits", {
      method: "POST",
      body: JSON.stringify({
        ...input,
        requestedAmountAtomic: input.requestedAmountAtomic?.toString(),
      }),
    });
    return parseMoneroDeposit(response);
  }

  async moneroDeposit(id: string) {
    const response = await this.request<Record<string, unknown>>(
      `/v1/crypto/xmr/deposits/${encodeURIComponent(id)}`,
    );
    return parseMoneroDeposit(response);
  }

  xmrCapabilities() {
    return this.request<{
      enabled: boolean;
      available: boolean;
      provider: string;
      assistedThresholdMinor: string;
      settlementChainId: number;
      minimumDepositAtomic?: string;
      maximumDepositAtomic?: string;
    }>("/v1/xmr/capabilities");
  }

  async createXmrQuote(input: {
    destination: Address;
    depositAmountAtomic?: bigint;
    settlementAmountMinor?: bigint;
    idempotencyKey: string;
    assistanceRequested?: boolean;
  }) {
    const response = await this.request<Record<string, unknown>>("/v1/xmr/quotes", {
      method: "POST",
      body: stringifyBigints(input),
    });
    if (response.mode === "assisted") {
      const assistance = response.case as Record<string, unknown>;
      return {
        mode: "assisted" as const,
        case: {
          id: String(assistance.id),
          status: String(assistance.status),
          reason: String(assistance.reason),
        } satisfies XmrAssistanceRecord,
      };
    }
    return {
      mode: "automatic" as const,
      quote: parseXmrQuote(response.quote as Record<string, unknown>),
      nonce: BigInt(String(response.nonce)),
    };
  }

  async createXmrConversion(input: {
    destination: Address;
    quoteId: string;
    idempotencyKey: string;
    nonce: bigint;
    deadline: number;
    signature: Hex;
  }) {
    const response = await this.request<Record<string, unknown>>("/v1/xmr/conversions", {
      method: "POST",
      body: stringifyBigints(input),
    });
    return parseXmrConversion(response);
  }

  async xmrConversion(id: string) {
    return parseXmrConversion(await this.request<Record<string, unknown>>(
      `/v1/xmr/conversions/${encodeURIComponent(id)}`,
    ));
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const fetcher = this.fetcher;
    const response = await fetcher(`${this.baseUrl}${path}`, {
      ...init,
      headers: { "content-type": "application/json", ...init.headers },
    });
    const body = await response.json().catch(() => ({})) as Record<string, unknown>;
    if (!response.ok) {
      throw new Error(typeof body.message === "string" ? body.message : `Gateway HTTP ${response.status}.`);
    }
    return body as T;
  }
}

function stringifyBigints(value: unknown) {
  return JSON.stringify(value, (_key, item) => typeof item === "bigint" ? item.toString() : item);
}

function parseXmrQuote(value: Record<string, unknown>): XmrConversionQuote {
  return {
    id: String(value.id),
    provider: String(value.provider),
    destination: String(value.destination) as Address,
    depositAmountAtomic: BigInt(String(value.depositAmountAtomic)),
    grossSettlementAmountMinor: BigInt(String(value.grossSettlementAmountMinor)),
    providerFeeMinor: BigInt(String(value.providerFeeMinor)),
    networkFeeMinor: BigInt(String(value.networkFeeMinor)),
    netSettlementAmountMinor: BigInt(String(value.netSettlementAmountMinor)),
    feeMode: String(value.feeMode) as XmrConversionQuote["feeMode"],
    rate: String(value.rate),
    expiresAt: Number(value.expiresAt),
  };
}

function parseXmrConversion(value: Record<string, unknown>): XmrConversionRecord {
  const rawSettlement = value.settlement as Record<string, unknown> | undefined;
  return {
    id: String(value.id),
    quoteId: String(value.quoteId),
    destination: String(value.destination) as Address,
    depositAddress: String(value.depositAddress),
    status: String(value.status),
    settlement: rawSettlement
      ? {
          transactionHash: String(rawSettlement.transactionHash) as Hex,
          amountMinor: BigInt(String(rawSettlement.amountMinor)),
          confirmations: Number(rawSettlement.confirmations),
          verifiedAt: Number(rawSettlement.verifiedAt),
        }
      : undefined,
  };
}

function parseUnsignedRequest(value: Record<string, unknown>): UnsignedForwardRequest {
  const deadline = Number(value.deadline);
  if (!Number.isSafeInteger(deadline)) throw new Error("Gateway devolvio un deadline invalido.");
  return {
    from: String(value.from) as Address,
    to: String(value.to) as Address,
    value: BigInt(String(value.value)),
    gas: BigInt(String(value.gas)),
    nonce: BigInt(String(value.nonce)),
    deadline,
    data: String(value.data) as Hex,
  };
}

function parseMoneroDeposit(value: Record<string, unknown>): MoneroDeposit {
  const transfers = Array.isArray(value.transfers) ? value.transfers : [];
  return {
    id: String(value.id),
    idempotencyKey: String(value.idempotencyKey),
    beneficiary: String(value.beneficiary) as Address,
    address: String(value.address),
    addressIndex: Number(value.addressIndex),
    requestedAmountAtomic: value.requestedAmountAtomic === undefined
      ? undefined
      : BigInt(String(value.requestedAmountAtomic)),
    receivedAmountAtomic: BigInt(String(value.receivedAmountAtomic)),
    confirmedAmountAtomic: BigInt(String(value.confirmedAmountAtomic)),
    status: String(value.status) as MoneroDeposit["status"],
    transfers: transfers.map((raw) => {
      const transfer = raw as Record<string, unknown>;
      return {
        txHash: String(transfer.txHash),
        amountAtomic: BigInt(String(transfer.amountAtomic)),
        confirmations: Number(transfer.confirmations),
        doubleSpendSeen: Boolean(transfer.doubleSpendSeen),
        locked: Boolean(transfer.locked),
        addressIndex: Number(transfer.addressIndex),
      };
    }),
    createdAt: Number(value.createdAt),
    updatedAt: Number(value.updatedAt),
    confirmedAt: value.confirmedAt === undefined ? undefined : Number(value.confirmedAt),
  };
}

export async function waitForRelay(
  client: AlterfordGatewayClient,
  taskId: string,
  options: { intervalMs?: number; timeoutMs?: number } = {},
) {
  const intervalMs = options.intervalMs ?? 2_500;
  const timeoutMs = options.timeoutMs ?? 120_000;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const status = await client.relayStatus(taskId);
    if (status.state !== "pending") return status;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error("El relay sigue pendiente. Puedes revisar el estado sin volver a firmar.");
}
