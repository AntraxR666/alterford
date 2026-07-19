import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CryptoLedger } from "./cryptoLedger.js";
import { atomicCryptoLedgerWriter, loadCryptoLedgerSnapshot } from "./cryptoLedgerFile.js";

const beneficiary = "0x1111111111111111111111111111111111111111" as const;
const moneroAddress = "8".repeat(95);

describe("CryptoLedger", () => {
  it("creates idempotent deposits and preserves bigint amounts", () => {
    const ledger = new CryptoLedger();
    const first = ledger.createDeposit({
      id: "xmr-deposit-001",
      idempotencyKey: "deposit-key-0001",
      beneficiary,
      address: moneroAddress,
      addressIndex: 7,
      requestedAmountAtomic: 9_007_199_254_740_993n,
      createdAt: 100,
    });
    const second = ledger.createDeposit({
      ...first,
      id: "different-id-is-ignored",
    });

    expect(second).toEqual(first);
    expect(ledger.snapshot().deposits[0]?.requestedAmountAtomic).toBe("9007199254740993");
  });

  it("tracks partial and confirmed payments without counting a tx twice", () => {
    const ledger = fixture();
    ledger.syncDeposit("xmr-deposit-001", [{
      txHash: "a".repeat(64),
      amountAtomic: 400n,
      confirmations: 2,
      doubleSpendSeen: false,
      locked: true,
      addressIndex: 7,
    }], 10, 200);
    expect(ledger.deposit("xmr-deposit-001")).toMatchObject({
      receivedAmountAtomic: 400n,
      confirmedAmountAtomic: 0n,
      status: "confirming",
    });

    ledger.syncDeposit("xmr-deposit-001", [{
      txHash: "a".repeat(64),
      amountAtomic: 400n,
      confirmations: 12,
      doubleSpendSeen: false,
      locked: false,
      addressIndex: 7,
    }, {
      txHash: "b".repeat(64),
      amountAtomic: 600n,
      confirmations: 12,
      doubleSpendSeen: false,
      locked: false,
      addressIndex: 7,
    }], 10, 300);
    expect(ledger.deposit("xmr-deposit-001")).toMatchObject({
      receivedAmountAtomic: 1_000n,
      confirmedAmountAtomic: 1_000n,
      status: "confirmed",
      confirmedAt: 300,
    });
  });

  it("rejects subaddress reuse and cross-deposit transaction reuse", () => {
    const ledger = fixture();
    expect(() => ledger.createDeposit({
      id: "xmr-deposit-002",
      idempotencyKey: "deposit-key-0002",
      beneficiary,
      address: "7".repeat(95),
      addressIndex: 7,
      requestedAmountAtomic: 100n,
      createdAt: 101,
    })).toThrow("subaddress");

    ledger.syncDeposit("xmr-deposit-001", [transfer("c", 7)], 10, 200);
    ledger.createDeposit({
      id: "xmr-deposit-002",
      idempotencyKey: "deposit-key-0002",
      beneficiary,
      address: "7".repeat(95),
      addressIndex: 8,
      requestedAmountAtomic: 100n,
      createdAt: 201,
    });
    expect(() => ledger.syncDeposit("xmr-deposit-002", [transfer("c", 8)], 10, 202))
      .toThrow("another deposit");
  });

  it("keeps withdrawals idempotent and records one submitted transaction", () => {
    const ledger = fixture();
    ledger.syncDeposit("xmr-deposit-001", [transfer("a", 7)], 10, 99);
    expect(ledger.withdrawalNonce(beneficiary)).toBe(0n);
    ledger.consumeWithdrawalNonce(beneficiary, 0n);
    expect(ledger.withdrawalNonce(beneficiary)).toBe(1n);
    expect(() => ledger.consumeWithdrawalNonce(beneficiary, 0n)).toThrow("nonce");

    const first = ledger.createWithdrawal({
      id: "xmr-withdrawal-001",
      idempotencyKey: "withdraw-key-0001",
      beneficiary,
      destination: "4".repeat(95),
      amountAtomic: 500n,
      createdAt: 100,
    });
    expect(ledger.createWithdrawal({ ...first, id: "ignored-id" })).toEqual(first);

    ledger.markWithdrawalSubmitted("xmr-withdrawal-001", "d".repeat(64), 20n, 110);
    expect(ledger.withdrawal("xmr-withdrawal-001")).toMatchObject({
      status: "submitted",
      txHash: "d".repeat(64),
      feeAtomic: 20n,
    });
    expect(() => ledger.markWithdrawalSubmitted(
      "xmr-withdrawal-001",
      "e".repeat(64),
      20n,
      120,
    )).toThrow("already submitted");
  });

  it("reserves withdrawals only against confirmed balance", () => {
    const ledger = fixture();
    ledger.syncDeposit("xmr-deposit-001", [transfer("a", 7)], 10, 200);

    ledger.reserveWithdrawal({
      id: "xmr-withdrawal-001",
      idempotencyKey: "withdraw-key-0001",
      beneficiary,
      destination: "4".repeat(95),
      amountAtomic: 600n,
      createdAt: 201,
    }, 0n);

    expect(ledger.availableWithdrawalBalance(beneficiary)).toBe(400n);
    expect(ledger.withdrawalNonce(beneficiary)).toBe(1n);
    expect(() => ledger.reserveWithdrawal({
      id: "xmr-withdrawal-002",
      idempotencyKey: "withdraw-key-0002",
      beneficiary,
      destination: "4".repeat(95),
      amountAtomic: 401n,
      createdAt: 202,
    }, 1n)).toThrow("Insufficient confirmed");
    expect(ledger.withdrawalNonce(beneficiary)).toBe(1n);
  });

  it("round-trips an atomic JSON snapshot", () => {
    const directory = mkdtempSync(join(tmpdir(), "alterford-xmr-"));
    const path = join(directory, "ledger.json");
    const writer = atomicCryptoLedgerWriter(path);
    const ledger = fixture(undefined, writer);
    ledger.syncDeposit("xmr-deposit-001", [transfer("f", 7)], 10, 200);

    const raw = readFileSync(path, "utf8");
    expect(raw).toContain('"confirmedAmountAtomic": "1000"');
    const restored = new CryptoLedger(loadCryptoLedgerSnapshot(path));
    expect(restored.deposit("xmr-deposit-001")?.confirmedAmountAtomic).toBe(1_000n);
    expect(restored.depositsForSync()).toHaveLength(1);
  });
});

function fixture(
  snapshot?: ConstructorParameters<typeof CryptoLedger>[0],
  writer?: ConstructorParameters<typeof CryptoLedger>[1],
) {
  const ledger = new CryptoLedger(snapshot, writer);
  ledger.createDeposit({
    id: "xmr-deposit-001",
    idempotencyKey: "deposit-key-0001",
    beneficiary,
    address: moneroAddress,
    addressIndex: 7,
    requestedAmountAtomic: 1_000n,
    createdAt: 100,
  });
  return ledger;
}

function transfer(seed: string, addressIndex: number) {
  return {
    txHash: seed.repeat(64),
    amountAtomic: 1_000n,
    confirmations: 12,
    doubleSpendSeen: false,
    locked: false,
    addressIndex,
  };
}
