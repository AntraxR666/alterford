import { createConnector, type CreateConnectorFn } from "wagmi";
import { getAddress, type Address, type Chain } from "viem";

export interface EmbeddedProvider {
  request(args: { method: string; params?: readonly unknown[] | object }): Promise<unknown>;
  on?(event: string, listener: (...args: unknown[]) => void): void;
  removeListener?(event: string, listener: (...args: unknown[]) => void): void;
}

export interface EmbeddedWalletClient {
  readonly connected: boolean;
  readonly connection?: { ethereumProvider: EmbeddedProvider | null } | null;
  init(): Promise<void>;
  connect(): Promise<{ ethereumProvider: EmbeddedProvider | null } | null>;
  logout(options?: { cleanup: boolean }): Promise<void>;
  switchChain(params: { chainId: string }): Promise<void>;
}

export interface EmbeddedWalletController {
  connect(): Promise<EmbeddedProvider>;
  disconnect(): Promise<void>;
  restore(): Promise<EmbeddedProvider | null>;
  switchChain(chainId: number): Promise<void>;
  provider(): EmbeddedProvider | null;
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
      await client.init();
      return client;
    });
    return initialization;
  }

  return {
    async connect() {
      if (activeProvider) return activeProvider;
      const client = await initializedClient();
      const connection = client.connected && client.connection
        ? client.connection
        : await client.connect();
      if (!connection?.ethereumProvider) {
        throw new Error("Web3Auth no devolvio una wallet EVM.");
      }
      activeProvider = connection.ethereumProvider;
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
      activeProvider = client.connected ? client.connection?.ethereumProvider ?? null : null;
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
