import { isAddress, type Address } from "viem";
import type { MoneroIncomingTransfer } from "./moneroRpc.js";
import { validateMoneroAddress } from "./moneroRpc.js";

export type CryptoDepositStatus = "awaiting_payment" | "confirming" | "confirmed";
export type CryptoWithdrawalStatus = "pending" | "submitted";

export interface CryptoDeposit {
  id: string;
  idempotencyKey: string;
  beneficiary: Address;
  address: string;
  addressIndex: number;
  requestedAmountAtomic?: bigint;
  receivedAmountAtomic: bigint;
  confirmedAmountAtomic: bigint;
  status: CryptoDepositStatus;
  transfers: MoneroIncomingTransfer[];
  createdAt: number;
  updatedAt: number;
  confirmedAt?: number;
}

export interface CryptoWithdrawal {
  id: string;
  idempotencyKey: string;
  beneficiary: Address;
  destination: string;
  amountAtomic: bigint;
  status: CryptoWithdrawalStatus;
  createdAt: number;
  submittedAt?: number;
  txHash?: string;
  feeAtomic?: bigint;
}

export interface CryptoLedgerSnapshot {
  version: 1;
  deposits: Array<Omit<CryptoDeposit, "requestedAmountAtomic" | "receivedAmountAtomic" | "confirmedAmountAtomic" | "transfers"> & {
    requestedAmountAtomic?: string;
    receivedAmountAtomic: string;
    confirmedAmountAtomic: string;
    transfers: Array<Omit<MoneroIncomingTransfer, "amountAtomic"> & { amountAtomic: string }>;
  }>;
  withdrawals: Array<Omit<CryptoWithdrawal, "amountAtomic" | "feeAtomic"> & {
    amountAtomic: string;
    feeAtomic?: string;
  }>;
  withdrawalNonces: Array<[Address, string]>;
}

type DepositInput = Pick<
  CryptoDeposit,
  "id" | "idempotencyKey" | "beneficiary" | "address" | "addressIndex" | "requestedAmountAtomic" | "createdAt"
>;
type WithdrawalInput = Pick<
  CryptoWithdrawal,
  "id" | "idempotencyKey" | "beneficiary" | "destination" | "amountAtomic" | "createdAt"
>;

export class CryptoLedger {
  private readonly deposits = new Map<string, CryptoDeposit>();
  private readonly depositIdByKey = new Map<string, string>();
  private readonly depositIdByAddressIndex = new Map<number, string>();
  private readonly depositIdByTxHash = new Map<string, string>();
  private readonly withdrawals = new Map<string, CryptoWithdrawal>();
  private readonly withdrawalIdByKey = new Map<string, string>();
  private readonly withdrawalNonces = new Map<Address, bigint>();

  constructor(
    snapshot?: CryptoLedgerSnapshot,
    private readonly onChange?: (snapshot: CryptoLedgerSnapshot) => void,
  ) {
    for (const raw of snapshot?.deposits ?? []) {
      const deposit = deserializeDeposit(raw);
      this.deposits.set(deposit.id, deposit);
      this.depositIdByKey.set(deposit.idempotencyKey, deposit.id);
      this.depositIdByAddressIndex.set(deposit.addressIndex, deposit.id);
      for (const transfer of deposit.transfers) this.depositIdByTxHash.set(transfer.txHash, deposit.id);
    }
    for (const raw of snapshot?.withdrawals ?? []) {
      const withdrawal = deserializeWithdrawal(raw);
      this.withdrawals.set(withdrawal.id, withdrawal);
      this.withdrawalIdByKey.set(withdrawal.idempotencyKey, withdrawal.id);
    }
    for (const [beneficiary, nonce] of snapshot?.withdrawalNonces ?? []) {
      if (isAddress(beneficiary) && /^\d+$/.test(nonce)) {
        this.withdrawalNonces.set(beneficiary, BigInt(nonce));
      }
    }
  }

