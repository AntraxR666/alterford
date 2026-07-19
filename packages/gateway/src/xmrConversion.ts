import { getAddress, isAddress, type Address, type Hex } from "viem";

export type XmrFeeMode = "deducted" | "added";
export type XmrConversionStatus =
  | "awaiting_deposit"
  | "confirming_xmr"
  | "converting"
  | "settling_base"
  | "completed"
  | "expired"
  | "refunding"
  | "refunded"
  | "failed"
  | "assistance_required";
export type XmrAssistanceStatus =
  | "open"
  | "assigned"
  | "awaiting_user"
  | "quoted"
  | "accepted"
  | "monitoring"
  | "resolved"
  | "cancelled";

export interface XmrQuote {
  id: string;
  idempotencyKey: string;
  provider: string;
  providerQuoteId: string;
  destination: Address;
  depositAmountAtomic: bigint;
  grossSettlementAmountMinor: bigint;
  providerFeeMinor: bigint;
  networkFeeMinor: bigint;
  netSettlementAmountMinor: bigint;
  feeMode: XmrFeeMode;
  rate: string;
  createdAt: number;
  expiresAt: number;
  assisted: boolean;
}

export interface XmrVerifiedSettlement {
  transactionHash: Hex;
  amountMinor: bigint;
  confirmations: number;
  verifiedAt: number;
}

export interface XmrConversion {
  id: string;
  idempotencyKey: string;
  quoteId: string;
  destination: Address;
  providerOrderId: string;
  depositAddress: string;
  status: XmrConversionStatus;
  createdAt: number;
  updatedAt: number;
  settlement?: XmrVerifiedSettlement;
}

export interface XmrAssistanceCase {
  id: string;
  idempotencyKey: string;
  destination: Address;
  requestedSettlementMinor: bigint;
  reason: "threshold" | "provider" | "risk" | "user_request";
  status: XmrAssistanceStatus;
  createdAt: number;
  updatedAt: number;
}

export interface XmrConversionProvider {
  readonly name: string;
  capabilities(input: { userIp: string }): Promise<{
    available: boolean;
    minimumDepositAtomic?: bigint;
    maximumDepositAtomic?: bigint;
  }>;
  quote(input: {
    destination: Address;
    depositAmountAtomic?: bigint;
    settlementAmountMinor?: bigint;
    userIp: string;
  }): Promise<Omit<XmrQuote, "id" | "idempotencyKey" | "createdAt" | "assisted">>;
  createOrder(input: { quote: XmrQuote; externalId: string; userIp: string }): Promise<{
    providerOrderId: string;
    depositAddress: string;
  }>;
  order(providerOrderId: string, userIp: string): Promise<{
    status: XmrConversionStatus;
    settlementTransactionHash?: Hex;
  }>;
}

export interface XmrConversionSnapshot {
  version: 1;
  quotes: Array<Omit<XmrQuote,
    "depositAmountAtomic" | "grossSettlementAmountMinor" | "providerFeeMinor" |
    "networkFeeMinor" | "netSettlementAmountMinor"> & {
      depositAmountAtomic: string;
      grossSettlementAmountMinor: string;
      providerFeeMinor: string;
      networkFeeMinor: string;
      netSettlementAmountMinor: string;
    }>;
  conversions: Array<Omit<XmrConversion, "settlement"> & {
    settlement?: Omit<XmrVerifiedSettlement, "amountMinor"> & { amountMinor: string };
  }>;
  assistanceCases: Array<Omit<XmrAssistanceCase, "requestedSettlementMinor"> & {
    requestedSettlementMinor: string;
  }>;
  conversionNonces: Array<[Address, string]>;
}

type QuoteInput = XmrQuote;
type ConversionInput = Omit<XmrConversion, "status" | "updatedAt" | "settlement">;
type AssistanceInput = Omit<XmrAssistanceCase, "status" | "updatedAt">;

const transitions: Record<XmrConversionStatus, readonly XmrConversionStatus[]> = {
  awaiting_deposit: ["confirming_xmr", "expired", "failed", "assistance_required"],
  confirming_xmr: ["converting", "refunding", "failed", "assistance_required"],
  converting: ["settling_base", "refunding", "failed", "assistance_required"],
  settling_base: ["refunding", "failed", "assistance_required"],
  completed: [],
  expired: [],
  refunding: ["refunded", "failed"],
  refunded: [],
  failed: [],
  assistance_required: ["awaiting_deposit", "failed"],
};

