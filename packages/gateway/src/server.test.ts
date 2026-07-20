import { afterEach, describe, expect, it, vi } from "vitest";
import type { Server } from "node:http";
import { startGatewayServer } from "./server.js";

let server: Server | undefined;

afterEach(async () => {
  if (server) await new Promise<void>((resolve) => server?.close(() => resolve()));
  server = undefined;
});

describe("gateway HTTP server", () => {
  it("exposes public capability config without provider secrets", async () => {
    server = startGatewayServer(fakeService(), {
      port: 0,
      allowedOrigins: ["https://alterford.example"],
      publicConfig: {
        chainId: 84532,
        marketFactory: "0x3333333333333333333333333333333333333333",
        bountyFactory: "0x4444444444444444444444444444444444444444",
        challengeFactory: "0x1111111111111111111111111111111111111111",
        forwarder: "0x2222222222222222222222222222222222222222",
        relayEnabled: true,
        fiatEnabled: true,
        monero: {
          enabled: true,
          network: "stagenet",
          minimumConfirmations: 10,
          withdrawalsEnabled: false,
          nativeSettlementEnabled: false,
        },
      },
    });
    const baseUrl = await addressOf(server);

    const response = await fetch(`${baseUrl}/v1/config`);
    const body = await response.json();

    expect(body).toMatchObject({
      chainId: 84532,
      relayEnabled: true,
      fiatEnabled: true,
      monero: { enabled: true, network: "stagenet", withdrawalsEnabled: false },
    });
    expect(JSON.stringify(body)).not.toMatch(/api.?key|secret/i);
  });

  it("blocks state-changing requests from an unapproved origin", async () => {
    const service = fakeService();
    server = startGatewayServer(service, {
      port: 0,
      allowedOrigins: ["https://alterford.example"],
      publicConfig: {
        chainId: 84532,
        marketFactory: "0x3333333333333333333333333333333333333333",
        bountyFactory: "0x4444444444444444444444444444444444444444",
        challengeFactory: "0x1111111111111111111111111111111111111111",
        forwarder: "0x2222222222222222222222222222222222222222",
        relayEnabled: true,
        fiatEnabled: false,
      },
    });
    const baseUrl = await addressOf(server);

    const response = await fetch(`${baseUrl}/v1/relay/prepare`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://attacker.example" },
      body: JSON.stringify({}),
    });

    expect(response.status).toBe(403);
    expect(service.prepareRelay).not.toHaveBeenCalled();
  });

  it("accepts image evidence only when pinning is configured", async () => {
    const service = fakeService();
    service.pinEvidence.mockResolvedValue({
      cid: "bafy-photo",
      uri: "ipfs://bafy-photo",
      sha256: "ab".repeat(32),
      size: 8,
      mimeType: "image/png",
    });
    server = startGatewayServer(service, options());
    const baseUrl = await addressOf(server);

    const response = await fetch(`${baseUrl}/v1/evidence/images`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        fileName: "proof.png",
        mimeType: "image/png",
        bytesBase64: Buffer.from("photo").toString("base64"),
      }),
    });

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ uri: "ipfs://bafy-photo" });
    expect(service.pinEvidence).toHaveBeenCalledOnce();
  });

  it("creates and reads native XMR deposit requests", async () => {
    const service = fakeService();
    service.createMoneroDeposit.mockResolvedValue({
      id: "xmr-deposit-001",
      address: "8".repeat(95),
      status: "awaiting_payment",
    });
    service.moneroDeposit.mockReturnValue({
      id: "xmr-deposit-001",
      address: "8".repeat(95),
      status: "confirmed",
    });
    server = startGatewayServer(service, options());
    const baseUrl = await addressOf(server);

    const created = await fetch(`${baseUrl}/v1/crypto/xmr/deposits`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        beneficiary: "0x1111111111111111111111111111111111111111",
        requestedAmountAtomic: "1000000000000",
        idempotencyKey: "deposit-key-0001",
      }),
    });
    expect(created.status).toBe(201);
    expect(await created.json()).toMatchObject({ id: "xmr-deposit-001" });
    expect(service.createMoneroDeposit).toHaveBeenCalledWith(expect.objectContaining({
      requestedAmountAtomic: 1_000_000_000_000n,
    }));

    const status = await fetch(`${baseUrl}/v1/crypto/xmr/deposits/xmr-deposit-001`);
    expect(status.status).toBe(200);
    expect(await status.json()).toMatchObject({ status: "confirmed" });
  });

  it("protects Monero synchronization with an operator token", async () => {
    const service = fakeService();
    service.syncMoneroDeposits.mockResolvedValue([]);
    server = startGatewayServer(service, { ...options(), operatorSyncToken: "sync-secret" });
    const baseUrl = await addressOf(server);

    const denied = await fetch(`${baseUrl}/v1/crypto/xmr/sync`, { method: "POST" });
    expect(denied.status).toBe(401);

    const accepted = await fetch(`${baseUrl}/v1/crypto/xmr/sync`, {
      method: "POST",
      headers: { "x-alterford-sync-token": "sync-secret" },
    });
    expect(accepted.status).toBe(200);
    expect(service.syncMoneroDeposits).toHaveBeenCalledOnce();
  });

  it("parses signed Monero withdrawals without numeric precision loss", async () => {
    const service = fakeService();
    service.submitMoneroWithdrawal.mockResolvedValue({
      id: "xmr-withdrawal-001",
      status: "submitted",
    });
    server = startGatewayServer(service, options());
    const baseUrl = await addressOf(server);

    const response = await fetch(`${baseUrl}/v1/crypto/xmr/withdrawals`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        beneficiary: "0x1111111111111111111111111111111111111111",
        destination: "4".repeat(95),
        amountAtomic: "9007199254740993",
        nonce: "3",
        deadline: 2_000_000_000,
        idempotencyKey: "withdraw-key-0001",
        signature: `0x${"11".repeat(65)}`,
      }),
    });

    expect(response.status).toBe(202);
    expect(service.submitMoneroWithdrawal).toHaveBeenCalledWith(expect.objectContaining({
      amountAtomic: 9_007_199_254_740_993n,
      nonce: 3n,
    }));
  });

  it("protects operator XMR conversion synchronization with a dedicated token", async () => {
    const service = fakeService();
    service.syncXmrConversion.mockResolvedValue({ id: "xmr-conversion-0001", status: "converting" });
    server = startGatewayServer(service, {
      ...options(),
      xmrOperatorToken: "xmr-operator-secret-0001",
    });
    const baseUrl = await addressOf(server);

    const denied = await fetch(`${baseUrl}/v1/xmr/conversions/xmr-conversion-0001/sync`, { method: "POST" });
    expect(denied.status).toBe(401);

    const accepted = await fetch(`${baseUrl}/v1/xmr/conversions/xmr-conversion-0001/sync`, {
      method: "POST",
      headers: { "x-alterford-operator-token": "xmr-operator-secret-0001" },
    });
    expect(accepted.status).toBe(200);
    expect(service.syncXmrConversion).toHaveBeenCalledWith("xmr-conversion-0001", expect.any(String));
  });
});