  createDeposit(input: DepositInput) {
    validateDepositInput(input);
    const previousId = this.depositIdByKey.get(input.idempotencyKey);
    if (previousId) {
      const previous = this.deposits.get(previousId)!;
      if (
        previous.beneficiary.toLowerCase() !== input.beneficiary.toLowerCase()
        || previous.requestedAmountAtomic !== input.requestedAmountAtomic
      ) throw new Error("Deposit idempotency key conflicts with another request.");
      return cloneDeposit(previous);
    }
    if (this.deposits.has(input.id)) throw new Error("Deposit id already exists.");
    if (this.depositIdByAddressIndex.has(input.addressIndex)) {
      throw new Error("Monero subaddress is already assigned to another deposit.");
    }
    const deposit: CryptoDeposit = {
      ...input,
      receivedAmountAtomic: 0n,
      confirmedAmountAtomic: 0n,
      status: "awaiting_payment",
      transfers: [],
      updatedAt: input.createdAt,
    };
    this.deposits.set(input.id, deposit);
    this.depositIdByKey.set(input.idempotencyKey, input.id);
    this.depositIdByAddressIndex.set(input.addressIndex, input.id);
    this.persist();
    return cloneDeposit(deposit);
  }

  deposit(id: string) {
    const deposit = this.deposits.get(id);
    return deposit ? cloneDeposit(deposit) : undefined;
  }

  depositForKey(idempotencyKey: string) {
    const id = this.depositIdByKey.get(idempotencyKey);
    return id ? this.deposit(id) : undefined;
  }

  depositsForSync() {
    return [...this.deposits.values()].map(cloneDeposit);
  }

  syncDeposit(
    id: string,
    transfers: MoneroIncomingTransfer[],
    minimumConfirmations: number,
    now: number,
  ) {
    const deposit = this.deposits.get(id);
    if (!deposit) throw new Error("Unknown Monero deposit.");
    if (!Number.isSafeInteger(minimumConfirmations) || minimumConfirmations <= 0) {
      throw new Error("Minimum confirmations must be positive.");
    }
    const normalized = new Map<string, MoneroIncomingTransfer>();
    for (const transfer of transfers) {
      if (transfer.addressIndex !== deposit.addressIndex) continue;
      const owner = this.depositIdByTxHash.get(transfer.txHash);
      if (owner && owner !== id) throw new Error("Monero transaction belongs to another deposit.");
      if (transfer.doubleSpendSeen) continue;
      const existing = normalized.get(transfer.txHash);
      if (!existing || existing.confirmations < transfer.confirmations) {
        normalized.set(transfer.txHash, { ...transfer });
      }
    }
    for (const transfer of normalized.values()) this.depositIdByTxHash.set(transfer.txHash, id);
    deposit.transfers = [...normalized.values()].sort((a, b) => a.txHash.localeCompare(b.txHash));
    deposit.receivedAmountAtomic = sum(deposit.transfers.map((transfer) => transfer.amountAtomic));
    deposit.confirmedAmountAtomic = sum(
      deposit.transfers
        .filter((transfer) => !transfer.locked && transfer.confirmations >= minimumConfirmations)
        .map((transfer) => transfer.amountAtomic),
    );
    const target = deposit.requestedAmountAtomic ?? 1n;
    if (deposit.confirmedAmountAtomic >= target) {
      deposit.status = "confirmed";
      deposit.confirmedAt ??= now;
    } else if (deposit.receivedAmountAtomic > 0n) {
      deposit.status = "confirming";
      deposit.confirmedAt = undefined;
    } else {
      deposit.status = "awaiting_payment";
      deposit.confirmedAt = undefined;
    }
    deposit.updatedAt = now;
    this.persist();
    return cloneDeposit(deposit);
  }

