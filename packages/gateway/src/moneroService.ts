import { randomUUID } from "node:crypto";
import {
  isAddress,
  isHex,
  verifyTypedData,
  type Address,
  type Hex,
} from "viem";
import { CryptoLedger, type CryptoDeposit, type CryptoWithdrawal } from "./cryptoLedger.js";
import type { MoneroIncomingTransfer } from "./moneroRpc.js";
import { validateMoneroAddress } from "./moneroRpc.js";

export interface MoneroRpc {
  createAddress(label: string): Promise<{ address: string; addressIndex: number }>;
  incomingTransfers(addressIndex: number): Promise<MoneroIncomingTransfer[]>;
  transfer(address: string, amountAtomic: bigint): Promise<{ txHash: string; feeAtomic: bigint }>;
}

export interface MoneroWithdrawalAuthorization {
  beneficiary: Address;
  destination: string;
  amountAtomic: bigint;
  nonce: bigint;
  deadline: number;
}

export interface SignedMoneroWithdrawal extends MoneroWithdrawalAuthorization {
  idempotencyKey: string;
  signature: Hex;
}

export interface MoneroServiceOptions {
  rpc: MoneroRpc;
  ledger: CryptoLedger;
  chainId: number;
  gatewayId: Hex;
  network: "mainnet" | "stagenet" | "testnet";
  minimumConfirmations: number;
  withdrawalsEnabled: boolean;
  now?: () => number;
  id?: (kind: string) => string;
  verifySignature?: typeof verifyTypedData;
}

export class MoneroService {
  private readonly now: () => number;
  private readonly id: (kind: string) => string;
  private readonly verifySignature: typeof verifyTypedData;

  constructor(private readonly options: MoneroServiceOptions) {
    if (!Number.isSafeInteger(options.chainId) || options.chainId <= 0) {
      throw new Error("Invalid Monero gateway chain id.");
    }
    if (!isHex(options.gatewayId) || options.gatewayId.length !== 66) {
      throw new Error("MONERO_GATEWAY_ID must be a bytes32 hex value.");
    }
    if (!Number.isSafeInteger(options.minimumConfirmations) || options.minimumConfirmations <= 0) {
      throw new Error("Monero minimum confirmations must be positive.");
    }
    this.now = options.now ?? (() => Math.floor(Date.now() / 1_000));
    this.id = options.id ?? ((kind) => `${kind}-${randomUUID()}`);
    this.verifySignature = options.verifySignature ?? verifyTypedData;
  }

  capabilities() {
    return {
      enabled: true,
      network: this.options.network,
      minimumConfirmations: this.options.minimumConfirmations,
      withdrawalsEnabled: this.options.withdrawalsEnabled,
      nativeSettlementEnabled: false as const,
    };
  }

  async createDeposit(input: {
    beneficiary: Address;
    requestedAmountAtomic?: bigint;
    idempotencyKey: string;
  }) {
    validateBeneficiary(input.beneficiary);
    validateKey(input.idempotencyKey);
    if (input.requestedAmountAtomic !== undefined && input.requestedAmountAtomic <= 0n) {
      throw new Error("Requested XMR amount must be positive.");
    }
    const previous = this.options.ledger.depositForKey(input.idempotencyKey);
    if (previous) return publicDeposit(previous);

    const id = this.id("xmr-deposit");
    const address = await this.options.rpc.createAddress(id);
    return publicDeposit(this.options.ledger.createDeposit({
      id,
      idempotencyKey: input.idempotencyKey,
      beneficiary: input.beneficiary,
      requestedAmountAtomic: input.requestedAmountAtomic,
      address: address.address,
      addressIndex: address.addressIndex,
      createdAt: this.now(),
    }));
  }

  deposit(id: string) {
    const deposit = this.options.ledger.deposit(id);
    if (!deposit) throw new Error("Unknown Monero deposit.");
    return publicDeposit(deposit);
  }

  async syncDeposits() {
    const updated = [];
    for (const deposit of this.options.ledger.depositsForSync()) {
      const transfers = await this.options.rpc.incomingTransfers(deposit.addressIndex);
      updated.push(publicDeposit(this.options.ledger.syncDeposit(
        deposit.id,
        transfers,
        this.options.minimumConfirmations,
        this.now(),
      )));
    }
    return updated;
  }

