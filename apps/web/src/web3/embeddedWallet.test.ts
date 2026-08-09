import { describe, expect, it, vi } from "vitest";
import { createEmbeddedWalletController, type EmbeddedWalletClient } from "./embeddedWallet";

function provider(accounts: string[] = ["0x00000000000000000000000000000000000000a1"]) {
  return {
    request: vi.fn(async ({ method }: { method: string }) => {
      if (method === "eth_accounts" || method === "eth_requestAccounts") return accounts;
      if (method === "eth_chainId") return "0x14a34";
      return null;
    }),
    on: vi.fn(),
    removeListener: vi.fn(),
  };
}

describe("embedded wallet controller", () => {
  it("initializes Web3Auth once and returns its EVM provider", async () => {
    const evmProvider = provider();
    const client: EmbeddedWalletClient = {
      connected: false,
      init: vi.fn(async () => undefined),
      connect: vi.fn(async () => ({ ethereumProvider: evmProvider })),
      logout: vi.fn(async () => undefined),
      switchChain: vi.fn(async () => undefined),
    };
    const factory = vi.fn(async () => client);
    const controller = createEmbeddedWalletController(factory);

    await expect(controller.connect()).resolves.toBe(evmProvider);
    await expect(controller.connect()).resolves.toBe(evmProvider);
    expect(factory).toHaveBeenCalledTimes(1);
    expect(client.init).toHaveBeenCalledTimes(1);
    expect(client.connect).toHaveBeenCalledTimes(1);
  });

  it("logs out and clears the cached provider", async () => {
    const evmProvider = provider();
    const client: EmbeddedWalletClient = {
      connected: false,
      init: vi.fn(async () => undefined),
      connect: vi.fn(async () => ({ ethereumProvider: evmProvider })),
      logout: vi.fn(async () => undefined),
      switchChain: vi.fn(async () => undefined),
    };
    const controller = createEmbeddedWalletController(async () => client);

    await controller.connect();
    await controller.disconnect();

    expect(client.logout).toHaveBeenCalledWith({ cleanup: true });
    expect(controller.provider()).toBeNull();
  });

  it("restores a cached social session that authorizes after initialization", async () => {
    const evmProvider = provider();
    let connected = false;
    let connection: { ethereumProvider: ReturnType<typeof provider> } | null = null;
    const listeners = new Map<string, Set<() => void>>();
    const client = {
      get connected() {
        return connected;
      },
      get connection() {
        return connection;
      },
      cachedConnector: "auth",
      init: vi.fn(async () => {
        setTimeout(() => {
          connected = true;
          connection = { ethereumProvider: evmProvider };
          listeners.get("authorized")?.forEach((listener) => listener());
        }, 0);
      }),
      connect: vi.fn(async () => connection),
      logout: vi.fn(async () => undefined),
      switchChain: vi.fn(async () => undefined),
      on(event: string, listener: () => void) {
        const eventListeners = listeners.get(event) ?? new Set<() => void>();
        eventListeners.add(listener);
        listeners.set(event, eventListeners);
      },
      removeListener(event: string, listener: () => void) {
        listeners.get(event)?.delete(listener);
      },
    };
    const controller = createEmbeddedWalletController(async () => client);

    const restored = controller.restore();

    await expect(restored).resolves.toBe(evmProvider);
    expect(client.connect).not.toHaveBeenCalled();
  });

  it("waits for the provider when Web3Auth emits before publishing its connection", async () => {
    const evmProvider = provider();
    let connected = false;
    let connection: { ethereumProvider: ReturnType<typeof provider> } | null = null;
    const listeners = new Map<string, Set<() => void>>();
    const client = {
      get connected() {
        return connected;
      },
      get connection() {
        return connection;
      },
      cachedConnector: "auth",
      init: vi.fn(async () => {
        setTimeout(() => {
          listeners.get("connected")?.forEach((listener) => listener());
          setTimeout(() => {
            connected = true;
            connection = { ethereumProvider: evmProvider };
          }, 10);
        }, 0);
      }),
      connect: vi.fn(async () => connection),
      logout: vi.fn(async () => undefined),
      switchChain: vi.fn(async () => undefined),
      on(event: string, listener: () => void) {
        const eventListeners = listeners.get(event) ?? new Set<() => void>();
        eventListeners.add(listener);
        listeners.set(event, eventListeners);
      },
      removeListener(event: string, listener: () => void) {
        listeners.get(event)?.delete(listener);
      },
    };
    const controller = createEmbeddedWalletController(async () => client);

    await expect(controller.restore()).resolves.toBe(evmProvider);
  });

  it("fails closed when Web3Auth returns no EVM provider", async () => {
    const client: EmbeddedWalletClient = {
      connected: false,
      init: vi.fn(async () => undefined),
      connect: vi.fn(async () => null),
      logout: vi.fn(async () => undefined),
      switchChain: vi.fn(async () => undefined),
    };
    const controller = createEmbeddedWalletController(async () => client);

    await expect(controller.connect()).rejects.toThrow("no devolvio una wallet EVM");
  });

  it("handles Web3Auth v11 direct provider return from connectModal or client.provider", async () => {
    const evmProvider = provider();
    const client: EmbeddedWalletClient = {
      connected: false,
      initModal: vi.fn(async () => undefined),
      connectModal: vi.fn(async () => evmProvider),
      logout: vi.fn(async () => undefined),
      switchChain: vi.fn(async () => undefined),
    };
    const controller = createEmbeddedWalletController(async () => client);

    await expect(controller.connect()).resolves.toBe(evmProvider);
    expect(client.initModal).toHaveBeenCalledTimes(1);
    expect(client.connectModal).toHaveBeenCalledTimes(1);
  });
});
