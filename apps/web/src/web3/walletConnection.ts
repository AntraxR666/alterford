export interface WalletConnectorLike {
  id: string;
  name: string;
}

interface InjectedWalletProvider {
  isMetaMask?: boolean;
  isRabby?: boolean;
  isBinance?: boolean;
  isBinanceChain?: boolean;
  isBraveWallet?: boolean;
  providers?: InjectedWalletProvider[];
}

export function selectMetaMaskConnector<T extends WalletConnectorLike>(connectors: readonly T[]): T | undefined {
  return (
    connectors.find((connector) => {
      const id = connector.id.toLowerCase();
      return id === "metamask" || id === "io.metamask" || id === "metamasksdk";
    }) ??
    connectors.find((connector) => connector.name.toLowerCase().includes("metamask")) ??
    connectors.find((connector) => {
      const id = connector.id.toLowerCase();
      return id === "injected" || connector.name.toLowerCase().includes("injected");
    })
  );
}

export function selectWalletConnectConnector<T extends WalletConnectorLike>(connectors: readonly T[]): T | undefined {
  return connectors.find((connector) => connector.id.toLowerCase().includes("walletconnect"))
    ?? connectors.find((connector) => connector.name.toLowerCase().includes("walletconnect"));
}

export function hasMetaMaskProvider(provider: InjectedWalletProvider | undefined): boolean {
  if (!provider) return false;
  const candidates = provider.providers?.length ? provider.providers : [provider];
  return candidates.some((candidate) => Boolean(
    candidate.isMetaMask
      && !candidate.isRabby
      && !candidate.isBinance
      && !candidate.isBinanceChain
      && !candidate.isBraveWallet,
  ));
}

export async function connectionWithTimeout<T>(operation: Promise<T>, timeoutMs = 45_000): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error("La wallet no respondio. Cierra solicitudes antiguas y vuelve a intentar.")),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
