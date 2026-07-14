import type { SignedForwardRequest, UnsignedForwardRequest } from "@alterford/sdk";
import type { Address, Hex } from "viem";

export interface GatewayPublicConfig {
  chainId: number;
  challengeFactory: Address;
  forwarder: Address;
  relayEnabled: boolean;
  fiatEnabled: boolean;
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

  createFiatSession(input: FiatSessionRequest) {
    return this.request<{ widgetUrl: string; expiresInSeconds: number }>("/v1/fiat/sessions", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await this.fetcher(`${this.baseUrl}${path}`, {
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