export class XmrConversionLedger {
  private readonly quotes = new Map<string, XmrQuote>();
  private readonly quoteIdsByKey = new Map<string, string>();
  private readonly conversions = new Map<string, XmrConversion>();
  private readonly conversionIdsByKey = new Map<string, string>();
  private readonly cases = new Map<string, XmrAssistanceCase>();
  private readonly caseIdsByKey = new Map<string, string>();
  private readonly conversionNonces = new Map<Address, bigint>();

  constructor(
    snapshot?: XmrConversionSnapshot,
    private readonly onChange?: (snapshot: XmrConversionSnapshot) => void,
  ) {
    for (const raw of snapshot?.quotes ?? []) {
      const quote = deserializeQuote(raw);
      validateQuote(quote);
      this.quotes.set(quote.id, quote);
      this.quoteIdsByKey.set(quote.idempotencyKey, quote.id);
    }
    for (const raw of snapshot?.conversions ?? []) {
      const conversion = deserializeConversion(raw);
      this.conversions.set(conversion.id, conversion);
      this.conversionIdsByKey.set(conversion.idempotencyKey, conversion.id);
    }
    for (const raw of snapshot?.assistanceCases ?? []) {
      const assistance = { ...raw, requestedSettlementMinor: BigInt(raw.requestedSettlementMinor) };
      this.cases.set(assistance.id, assistance);
      this.caseIdsByKey.set(assistance.idempotencyKey, assistance.id);
    }
    for (const [wallet, nonce] of snapshot?.conversionNonces ?? []) {
      if (isAddress(wallet) && /^\d+$/.test(nonce)) this.conversionNonces.set(getAddress(wallet), BigInt(nonce));
    }
  }

  createQuote(input: QuoteInput) {
    validateQuote(input);
    const previous = this.byKey(this.quoteIdsByKey, this.quotes, input.idempotencyKey);
    if (previous) {
      if (quoteFingerprint(previous) !== quoteFingerprint(input)) {
        throw new Error("Quote idempotency key conflicts with another request.");
      }
      return { ...previous };
    }
    if (this.quotes.has(input.id)) throw new Error("Quote id already exists.");
    const quote = { ...input, destination: getAddress(input.destination) };
    this.quotes.set(quote.id, quote);
    this.quoteIdsByKey.set(quote.idempotencyKey, quote.id);
    this.persist();
    return { ...quote };
  }

  quote(id: string) {
    const quote = this.quotes.get(id);
    return quote ? { ...quote } : undefined;
  }

  quoteForKey(key: string) {
    const quote = this.byKey(this.quoteIdsByKey, this.quotes, key);
    return quote ? { ...quote } : undefined;
  }

  createConversion(input: ConversionInput) {
    validateId(input.id, "conversion id");
    validateId(input.idempotencyKey, "conversion idempotency key");
    validateId(input.providerOrderId, "provider order id");
    const quote = this.quotes.get(input.quoteId);
    if (!quote) throw new Error("Unknown XMR quote.");
    if (!sameAddress(quote.destination, input.destination)) {
      throw new Error("Conversion destination must match the signed quote destination.");
    }
    const previous = this.byKey(this.conversionIdsByKey, this.conversions, input.idempotencyKey);
    if (previous) {
      if (
        previous.quoteId !== input.quoteId
        || !sameAddress(previous.destination, input.destination)
        || previous.providerOrderId !== input.providerOrderId
      ) throw new Error("Conversion idempotency key conflicts with another request.");
      return cloneConversion(previous);
    }
    if (this.conversions.has(input.id)) throw new Error("Conversion id already exists.");
    if (!/^[48][1-9A-HJ-NP-Za-km-z]{94,105}$/.test(input.depositAddress)) {
      throw new Error("Invalid provider XMR deposit address.");
    }
    validateTimestamp(input.createdAt);
    const conversion: XmrConversion = {
      ...input,
      destination: getAddress(input.destination),
      status: "awaiting_deposit",
      updatedAt: input.createdAt,
    };
    this.conversions.set(conversion.id, conversion);
    this.conversionIdsByKey.set(conversion.idempotencyKey, conversion.id);
    this.persist();
    return cloneConversion(conversion);
  }

