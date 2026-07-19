import {
  buildXmrConversionAuthorization,
  type XmrConversionAuthorization,
} from "@alterford/sdk";
import { getAddress, verifyTypedData, type Address, type Hex } from "viem";
import {
  XmrConversionLedger,
  type XmrConversionProvider,
  type XmrConversionStatus,
} from "./xmrConversion.js";

export { buildXmrConversionAuthorization } from "@alterford/sdk";
export type { XmrConversionAuthorization } from "@alterford/sdk";

interface SettlementVerifier {
  verify(transactionHash: Hex, destination: Address, minimumAmountMinor: bigint): Promise<{
    transactionHash: Hex;
    amountMinor: bigint;
    confirmations: number;
    verifiedAt: number;
  }>;
}

interface XmrConversionServiceOptions {
  chainId: number;
  assistedThresholdMinor: bigint;
  provider: XmrConversionProvider;
  verifier: SettlementVerifier;
  ledger: XmrConversionLedger;
  now?: () => number;
  id?: (prefix: string) => string;
}

export class XmrConversionService {
  private readonly now: () => number;
  private readonly id: (prefix: string) => string;

  constructor(private readonly options: XmrConversionServiceOptions) {
    if (options.assistedThresholdMinor <= 0n) throw new Error("Invalid XMR assisted threshold.");
    this.now = options.now ?? (() => Math.floor(Date.now() / 1_000));
    this.id = options.id ?? ((prefix) => `${prefix}-${crypto.randomUUID()}`);
  }

  async capabilities(userIp: string) {
    return {
      enabled: true,
      provider: this.options.provider.name,
      assistedThresholdMinor: this.options.assistedThresholdMinor,
      settlementChainId: this.options.chainId,
      ...(await this.options.provider.capabilities({ userIp })),
    };
  }

  async createQuote(input: {
    destination: Address;
    depositAmountAtomic?: bigint;
    settlementAmountMinor?: bigint;
    idempotencyKey: string;
    userIp: string;
    assistanceRequested?: boolean;
  }) {
    const destination = getAddress(input.destination);
    if (
      input.assistanceRequested
      || (input.settlementAmountMinor !== undefined
        && input.settlementAmountMinor >= this.options.assistedThresholdMinor)
    ) {
      return {
        mode: "assisted" as const,
        case: this.options.ledger.createAssistanceCase({
          id: this.id("xmr-case"),
          idempotencyKey: input.idempotencyKey,
          destination,
          requestedSettlementMinor: input.settlementAmountMinor ?? 1n,
          reason: input.assistanceRequested ? "user_request" : "threshold",
          createdAt: this.now(),
        }),
      };
    }
    const previous = this.options.ledger.quoteForKey(input.idempotencyKey);
    if (previous) {
      return {
        mode: "automatic" as const,
        quote: previous,
        nonce: this.options.ledger.conversionNonce(destination),
      };
    }
    const now = this.now();
    const providerQuote = await this.options.provider.quote({
      destination,
      depositAmountAtomic: input.depositAmountAtomic,
      settlementAmountMinor: input.settlementAmountMinor,
      userIp: input.userIp,
    });
    if (providerQuote.netSettlementAmountMinor >= this.options.assistedThresholdMinor) {
      return {
        mode: "assisted" as const,
        case: this.options.ledger.createAssistanceCase({
          id: this.id("xmr-case"),
          idempotencyKey: input.idempotencyKey,
          destination,
          requestedSettlementMinor: providerQuote.netSettlementAmountMinor,
          reason: "threshold",
          createdAt: now,
        }),
      };
    }
    return {
      mode: "automatic" as const,
      quote: this.options.ledger.createQuote({
        ...providerQuote,
        id: this.id("xmr-quote"),
        idempotencyKey: input.idempotencyKey,
        createdAt: now,
        assisted: false,
      }),
      nonce: this.options.ledger.conversionNonce(destination),
    };
  }

  async createConversion(input: XmrConversionAuthorization & { signature: Hex; userIp: string }) {
    const previous = this.options.ledger.conversionForKey(input.idempotencyKey);
    if (previous) return previous;
    const now = this.now();
    if (input.deadline <= now || input.deadline > now + 15 * 60) {
      throw new Error("XMR conversion authorization is expired or too long.");
    }
    const quote = this.options.ledger.quote(input.quoteId);
    if (!quote || quote.expiresAt <= now) throw new Error("XMR quote is missing or expired.");
    if (quote.destination.toLowerCase() !== input.destination.toLowerCase()) {
      throw new Error("XMR conversion destination does not match quote.");
    }
    if (this.options.ledger.conversionNonce(input.destination) !== input.nonce) {
      throw new Error("Invalid XMR conversion nonce.");
    }
    const valid = await verifyTypedData({
      ...buildXmrConversionAuthorization(this.options.chainId, input),
      address: getAddress(input.destination),
      signature: input.signature,
    });
    if (!valid) throw new Error("Invalid XMR conversion authorization signature.");

    const id = this.id("xmr-conversion");
    const order = await this.options.provider.createOrder({ quote, externalId: id, userIp: input.userIp });
    const conversion = this.options.ledger.createConversion({
      id,
      idempotencyKey: input.idempotencyKey,
      quoteId: quote.id,
      destination: quote.destination,
      providerOrderId: order.providerOrderId,
      depositAddress: order.depositAddress,
      createdAt: now,
    });
    this.options.ledger.consumeConversionNonce(input.destination, input.nonce);
    return conversion;
  }

  conversion(id: string) {
    const conversion = this.options.ledger.conversion(id);
    if (!conversion) throw new Error("Unknown XMR conversion.");
    return conversion;
  }

  assistanceCase(id: string) {
    const value = this.options.ledger.assistanceCase(id);
    if (!value) throw new Error("Unknown XMR assistance case.");
    return value;
  }

  async syncConversion(id: string, userIp: string) {
    let conversion = this.conversion(id);
    if (["completed", "expired", "refunded", "failed"].includes(conversion.status)) return conversion;
    const provider = await this.options.provider.order(conversion.providerOrderId, userIp);
    conversion = this.advance(id, conversion.status, provider.status);
    if (provider.status === "settling_base" && provider.settlementTransactionHash) {
      const quote = this.options.ledger.quote(conversion.quoteId)!;
      const settlement = await this.options.verifier.verify(
        provider.settlementTransactionHash,
        conversion.destination,
        quote.netSettlementAmountMinor,
      );
      conversion = this.options.ledger.recordVerifiedSettlement(id, settlement);
    }
    return conversion;
  }

  private advance(id: string, current: XmrConversionStatus, target: XmrConversionStatus) {
    if (current === target) return this.conversion(id);
    const now = this.now();
    const forward: XmrConversionStatus[] = ["confirming_xmr", "converting", "settling_base"];
    const from = forward.indexOf(current);
    const to = forward.indexOf(target);
    let value = this.conversion(id);
    if (to >= 0) {
      for (let index = Math.max(0, from + 1); index <= to; index += 1) {
        value = this.options.ledger.transition(id, forward[index]!, now);
      }
      return value;
    }
    return this.options.ledger.transition(id, target, now);
  }
}