  withdrawalNonce(beneficiary: Address) {
    return this.options.ledger.withdrawalNonce(beneficiary);
  }

  withdrawalTypedData(input: MoneroWithdrawalAuthorization) {
    return buildMoneroWithdrawalTypedData(
      this.options.chainId,
      this.options.gatewayId,
      input,
    );
  }

  async submitWithdrawal(input: SignedMoneroWithdrawal) {
    if (!this.options.withdrawalsEnabled) throw new Error("Monero withdrawals are disabled.");
    validateKey(input.idempotencyKey);
    const previous = this.options.ledger.withdrawalForKey(input.idempotencyKey);
    if (previous) return publicWithdrawal(previous);
    validateWithdrawal(input);
    const now = this.now();
    if (input.deadline <= now) throw new Error("Monero withdrawal authorization expired.");
    const currentNonce = this.options.ledger.withdrawalNonce(input.beneficiary);
    if (input.nonce !== currentNonce) throw new Error("Invalid Monero withdrawal nonce.");
    const typedData = this.withdrawalTypedData(input);
    const valid = await this.verifySignature({
      ...typedData,
      address: input.beneficiary,
      signature: input.signature,
    });
    if (!valid) throw new Error("Invalid Monero withdrawal signature.");

    const id = this.id("xmr-withdrawal");
    const pending = this.options.ledger.reserveWithdrawal({
      id,
      idempotencyKey: input.idempotencyKey,
      beneficiary: input.beneficiary,
      destination: input.destination,
      amountAtomic: input.amountAtomic,
      createdAt: now,
    }, input.nonce);
    try {
      const transaction = await this.options.rpc.transfer(input.destination, input.amountAtomic);
      return publicWithdrawal(this.options.ledger.markWithdrawalSubmitted(
        pending.id,
        transaction.txHash,
        transaction.feeAtomic,
        this.now(),
      ));
    } catch (error) {
      throw new Error(
        `Monero withdrawal requires operator review: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}

const moneroWithdrawalTypes = {
  MoneroWithdrawal: [
    { name: "beneficiary", type: "address" },
    { name: "destination", type: "string" },
    { name: "amountAtomic", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
    { name: "gatewayId", type: "bytes32" },
  ],
} as const;

export function buildMoneroWithdrawalTypedData(
  chainId: number,
  gatewayId: Hex,
  input: MoneroWithdrawalAuthorization,
) {
  return {
    domain: {
      name: "AlterfordMoneroGateway",
      version: "1",
      chainId,
    },
    types: moneroWithdrawalTypes,
    primaryType: "MoneroWithdrawal" as const,
    message: {
      ...input,
      deadline: BigInt(input.deadline),
      gatewayId,
    },
  };
}

function validateWithdrawal(input: SignedMoneroWithdrawal) {
  validateBeneficiary(input.beneficiary);
  validateMoneroAddress(input.destination);
  if (input.amountAtomic <= 0n) throw new Error("Monero withdrawal amount must be positive.");
  if (input.nonce < 0n) throw new Error("Invalid Monero withdrawal nonce.");
  if (!Number.isSafeInteger(input.deadline) || input.deadline <= 0) {
    throw new Error("Invalid Monero withdrawal deadline.");
  }
  if (!isHex(input.signature)) throw new Error("Invalid Monero withdrawal signature.");
}

function validateBeneficiary(beneficiary: Address) {
  if (!isAddress(beneficiary)) throw new Error("Invalid EVM beneficiary.");
}

function validateKey(value: string) {
  if (!/^[A-Za-z0-9._:-]{8,128}$/.test(value)) throw new Error("Invalid idempotency key.");
}

function publicDeposit(deposit: CryptoDeposit) {
  return {
    ...deposit,
    requestedAmountAtomic: deposit.requestedAmountAtomic?.toString(),
    receivedAmountAtomic: deposit.receivedAmountAtomic.toString(),
    confirmedAmountAtomic: deposit.confirmedAmountAtomic.toString(),
    transfers: deposit.transfers.map((transfer) => ({
      ...transfer,
      amountAtomic: transfer.amountAtomic.toString(),
    })),
  };
}

function publicWithdrawal(withdrawal: CryptoWithdrawal) {
  return {
    ...withdrawal,
    amountAtomic: withdrawal.amountAtomic.toString(),
    feeAtomic: withdrawal.feeAtomic?.toString(),
  };
}