  createWithdrawal(input: WithdrawalInput) {
    validateWithdrawalInput(input);
    const previousId = this.withdrawalIdByKey.get(input.idempotencyKey);
    if (previousId) {
      const previous = this.withdrawals.get(previousId)!;
      if (
        previous.beneficiary.toLowerCase() !== input.beneficiary.toLowerCase()
        || previous.destination !== input.destination
        || previous.amountAtomic !== input.amountAtomic
      ) throw new Error("Withdrawal idempotency key conflicts with another request.");
      return { ...previous };
    }
    if (this.withdrawals.has(input.id)) throw new Error("Withdrawal id already exists.");
    if (input.amountAtomic > this.availableWithdrawalBalance(input.beneficiary)) {
      throw new Error("Insufficient confirmed Monero balance.");
    }
    const withdrawal: CryptoWithdrawal = { ...input, status: "pending" };
    this.withdrawals.set(input.id, withdrawal);
    this.withdrawalIdByKey.set(input.idempotencyKey, input.id);
    this.persist();
    return { ...withdrawal };
  }

  reserveWithdrawal(input: WithdrawalInput, nonce: bigint) {
    validateWithdrawalInput(input);
    const currentNonce = this.withdrawalNonce(input.beneficiary);
    if (nonce !== currentNonce) throw new Error("Invalid withdrawal nonce.");
    const previousId = this.withdrawalIdByKey.get(input.idempotencyKey);
    if (previousId) {
      const previous = this.withdrawals.get(previousId)!;
      if (
        previous.beneficiary.toLowerCase() !== input.beneficiary.toLowerCase()
        || previous.destination !== input.destination
        || previous.amountAtomic !== input.amountAtomic
      ) throw new Error("Withdrawal idempotency key conflicts with another request.");
      return { ...previous };
    }
    if (this.withdrawals.has(input.id)) throw new Error("Withdrawal id already exists.");
    if (input.amountAtomic > this.availableWithdrawalBalance(input.beneficiary)) {
      throw new Error("Insufficient confirmed Monero balance.");
    }
    const withdrawal: CryptoWithdrawal = { ...input, status: "pending" };
    this.withdrawals.set(input.id, withdrawal);
    this.withdrawalIdByKey.set(input.idempotencyKey, input.id);
    this.withdrawalNonces.set(input.beneficiary, currentNonce + 1n);
    this.persist();
    return { ...withdrawal };
  }

  withdrawal(id: string) {
    const withdrawal = this.withdrawals.get(id);
    return withdrawal ? { ...withdrawal } : undefined;
  }

  withdrawalForKey(idempotencyKey: string) {
    const id = this.withdrawalIdByKey.get(idempotencyKey);
    return id ? this.withdrawal(id) : undefined;
  }

  withdrawalNonce(beneficiary: Address) {
    if (!isAddress(beneficiary)) throw new Error("Invalid withdrawal beneficiary.");
    return this.withdrawalNonces.get(beneficiary) ?? 0n;
  }

  availableWithdrawalBalance(beneficiary: Address) {
    if (!isAddress(beneficiary)) throw new Error("Invalid withdrawal beneficiary.");
    const normalized = beneficiary.toLowerCase();
    const confirmed = [...this.deposits.values()]
      .filter((deposit) => deposit.beneficiary.toLowerCase() === normalized)
      .reduce((total, deposit) => total + deposit.confirmedAmountAtomic, 0n);
    const reserved = [...this.withdrawals.values()]
      .filter((withdrawal) => withdrawal.beneficiary.toLowerCase() === normalized)
      .reduce((total, withdrawal) => total + withdrawal.amountAtomic, 0n);
    return confirmed > reserved ? confirmed - reserved : 0n;
  }

  consumeWithdrawalNonce(beneficiary: Address, nonce: bigint) {
    const current = this.withdrawalNonce(beneficiary);
    if (nonce !== current) throw new Error("Invalid withdrawal nonce.");
    this.withdrawalNonces.set(beneficiary, current + 1n);
    this.persist();
  }

  markWithdrawalSubmitted(
    id: string,
    txHash: string,
    feeAtomic: bigint,
    submittedAt: number,
  ) {
    const withdrawal = this.withdrawals.get(id);
    if (!withdrawal) throw new Error("Unknown Monero withdrawal.");
    if (withdrawal.status === "submitted") throw new Error("Monero withdrawal already submitted.");
    if (!/^[0-9a-fA-F]{64}$/.test(txHash) || feeAtomic < 0n) {
      throw new Error("Invalid Monero withdrawal transaction.");
    }
    withdrawal.status = "submitted";
    withdrawal.txHash = txHash.toLowerCase();
    withdrawal.feeAtomic = feeAtomic;
    withdrawal.submittedAt = submittedAt;
    this.persist();
    return { ...withdrawal };
  }