  conversion(id: string) {
    const value = this.conversions.get(id);
    return value ? cloneConversion(value) : undefined;
  }

  conversionForKey(key: string) {
    const value = this.byKey(this.conversionIdsByKey, this.conversions, key);
    return value ? cloneConversion(value) : undefined;
  }

  conversionNonce(destination: Address) {
    if (!isAddress(destination)) throw new Error("Invalid conversion destination.");
    return this.conversionNonces.get(getAddress(destination)) ?? 0n;
  }

  consumeConversionNonce(destination: Address, nonce: bigint) {
    const address = getAddress(destination);
    const current = this.conversionNonce(address);
    if (nonce !== current) throw new Error("Invalid XMR conversion nonce.");
    this.conversionNonces.set(address, current + 1n);
    this.persist();
  }

  transition(id: string, status: XmrConversionStatus, now: number) {
    const conversion = this.conversions.get(id);
    if (!conversion) throw new Error("Unknown XMR conversion.");
    validateTimestamp(now);
    if (status === "completed") throw new Error("A verified Base settlement is required to complete conversion.");
    if (!transitions[conversion.status].includes(status)) {
      throw new Error(`Invalid XMR conversion transition: ${conversion.status} -> ${status}.`);
    }
    conversion.status = status;
    conversion.updatedAt = now;
    this.persist();
    return cloneConversion(conversion);
  }

  recordVerifiedSettlement(id: string, settlement: XmrVerifiedSettlement) {
    const conversion = this.conversions.get(id);
    if (!conversion) throw new Error("Unknown XMR conversion.");
    if (conversion.status !== "settling_base") throw new Error("Conversion is not settling on Base.");
    const quote = this.quotes.get(conversion.quoteId)!;
    if (settlement.amountMinor < quote.netSettlementAmountMinor) {
      throw new Error("Verified Base settlement is below the quoted net amount.");
    }
    if (!/^0x[0-9a-fA-F]{64}$/.test(settlement.transactionHash)) {
      throw new Error("Invalid Base settlement transaction hash.");
    }
    if (!Number.isSafeInteger(settlement.confirmations) || settlement.confirmations < 1) {
      throw new Error("Base settlement requires confirmations.");
    }
    validateTimestamp(settlement.verifiedAt);
    conversion.settlement = { ...settlement };
    conversion.status = "completed";
    conversion.updatedAt = settlement.verifiedAt;
    this.persist();
    return cloneConversion(conversion);
  }

  createAssistanceCase(input: AssistanceInput) {
    validateId(input.id, "assistance case id");
    validateId(input.idempotencyKey, "assistance idempotency key");
    if (!isAddress(input.destination)) throw new Error("Invalid assistance destination.");
    if (input.requestedSettlementMinor <= 0n) throw new Error("Assistance amount must be positive.");
    validateTimestamp(input.createdAt);
    const previous = this.byKey(this.caseIdsByKey, this.cases, input.idempotencyKey);
    if (previous) {
      if (
        !sameAddress(previous.destination, input.destination)
        || previous.requestedSettlementMinor !== input.requestedSettlementMinor
        || previous.reason !== input.reason
      ) throw new Error("Assistance idempotency key conflicts with another request.");
      return { ...previous };
    }
    const assistance: XmrAssistanceCase = {
      ...input,
      destination: getAddress(input.destination),
      status: "open",
      updatedAt: input.createdAt,
    };
    this.cases.set(assistance.id, assistance);
    this.caseIdsByKey.set(assistance.idempotencyKey, assistance.id);
    this.persist();
    return { ...assistance };
  }

  assistanceCase(id: string) {
    const value = this.cases.get(id);
    return value ? { ...value } : undefined;
  }

  snapshot(): XmrConversionSnapshot {
    return {
      version: 1,
      quotes: [...this.quotes.values()].map(serializeQuote),
      conversions: [...this.conversions.values()].map(serializeConversion),
      assistanceCases: [...this.cases.values()].map((item) => ({
        ...item,
        requestedSettlementMinor: item.requestedSettlementMinor.toString(),
      })),
      conversionNonces: [...this.conversionNonces].map(([wallet, nonce]) => [wallet, nonce.toString()]),
    };
  }

