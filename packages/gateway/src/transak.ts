import { isAddress, type Address } from "viem";

export interface FiatSessionInput {
  walletAddress: Address;
  fiatAmount: number;
  fiatCurrency: string;
  cryptoCurrencyCode: string;
  network: string;
  partnerOrderId: string;
}

interface TransakConfig {
  apiKey: string;
  apiSecret: string;
  referrerDomain: string;
  environment: "staging" | "production";
  fetcher?: typeof fetch;
  now?: () => number;
}

export class TransakProvider {
  private readonly fetcher: typeof fetch;
  private readonly now: () => number;
  private accessToken?: { value: string; expiresAt: number };

  constructor(private readonly config: TransakConfig) {
    if (!config.apiKey || !config.apiSecret || !config.referrerDomain) {
      throw new Error("Transak server configuration is incomplete.");
    }
    this.fetcher = config.fetcher ?? fetch;
    this.now = config.now ?? (() => Math.floor(Date.now() / 1_000));
  }

  async createSession(input: FiatSessionInput) {
    validateSessionInput(input);
    const token = await this.partnerToken();
    const response = await this.fetcher(`${this.gatewayBaseUrl()}/api/v2/auth/session`, {
      method: "POST",
      headers: {
        accept: "application/json",
        "access-token": token,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        widgetParams: {
          apiKey: this.config.apiKey,
          referrerDomain: this.config.referrerDomain,
          productsAvailed: "BUY",
          walletAddress: input.walletAddress,
          disableWalletAddressForm: true,
          fiatAmount: input.fiatAmount,
          fiatCurrency: input.fiatCurrency,
          cryptoCurrencyCode: input.cryptoCurrencyCode,
          network: input.network,
          partnerOrderId: input.partnerOrderId,
        },
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const payload = await readJson(response, "Transak session creation failed.");
    const widgetUrl = nestedString(payload, "data", "widgetUrl");
    const expectedHost = this.config.environment === "staging"
      ? "global-stg.transak.com"
      : "global.transak.com";
    if (!widgetUrl || new URL(widgetUrl).hostname !== expectedHost) {
      throw new Error("Transak returned an unexpected widget URL.");
    }
    return { widgetUrl, expiresInSeconds: 300 };
  }

  private async partnerToken() {
    if (this.accessToken && this.accessToken.expiresAt > this.now() + 60) {
      return this.accessToken.value;
    }
    const response = await this.fetcher(`${this.publicBaseUrl()}/partners/api/v2/refresh-token`, {
      method: "POST",
      headers: {
        "api-secret": this.config.apiSecret,
        "content-type": "application/json",
        "x-api-key": this.config.apiKey,
      },
      body: JSON.stringify({ apiKey: this.config.apiKey }),
      signal: AbortSignal.timeout(10_000),
    });
    const payload = await readJson(response, "Transak authentication failed.");
    const value = nestedString(payload, "data", "accessToken");
    const expiresAt = nestedNumber(payload, "data", "expiresAt");
    if (!value || !expiresAt) throw new Error("Transak authentication response is invalid.");
    this.accessToken = { value, expiresAt };
    return value;
  }

  private publicBaseUrl() {
    return this.config.environment === "staging"
      ? "https://api-stg.transak.com"
      : "https://api.transak.com";
  }

  private gatewayBaseUrl() {
    return this.config.environment === "staging"
      ? "https://api-gateway-stg.transak.com"
      : "https://api-gateway.transak.com";
  }
}

function validateSessionInput(input: FiatSessionInput) {
  if (!isAddress(input.walletAddress)) throw new Error("A valid destination wallet is required.");
  if (!Number.isFinite(input.fiatAmount) || input.fiatAmount < 10 || input.fiatAmount > 10_000) {
    throw new Error("Fiat amount is outside the supported session range.");
  }
  if (!/^[A-Z]{3}$/.test(input.fiatCurrency)) throw new Error("Invalid fiat currency.");
  if (!/^[A-Z0-9]{2,12}$/.test(input.cryptoCurrencyCode)) throw new Error("Invalid crypto currency.");
  if (!/^[a-z0-9_-]{2,32}$/.test(input.network)) throw new Error("Invalid network.");
  if (!/^[A-Za-z0-9._:-]{8,128}$/.test(input.partnerOrderId)) {
    throw new Error("Invalid partner order id.");
  }
}

async function readJson(response: Response, fallback: string): Promise<unknown> {
  if (!response.ok) throw new Error(`${fallback} Provider status ${response.status}.`);
  return response.json();
}

function nestedString(value: unknown, parent: string, key: string) {
  const nested = nestedValue(value, parent, key);
  return typeof nested === "string" ? nested : undefined;
}

function nestedNumber(value: unknown, parent: string, key: string) {
  const nested = nestedValue(value, parent, key);
  return typeof nested === "number" ? nested : undefined;
}

function nestedValue(value: unknown, parent: string, key: string) {
  if (!value || typeof value !== "object" || !(parent in value)) return undefined;
  const nested = value[parent as keyof typeof value];
  if (!nested || typeof nested !== "object" || !(key in nested)) return undefined;
  return nested[key as keyof typeof nested];
}
