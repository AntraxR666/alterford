import { getAddress, type Address, type Hex } from "viem";
import type { XmrConversionProvider, XmrConversionStatus, XmrQuote } from "./xmrConversion.js";

interface SideShiftOptions {
  baseUrl: string;
  accountId: string;
  secret: string;
  fetcher?: typeof fetch;
  now?: () => number;
}

export class SideShiftXmrProvider implements XmrConversionProvider {
  readonly name = "sideshift";
  private readonly fetcher: typeof fetch;
  private readonly now: () => number;

  constructor(private readonly options: SideShiftOptions) {
    if (!options.baseUrl || !options.accountId || !options.secret) {
      throw new Error("SideShift provider configuration is incomplete.");
    }
    this.fetcher = options.fetcher ?? fetch;
    this.now = options.now ?? (() => Math.floor(Date.now() / 1_000));
  }

  async capabilities({ userIp }: { userIp: string }) {
    const permission = await this.request("/permissions", { method: "GET" }, userIp);
    if (!isRecord(permission) || permission.createShift !== true) return { available: false };
    const pairs = await this.request(
      `/pairs?pairs=${encodeURIComponent("xmr-mainnet,usdc-base")}&affiliateId=${encodeURIComponent(this.options.accountId)}`,
      { method: "GET" },
      userIp,
    );
    if (!Array.isArray(pairs) || !isRecord(pairs[0])) throw providerResponseError();
    return {
      available: true,
      minimumDepositAtomic: parseDecimal(String(pairs[0].min), 12),
      maximumDepositAtomic: parseDecimal(String(pairs[0].max), 12),
    };
  }

  async quote(input: {
    destination: Address;
    depositAmountAtomic?: bigint;
    settlementAmountMinor?: bigint;
    userIp: string;
  }): Promise<Omit<XmrQuote, "id" | "idempotencyKey" | "createdAt" | "assisted">> {
    if ((input.depositAmountAtomic === undefined) === (input.settlementAmountMinor === undefined)) {
      throw new Error("Quote requires exactly one input amount.");
    }
    const raw = await this.request("/quotes", {
      method: "POST",
      body: JSON.stringify({
        depositCoin: "xmr",
        depositNetwork: "mainnet",
        settleCoin: "usdc",
        settleNetwork: "base",
        depositAmount: input.depositAmountAtomic === undefined
          ? null
          : formatDecimal(input.depositAmountAtomic, 12),
        settleAmount: input.settlementAmountMinor === undefined
          ? null
          : formatDecimal(input.settlementAmountMinor, 6),
        affiliateId: this.options.accountId,
      }),
    }, input.userIp);
    if (!isRecord(raw)) throw providerResponseError();
    const providerQuoteId = requiredString(raw, "id");
    const depositAmountAtomic = parseDecimal(requiredString(raw, "depositAmount"), 12);
    const netSettlementAmountMinor = parseDecimal(requiredString(raw, "settleAmount"), 6);
    const networkFeeMinor = parseDecimal(requiredString(raw, "settleCoinNetworkFee"), 6);
    const expiresAt = Math.floor(Date.parse(requiredString(raw, "expiresAt")) / 1_000);
    if (!Number.isSafeInteger(expiresAt) || expiresAt <= this.now()) throw providerResponseError();
    return {
      provider: this.name,
      providerQuoteId,
      destination: getAddress(input.destination),
      depositAmountAtomic,
      grossSettlementAmountMinor: netSettlementAmountMinor + networkFeeMinor,
      providerFeeMinor: 0n,
      networkFeeMinor,
      netSettlementAmountMinor,
      feeMode: "deducted",
      rate: requiredString(raw, "rate"),
      expiresAt,
    };
  }

  async createOrder(input: { quote: XmrQuote; externalId: string; userIp: string }) {
    const raw = await this.request("/shifts/fixed", {
      method: "POST",
      body: JSON.stringify({
        settleAddress: getAddress(input.quote.destination),
        affiliateId: this.options.accountId,
        quoteId: input.quote.providerQuoteId,
        externalId: input.externalId,
      }),
    }, input.userIp);
    if (!isRecord(raw)) throw providerResponseError();
    const settleAddress = requiredString(raw, "settleAddress");
    if (settleAddress.toLowerCase() !== input.quote.destination.toLowerCase()) {
      throw new Error("Conversion provider returned a different settlement wallet.");
    }
    return {
      providerOrderId: requiredString(raw, "id"),
      depositAddress: requiredString(raw, "depositAddress"),
    };
  }

  async order(providerOrderId: string, userIp: string) {
    const raw = await this.request(`/shifts/${encodeURIComponent(providerOrderId)}`, { method: "GET" }, userIp);
    if (!isRecord(raw)) throw providerResponseError();
    const status = mapStatus(requiredString(raw, "status"));
    const settleHash = typeof raw.settleHash === "string" && /^0x[0-9a-fA-F]{64}$/.test(raw.settleHash)
      ? raw.settleHash as Hex
      : undefined;
    return { status, settlementTransactionHash: settleHash };
  }

  private async request(path: string, init: RequestInit, userIp: string) {
    let response: Response;
    try {
      response = await this.fetcher(`${this.options.baseUrl.replace(/\/$/, "")}${path}`, {
        ...init,
        headers: {
          "content-type": "application/json",
          "x-sideshift-secret": this.options.secret,
          "x-user-ip": userIp,
        },
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      throw new Error("XMR conversion provider is unavailable.");
    }
    if (!response.ok) throw new Error(`XMR conversion provider rejected the request (${response.status}).`);
    try {
      return await response.json() as unknown;
    } catch {
      throw providerResponseError();
    }
  }
}

function mapStatus(status: string): XmrConversionStatus {
  if (["waiting", "pending"].includes(status)) return "awaiting_deposit";
  if (["processing", "confirming"].includes(status)) return "confirming_xmr";
  if (["exchanging", "converting"].includes(status)) return "converting";
  if (["settled", "complete", "completed"].includes(status)) return "settling_base";
  if (["refund", "refunding"].includes(status)) return "refunding";
  if (["refunded"].includes(status)) return "refunded";
  if (["expired"].includes(status)) return "expired";
  return "failed";
}

function parseDecimal(value: string, decimals: number) {
  if (!/^\d+(?:\.\d+)?$/.test(value)) throw providerResponseError();
  const [whole, fraction = ""] = value.split(".");
  if (fraction.length > decimals) throw providerResponseError();
  return BigInt(whole) * 10n ** BigInt(decimals) + BigInt(fraction.padEnd(decimals, "0"));
}

function formatDecimal(value: bigint, decimals: number) {
  if (value <= 0n) throw new Error("Conversion amount must be positive.");
  const unit = 10n ** BigInt(decimals);
  const whole = value / unit;
  const fraction = (value % unit).toString().padStart(decimals, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requiredString(value: Record<string, unknown>, key: string) {
  const item = value[key];
  if (typeof item !== "string" || item.length === 0) throw providerResponseError();
  return item;
}

function providerResponseError() {
  return new Error("Malformed XMR conversion provider response.");
}
