import type { Address, Hex } from "viem";
import {
  buildForwardRequestTypedData,
  encodeForwarderExecute,
  type SignedForwardRequest,
  type UnsignedForwardRequest,
} from "@alterford/sdk";
import { SponsorshipLedger } from "./ledger.js";
import { PolicyViolation, SponsorshipPolicy } from "./policy.js";
import type { FiatSessionInput } from "./transak.js";

export interface GatewayConfig {
  chainId: number;
  challengeFactory: Address;
  forwarder: Address;
  requestTtlSeconds: number;
  maxCalldataBytes: number;
  globalDailyLimit: number;
  walletDailyLimit: number;
  ipHourlyLimit: number;
}

export interface GatewayChain {
  getNonce(user: Address): Promise<bigint>;
  verify(request: SignedForwardRequest): Promise<boolean>;
  simulate(request: SignedForwardRequest): Promise<void>;
}

export interface RelayProvider {
  submit(transaction: { chainId: number; to: Address; data: Hex }): Promise<{ taskId: string }>;
  status(taskId: string): Promise<{ state: "pending" | "confirmed" | "failed"; transactionHash?: Hex }>;
}

export interface FiatProvider {
  createSession(input: FiatSessionInput): Promise<{ widgetUrl: string; expiresInSeconds: number }>;
}

interface GatewayServiceOptions {
  config: GatewayConfig;
  chain: GatewayChain;
  relay: RelayProvider;
  fiat?: FiatProvider;
  ledger?: SponsorshipLedger;
  now?: () => number;
}

export class GatewayService {
  private readonly policy: SponsorshipPolicy;
  private readonly ledger: SponsorshipLedger;
  private readonly now: () => number;
  private readonly fiatSessions = new Map<string, {
    createdAt: number;
    promise: Promise<{ widgetUrl: string; expiresInSeconds: number }>;
  }>();

  constructor(private readonly options: GatewayServiceOptions) {
    this.policy = new SponsorshipPolicy(options.config);
    this.ledger = options.ledger ?? new SponsorshipLedger(options.config);
    this.now = options.now ?? (() => Math.floor(Date.now() / 1_000));
  }

  async prepareRelay(input: { chainId: number; user: Address; data: Hex }, _ip: string) {
    const now = this.now();
    const authorization = this.policy.authorize(
      {
        chainId: input.chainId,
        target: this.options.config.challengeFactory,
        user: input.user,
        value: 0n,
        data: input.data,
      },
      now,
    );
    const request: UnsignedForwardRequest = {
      from: input.user,
      to: this.options.config.challengeFactory,
      value: 0n,
      gas: authorization.gas,
      nonce: await this.options.chain.getNonce(input.user),
      deadline: authorization.deadline,
      data: input.data,
    };
    return {
      action: authorization.action,
      request,
      typedData: buildForwardRequestTypedData(
        this.options.config.chainId,
        this.options.config.forwarder,
        request,
      ),
    };
  }

  async submitRelay(
    input: { request: SignedForwardRequest; idempotencyKey: string },
    ip: string,
  ) {
    const previous = this.ledger.taskFor(input.idempotencyKey);
    if (previous) return previous;

    const now = this.now();
    const authorization = this.policy.authorize(
      {
        chainId: this.options.config.chainId,
        target: input.request.to,
        user: input.request.from,
        value: input.request.value,
        data: input.request.data,
      },
      now,
    );
    if (
      input.request.gas !== authorization.gas
      || input.request.deadline <= now
      || input.request.deadline > authorization.deadline
    ) {
      throw new PolicyViolation("REQUEST_BOUNDS", "The signed request exceeds sponsorship bounds.");
    }
    if (await this.options.chain.getNonce(input.request.from) !== input.request.nonce) {
      throw new PolicyViolation("INVALID_NONCE", "The signed request signature or nonce is invalid.");
    }
    if (!(await this.options.chain.verify(input.request))) {
      throw new PolicyViolation("INVALID_SIGNATURE", "The signed request signature or nonce is invalid.");
    }
    await this.options.chain.simulate(input.request);

    this.ledger.reserve(
      input.idempotencyKey,
      input.request.from,
      ip,
      authorization.action,
      now,
    );
    try {
      const response = await this.options.relay.submit({
        chainId: this.options.config.chainId,
        to: this.options.config.forwarder,
        data: encodeForwarderExecute(input.request),
      });
      this.ledger.commit(input.idempotencyKey, response.taskId);
      return response;
    } catch (error) {
      this.ledger.rollback(input.idempotencyKey);
      throw error;
    }
  }

  relayStatus(taskId: string) {
    return this.options.relay.status(taskId);
  }

  createFiatSession(input: FiatSessionInput & { idempotencyKey: string }) {
    if (!this.options.fiat) throw new Error("Fiat on-ramp is not configured.");
    if (!/^[A-Za-z0-9._:-]{8,128}$/.test(input.idempotencyKey)) {
      throw new PolicyViolation("INVALID_IDEMPOTENCY_KEY", "A valid idempotency key is required.");
    }
    const now = this.now();
    for (const [key, session] of this.fiatSessions) {
      if (session.createdAt <= now - 300) this.fiatSessions.delete(key);
    }
    const previous = this.fiatSessions.get(input.idempotencyKey);
    if (previous) return previous.promise;
    const { idempotencyKey, ...session } = input;
    const pending = this.options.fiat.createSession(session).catch((error) => {
      this.fiatSessions.delete(idempotencyKey);
      throw error;
    });
    this.fiatSessions.set(idempotencyKey, { createdAt: now, promise: pending });
    return pending;
  }
}
