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
        challengeFactory: "0x1111111111111111111111111111111111111111",
        forwarder: "0x2222222222222222222222222222222222222222",
        relayEnabled: true,
        fiatEnabled: true,
      },
    });
    const baseUrl = await addressOf(server);

    const response = await fetch(`${baseUrl}/v1/config`);
    const body = await response.json();

    expect(body).toMatchObject({ chainId: 84532, relayEnabled: true, fiatEnabled: true });
    expect(JSON.stringify(body)).not.toMatch(/api.?key|secret/i);
  });

  it("blocks state-changing requests from an unapproved origin", async () => {
    const service = fakeService();
    server = startGatewayServer(service, {
      port: 0,
      allowedOrigins: ["https://alterford.example"],
      publicConfig: {
        chainId: 84532,
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
});

function fakeService() {
  return {
    prepareRelay: vi.fn(),
    submitRelay: vi.fn(),
    relayStatus: vi.fn(),
    createFiatSession: vi.fn(),
  };
}

async function addressOf(current: Server) {
  if (!current.listening) await new Promise<void>((resolve) => current.once("listening", resolve));
  const address = current.address();
  if (!address || typeof address === "string") throw new Error("Missing test server address.");
  return `http://127.0.0.1:${address.port}`;
}