function fakeService() {
  return {
    prepareRelay: vi.fn(),
    submitRelay: vi.fn(),
    relayStatus: vi.fn(),
    createFiatSession: vi.fn(),
    createMoneroDeposit: vi.fn(),
    moneroDeposit: vi.fn(),
    syncMoneroDeposits: vi.fn(),
    moneroWithdrawalNonce: vi.fn(),
    submitMoneroWithdrawal: vi.fn(),
    syncXmrConversion: vi.fn(),
    pinEvidence: vi.fn(),
  };
}

function options() {
  return {
    port: 0,
    allowedOrigins: ["https://alterford.example"],
    publicConfig: {
      chainId: 84532,
      marketFactory: "0x3333333333333333333333333333333333333333" as const,
      bountyFactory: "0x4444444444444444444444444444444444444444" as const,
      challengeFactory: "0x1111111111111111111111111111111111111111" as const,
      forwarder: "0x2222222222222222222222222222222222222222" as const,
      relayEnabled: true,
      fiatEnabled: false,
      monero: {
        enabled: true,
        network: "stagenet" as const,
        minimumConfirmations: 10,
        withdrawalsEnabled: false,
        nativeSettlementEnabled: false as const,
      },
    },
  };
}

async function addressOf(current: Server) {
  if (!current.listening) await new Promise<void>((resolve) => current.once("listening", resolve));
  const address = current.address();
  if (!address || typeof address === "string") throw new Error("Missing test server address.");
  return `http://127.0.0.1:${address.port}`;
}