  private byKey<T>(keys: Map<string, string>, values: Map<string, T>, key: string) {
    const id = keys.get(key);
    return id ? values.get(id) : undefined;
  }

  private persist() {
    this.onChange?.(this.snapshot());
  }
}

function validateQuote(input: XmrQuote) {
  validateId(input.id, "quote id");
  validateId(input.idempotencyKey, "quote idempotency key");
  validateId(input.provider, "provider");
  if (!isAddress(input.destination)) throw new Error("Invalid quote destination.");
  for (const amount of [
    input.depositAmountAtomic,
    input.grossSettlementAmountMinor,
    input.netSettlementAmountMinor,
  ]) if (amount <= 0n) throw new Error("Quote amounts must be positive.");
  if (input.providerFeeMinor < 0n || input.networkFeeMinor < 0n) {
    throw new Error("Quote fees cannot be negative.");
  }
  const fees = input.providerFeeMinor + input.networkFeeMinor;
  const validFees = input.feeMode === "deducted"
    ? input.grossSettlementAmountMinor - fees === input.netSettlementAmountMinor
    : input.grossSettlementAmountMinor === input.netSettlementAmountMinor;
  if (!validFees) throw new Error("Invalid quote fee accounting.");
  if (!/^\d+(?:\.\d{1,18})?$/.test(input.rate) || Number(input.rate) <= 0) {
    throw new Error("Invalid quote rate.");
  }
  validateTimestamp(input.createdAt);
  validateTimestamp(input.expiresAt);
  if (input.expiresAt <= input.createdAt) throw new Error("Quote expiry must follow creation.");
}

function validateId(value: string, label: string) {
  if (!/^[A-Za-z0-9._:-]{3,128}$/.test(value)) throw new Error(`Invalid ${label}.`);
}

function validateTimestamp(value: number) {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error("Invalid ledger timestamp.");
}

function sameAddress(a: string, b: string) {
  return a.toLowerCase() === b.toLowerCase();
}

function quoteFingerprint(quote: XmrQuote) {
  return [
    quote.provider,
    quote.providerQuoteId,
    quote.destination.toLowerCase(),
    quote.depositAmountAtomic,
    quote.grossSettlementAmountMinor,
    quote.providerFeeMinor,
    quote.networkFeeMinor,
    quote.netSettlementAmountMinor,
    quote.feeMode,
    quote.rate,
    quote.createdAt,
    quote.expiresAt,
    quote.assisted,
  ].join("|");
}

function cloneConversion(value: XmrConversion): XmrConversion {
  return { ...value, settlement: value.settlement ? { ...value.settlement } : undefined };
}

function serializeQuote(quote: XmrQuote): XmrConversionSnapshot["quotes"][number] {
  return {
    ...quote,
    depositAmountAtomic: quote.depositAmountAtomic.toString(),
    grossSettlementAmountMinor: quote.grossSettlementAmountMinor.toString(),
    providerFeeMinor: quote.providerFeeMinor.toString(),
    networkFeeMinor: quote.networkFeeMinor.toString(),
    netSettlementAmountMinor: quote.netSettlementAmountMinor.toString(),
  };
}

function deserializeQuote(raw: XmrConversionSnapshot["quotes"][number]): XmrQuote {
  return {
    ...raw,
    depositAmountAtomic: BigInt(raw.depositAmountAtomic),
    grossSettlementAmountMinor: BigInt(raw.grossSettlementAmountMinor),
    providerFeeMinor: BigInt(raw.providerFeeMinor),
    networkFeeMinor: BigInt(raw.networkFeeMinor),
    netSettlementAmountMinor: BigInt(raw.netSettlementAmountMinor),
  };
}

function serializeConversion(value: XmrConversion): XmrConversionSnapshot["conversions"][number] {
  return {
    ...value,
    settlement: value.settlement
      ? { ...value.settlement, amountMinor: value.settlement.amountMinor.toString() }
      : undefined,
  };
}

function deserializeConversion(raw: XmrConversionSnapshot["conversions"][number]): XmrConversion {
  return {
    ...raw,
    settlement: raw.settlement
      ? { ...raw.settlement, amountMinor: BigInt(raw.settlement.amountMinor) }
      : undefined,
  };
}
