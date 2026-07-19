import { describe, expect, it, vi } from "vitest";
import { CryptoLedger } from "./cryptoLedger.js";
import {
  MoneroService,
  buildMoneroWithdrawalTypedData,
  type MoneroRpc,
} from "./moneroService.js";

const beneficiary = "0x1111111111111111111111111111111111111111" as const;
const gatewayId = `0x${"ab".repeat(32)}` as const;

describe("MoneroService", () => {
  it("creates one subaddress for an idempotent deposit request", async () => {
    const rpc = rpcFixture();
    const service = serviceFixture(rpc);
    const input = {
      beneficiary,
      requestedAmountAtomic: 1_000_000_000_000n,
      idempotencyKey: "deposit-key-0001",
    };

    const first = await service.createDeposit(input);
    const second = await service.createDeposit(input);

    expect(first).toEqual(second);
    expect(rpc.createAddress).toHaveBeenCalledOnce();
    expect(first).toMatchObject({
      beneficiary,
      address: "8".repeat(95),
      status: "awaiting_payment",
    });
  });

  it("synchronizes confirmed native XMR transfers", async () => {
    const rpc = rpcFixture();
    rpc.incomingTransfers.mockResolvedValue([{
      txHash: "a".repeat(64),
      amountAtomic: 1_000n,
      confirmations: 12,
      doubleSpendSeen: false,
      locked: false,
      addressIndex: 17,
    }]);
    const service = serviceFixture(rpc);
    const deposit = await service.createDeposit({
      beneficiary,
      requestedAmountAtomic: 1_000n,
      idempotencyKey: "deposit-key-0001",
    });

    await expect(service.syncDeposits()).resolves.toEqual([
      expect.objectContaining({ id: deposit.id, status: "confirmed", confirmedAmountAtomic: "1000" }),
    ]);
  });

  it("keeps withdrawals disabled unless the operator opts in", async () => {
    const service = serviceFixture(rpcFixture(), { withdrawalsEnabled: false });
    await expect(service.submitWithdrawal(withdrawalInput())).rejects.toThrow("disabled");
  });

  it("verifies EIP-712, consumes the nonce and submits one withdrawal", async () => {
    const rpc = rpcFixture();
    rpc.incomingTransfers.mockResolvedValue([confirmedTransfer(1_000n)]);
    const verifySignature = vi.fn(async () => true);
    const service = serviceFixture(rpc, { withdrawalsEnabled: true, verifySignature });
    await fund(service);

    const result = await service.submitWithdrawal(withdrawalInput());

    expect(verifySignature).toHaveBeenCalledWith(expect.objectContaining({
      domain: expect.objectContaining({ chainId: 84532, name: "AlterfordMoneroGateway" }),
      message: expect.objectContaining({ beneficiary, nonce: 0n, gatewayId }),
    }));
    expect(rpc.transfer).toHaveBeenCalledWith("4".repeat(95), 500n);
    expect(result).toMatchObject({ status: "submitted", txHash: "b".repeat(64) });
    expect(service.withdrawalNonce(beneficiary)).toBe(1n);
    await expect(service.submitWithdrawal(withdrawalInput())).resolves.toEqual(result);
    expect(rpc.transfer).toHaveBeenCalledOnce();
    await expect(service.submitWithdrawal({
      ...withdrawalInput(),
      idempotencyKey: "withdraw-key-0002",
    })).rejects.toThrow("nonce");
  });

  it("never withdraws more XMR than the beneficiary has confirmed", async () => {
    const rpc = rpcFixture();
    rpc.incomingTransfers.mockResolvedValue([confirmedTransfer(400n)]);
    const service = serviceFixture(rpc, { withdrawalsEnabled: true });
    await fund(service);

    await expect(service.submitWithdrawal(withdrawalInput())).rejects.toThrow("Insufficient confirmed");
    expect(rpc.transfer).not.toHaveBeenCalled();
  });

  it("rejects expired or invalid withdrawal signatures", async () => {
    const expired = serviceFixture(rpcFixture(), {
      withdrawalsEnabled: true,
      now: () => 2_000,
    });
    await expect(expired.submitWithdrawal({ ...withdrawalInput(), deadline: 1_999 }))
      .rejects.toThrow("expired");

    const invalid = serviceFixture(rpcFixture(), {
      withdrawalsEnabled: true,
      verifySignature: vi.fn(async () => false),
    });
    await expect(invalid.submitWithdrawal(withdrawalInput())).rejects.toThrow("signature");
  });

  it("builds a chain and gateway bound withdrawal payload", () => {
    expect(buildMoneroWithdrawalTypedData(84532, gatewayId, {
      beneficiary,
      destination: "4".repeat(95),
      amountAtomic: 500n,
      nonce: 3n,
      deadline: 2_000,
    })).toMatchObject({
      domain: { name: "AlterfordMoneroGateway", version: "1", chainId: 84532 },
      primaryType: "MoneroWithdrawal",
      message: { beneficiary, nonce: 3n, gatewayId },
    });
  });
});

function rpcFixture() {
  return {
    createAddress: vi.fn(async () => ({ address: "8".repeat(95), addressIndex: 17 })),
    incomingTransfers: vi.fn<MoneroRpc["incomingTransfers"]>(async () => []),
    transfer: vi.fn(async () => ({ txHash: "b".repeat(64), feeAtomic: 20n })),
  };
}

function serviceFixture(
  rpc: ReturnType<typeof rpcFixture>,
  overrides: Partial<ConstructorParameters<typeof MoneroService>[0]> = {},
) {
  return new MoneroService({
    rpc,
    ledger: new CryptoLedger(),
    chainId: 84532,
    gatewayId,
    network: "stagenet",
    minimumConfirmations: 10,
    withdrawalsEnabled: false,
    now: () => 1_000,
    id: (() => {
      let value = 0;
      return (kind: string) => `${kind}-000${++value}`;
    })(),
    verifySignature: vi.fn(async () => true),
    ...overrides,
  });
}

function withdrawalInput() {
  return {
    beneficiary,
    destination: "4".repeat(95),
    amountAtomic: 500n,
    nonce: 0n,
    deadline: 2_000,
    idempotencyKey: "withdraw-key-0001",
    signature: `0x${"11".repeat(65)}` as const,
  };
}

async function fund(service: MoneroService) {
  await service.createDeposit({
    beneficiary,
    requestedAmountAtomic: 1n,
    idempotencyKey: "deposit-funding-0001",
  });
  await service.syncDeposits();
}

function confirmedTransfer(amountAtomic: bigint) {
  return {
    txHash: "a".repeat(64),
    amountAtomic,
    confirmations: 12,
    doubleSpendSeen: false,
    locked: false,
    addressIndex: 17,
  };
}
