import { createConnector, type CreateConnectorFn } from "wagmi";
import { getAddress, type Address, type Chain } from "viem";

export interface EmbeddedProvider {
  request(args: { method: string; params?: readonly unknown[] | object }): Promise<unknown>;
  on?(event: string, listener: (...args: unknown[]) => void): void;
  removeListener?(event: string, listener: (...args: unknown[]) => void): void;
}

export interface EmbeddedWalletClient {
  readonly connected: boolean;
  readonly provider?: EmbeddedProvider | null;
  readonly connection?: { ethereumProvider: EmbeddedProvider | null } | null;
  readonly cachedConnector?: string | null;
  init?(): Promise<void>;
  initModal?(): Promise<void>;
  connect?(): Promise<unknown>;
  connectModal?(): Promise<unknown>;
  logout(options?: { cleanup: boolean }): Promise<void>;
  switchChain(params: { chainId: string }): Promise<void>;
  on?(event: string, listener: (...args: unknown[]) => void): void;
  removeListener?(event: string, listener: (...args: unknown[]) => void): void;
}

export interface EmbeddedWalletController {
  connect(): Promise<EmbeddedProvider>;
  disconnect(): Promise<void>;
  restore(): Promise<EmbeddedProvider | null>;
  switchChain(chainId: number): Promise<void>;
  provider(): EmbeddedProvider | null;
}

export function extractProvider(candidate: unknown, client?: EmbeddedWalletClient | null): EmbeddedProvider | null {
  if (candidate && typeof (candidate as EmbeddedProvider).request === "function") {
    return candidate as EmbeddedProvider;
  }
  if (
    candidate &&
    typeof (candidate as { ethereumProvider?: EmbeddedProvider }).ethereumProvider?.request === "function"
  ) {
    return (candidate as { ethereumProvider: EmbeddedProvider }).ethereumProvider;
  }
  if (client?.provider && typeof client.provider.request === "function") {
    return client.provider;
  }
  if (
    client?.connection?.ethereumProvider &&
    typeof client.connection.ethereumProvider.request === "function"
  ) {
    return client.connection.ethereumProvider;
  }
  return null;
}

export function createEmbeddedWalletController(
  factory: () => Promise<EmbeddedWalletClient>,
): EmbeddedWalletController {
  let clientPromise: Promise<EmbeddedWalletClient> | null = null;
  let initialization: Promise<EmbeddedWalletClient> | null = null;
  let activeProvider: EmbeddedProvider | null = null;

  async function initializedClient() {
    clientPromise ??= factory();
    initialization ??= clientPromise.then(async (client) => {
      if (typeof client.initModal === "function") {
        await client.initModal();
      } else if (typeof client.init === "function") {
        await client.init();
      }
      return client;
    });
    return initialization;
  }

  return {
    async connect() {
      const client = await initializedClient();
      const existing = activeProvider ?? extractProvider(undefined, client);
      if (existing && (client.connected || Boolean(activeProvider))) {
        activeProvider = existing;
        return activeProvider;
      }
      const connectMethod = typeof client.connectModal === "function"
        ? client.connectModal.bind(client)
        : typeof client.connect === "function"
          ? client.connect.bind(client)
          : null;
      const res = connectMethod ? await connectMethod() : null;
      const provider = extractProvider(res, client);
      if (!provider) {
        throw new Error("Web3Auth no devolvio una wallet EVM.");
      }
      activeProvider = provider;
      return activeProvider;
    },
    async disconnect() {
      if (!clientPromise) return;
      const client = await clientPromise;
      await client.logout({ cleanup: true });
      activeProvider = null;
    },
    async restore() {
      const client = await initializedClient();
      if (!client.connected && client.cachedConnector) {
        await waitForCachedConnection(client);
      }
      activeProvider = client.connected ? extractProvider(undefined, client) : null;
      return activeProvider;
    },
    async switchChain(chainId) {
      const client = await initializedClient();
      await client.switchChain({ chainId: `0x${chainId.toString(16)}` });
    },
    provider() {
      return activeProvider;
    },
  };
}

function waitForCachedConnection(client: EmbeddedWalletClient): Promise<void> {
  const hasProvider = () => client.connected && Boolean(extractProvider(undefined, client));
  if (hasProvider()) return Promise.resolve();

  return new Promise((resolve) => {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let poll: ReturnType<typeof setInterval> | undefined;
    const finish = () => {
      if (timeout) clearTimeout(timeout);
      if (poll) clearInterval(poll);
      client.removeListener?.("connected", check);
      client.removeListener?.("authorized", check);
      client.removeListener?.("rehydration_error", finish);
      client.removeListener?.("errored", finish);
      resolve();
    };
    const check = () => {
      if (hasProvider()) finish();
    };

    client.on?.("connected", check);
    client.on?.("authorized", check);
    client.on?.("rehydration_error", finish);
    client.on?.("errored", finish);
    poll = setInterval(check, 25);
    timeout = setTimeout(finish, 15_000);
    check();
  });
}

async function accounts(provider: EmbeddedProvider): Promise<readonly Address[]> {
  const values = await provider.request({ method: "eth_accounts" });
  if (!Array.isArray(values)) return [];
  return values.map((value) => getAddress(String(value)));
}