  snapshot(): CryptoLedgerSnapshot {
    return {
      version: 1,
      deposits: [...this.deposits.values()].map(serializeDeposit),
      withdrawals: [...this.withdrawals.values()].map(serializeWithdrawal),
      withdrawalNonces: [...this.withdrawalNonces].map(([beneficiary, nonce]) => [
        beneficiary,
        nonce.toString(),
      ]),
    };
  }

  private persist() {
    this.onChange?.(this.snapshot());
  }
}

function validateDepositInput(input: DepositInput) {
  validateId(input.id, "deposit id");
  validateId(input.idempotencyKey, "deposit idempotency key");
  if (!isAddress(input.beneficiary)) throw new Error("Invalid deposit beneficiary.");
  validateMoneroAddress(input.address);
  if (!Number.isSafeInteger(input.addressIndex) || input.addressIndex < 0) {
    throw new Error("Invalid Monero subaddress index.");
  }
  if (input.requestedAmountAtomic !== undefined && input.requestedAmountAtomic <= 0n) {
    throw new Error("Requested XMR amount must be positive.");
  }
  validateTimestamp(input.createdAt);
}

function validateWithdrawalInput(input: WithdrawalInput) {
  validateId(input.id, "withdrawal id");
  validateId(input.idempotencyKey, "withdrawal idempotency key");
  if (!isAddress(input.beneficiary)) throw new Error("Invalid withdrawal beneficiary.");
  validateMoneroAddress(input.destination);
  if (input.amountAtomic <= 0n) throw new Error("Withdrawal amount must be positive.");
  validateTimestamp(input.createdAt);
}

function validateId(value: string, label: string) {
  if (!/^[A-Za-z0-9._:-]{8,128}$/.test(value)) throw new Error(`Invalid ${label}.`);
}

function validateTimestamp(value: number) {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error("Invalid ledger timestamp.");
}

function sum(values: bigint[]) {
  return values.reduce((total, value) => total + value, 0n);
}

function cloneDeposit(deposit: CryptoDeposit): CryptoDeposit {
  return { ...deposit, transfers: deposit.transfers.map((transfer) => ({ ...transfer })) };
}

function serializeDeposit(deposit: CryptoDeposit): CryptoLedgerSnapshot["deposits"][number] {
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

function serializeWithdrawal(
  withdrawal: CryptoWithdrawal,
): CryptoLedgerSnapshot["withdrawals"][number] {
  return {
    ...withdrawal,
    amountAtomic: withdrawal.amountAtomic.toString(),
    feeAtomic: withdrawal.feeAtomic?.toString(),
  };
}

function deserializeDeposit(raw: CryptoLedgerSnapshot["deposits"][number]): CryptoDeposit {
  const deposit: CryptoDeposit = {
    ...raw,
    requestedAmountAtomic: raw.requestedAmountAtomic === undefined
      ? undefined
      : BigInt(raw.requestedAmountAtomic),
    receivedAmountAtomic: BigInt(raw.receivedAmountAtomic),
    confirmedAmountAtomic: BigInt(raw.confirmedAmountAtomic),
    transfers: raw.transfers.map((transfer) => ({
      ...transfer,
      amountAtomic: BigInt(transfer.amountAtomic),
    })),
  };
  validateDepositInput(deposit);
  return deposit;
}

function deserializeWithdrawal(
  raw: CryptoLedgerSnapshot["withdrawals"][number],
): CryptoWithdrawal {
  const withdrawal: CryptoWithdrawal = {
    ...raw,
    amountAtomic: BigInt(raw.amountAtomic),
    feeAtomic: raw.feeAtomic === undefined ? undefined : BigInt(raw.feeAtomic),
  };
  validateWithdrawalInput(withdrawal);
  return withdrawal;
}