async function providerChainId(provider: EmbeddedProvider): Promise<number> {
  const value = await provider.request({ method: "eth_chainId" });
  return Number(value);
}

export interface EmbeddedWalletOptions {
  clientId: string;
  network: "sapphire_devnet" | "sapphire_mainnet";
  chain: Chain;
  rpcUrl: string;
}

async function defaultClientFactory(options: EmbeddedWalletOptions): Promise<EmbeddedWalletClient> {
  const { CHAIN_NAMESPACES, WEB3AUTH_NETWORK, Web3Auth } = await import("@web3auth/modal");
  const network = options.network === "sapphire_mainnet"
    ? WEB3AUTH_NETWORK.SAPPHIRE_MAINNET
    : WEB3AUTH_NETWORK.SAPPHIRE_DEVNET;
  const web3Auth = new Web3Auth({
    clientId: options.clientId,
    web3AuthNetwork: network,
    chains: [{
      chainNamespace: CHAIN_NAMESPACES.EIP155,
      chainId: `0x${options.chain.id.toString(16)}`,
      rpcTarget: options.rpcUrl,
      displayName: options.chain.name,
      blockExplorerUrl: options.chain.blockExplorers?.default.url ?? "",
      ticker: options.chain.nativeCurrency.symbol,
      tickerName: options.chain.nativeCurrency.name,
      logo: "https://base.org/favicon.ico",
    }],
    defaultChainId: `0x${options.chain.id.toString(16)}`,
    uiConfig: {
      appName: "Alterford",
      mode: "auto",
    },
  });
  return web3Auth as unknown as EmbeddedWalletClient;
}

export function embeddedWallet(
  options: EmbeddedWalletOptions,
  factory: () => Promise<EmbeddedWalletClient> = () => defaultClientFactory(options),
): CreateConnectorFn<EmbeddedProvider> {
  const controller = createEmbeddedWalletController(factory);

  return createConnector((config) => {
    let activeProvider: EmbeddedProvider | null = null;
    const onAccountsChanged = (values: unknown) => {
      const normalized = Array.isArray(values)
        ? values.map((value) => getAddress(String(value)))
        : [];
      if (normalized.length === 0) config.emitter.emit("disconnect");
      else config.emitter.emit("change", { accounts: normalized });
    };
    const onChainChanged = (value: unknown) => {
      config.emitter.emit("change", { chainId: Number(value) });
    };
    const onDisconnect = () => config.emitter.emit("disconnect");

    function bind(provider: EmbeddedProvider | null) {
      if (activeProvider === provider) return;
      activeProvider?.removeListener?.("accountsChanged", onAccountsChanged);
      activeProvider?.removeListener?.("chainChanged", onChainChanged);
      activeProvider?.removeListener?.("disconnect", onDisconnect);
      activeProvider = provider;
      activeProvider?.on?.("accountsChanged", onAccountsChanged);
      activeProvider?.on?.("chainChanged", onChainChanged);
      activeProvider?.on?.("disconnect", onDisconnect);
    }

    return {
      id: "web3auth",
      name: "Email o red social",
      type: "web3auth",
      async connect<withCapabilities extends boolean = false>(parameters: {
        chainId?: number;
        isReconnecting?: boolean;
        withCapabilities?: withCapabilities | boolean;
      } = {}): Promise<{
        accounts: withCapabilities extends true
          ? readonly { address: Address; capabilities: Record<string, unknown> }[]
          : readonly Address[];
        chainId: number;
      }> {
        const provider = await controller.connect();
        bind(provider);
        if (parameters.chainId && parameters.chainId !== await providerChainId(provider)) {
          await controller.switchChain(parameters.chainId);
        }
        const connectedAccounts = await accounts(provider);
        const resultAccounts = parameters.withCapabilities
          ? connectedAccounts.map((address) => ({ address, capabilities: {} }))
          : connectedAccounts;
        return {
          accounts: resultAccounts as withCapabilities extends true
            ? readonly { address: Address; capabilities: Record<string, unknown> }[]
            : readonly Address[],
          chainId: await providerChainId(provider),
        };
      },
      async disconnect() {
        bind(null);
        await controller.disconnect();
      },
      async getAccounts() {
        const provider = controller.provider() ?? await controller.restore();
        return provider ? accounts(provider) : [];
      },
      async getChainId() {
        const provider = controller.provider() ?? await controller.restore();
        return provider ? providerChainId(provider) : options.chain.id;
      },
      async getProvider() {
        const provider = controller.provider() ?? await controller.restore();
        if (!provider) throw new Error("La wallet social no esta conectada.");
        return provider;
      },
      async isAuthorized() {
        const provider = controller.provider() ?? await controller.restore();
        if (!provider) return false;
        bind(provider);
        return (await accounts(provider)).length > 0;
      },
      async switchChain({ chainId }) {
        const chain = config.chains.find((item) => item.id === chainId);
        if (!chain) throw new Error(`La red ${chainId} no esta configurada.`);
        await controller.switchChain(chainId);
        return chain;
      },
      onAccountsChanged,
      onChainChanged(value) {
        onChainChanged(value);
      },
      onDisconnect,
    };
  }) as CreateConnectorFn<EmbeddedProvider>;
}
