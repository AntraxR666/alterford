import { http, createConfig } from "wagmi";
import { injected, walletConnect } from "wagmi/connectors";
import { arbitrum, base, baseSepolia, optimism, polygon } from "wagmi/chains";

export const anvil = {
  id: 31337,
  name: "Anvil",
  nativeCurrency: { decimals: 18, name: "Ether", symbol: "ETH" },
  rpcUrls: {
    default: {
      http: [
        import.meta.env.VITE_LOCAL_RPC_URL
          || (import.meta.env.DEV ? "http://127.0.0.1:8545" : "https://sepolia.base.org"),
      ],
    },
  },
} as const;

export const supportedChains = [baseSepolia, anvil, base, arbitrum, polygon, optimism] as const;
export const targetChain =
  supportedChains.find((chain) => chain.id === Number(import.meta.env.VITE_CHAIN_ID || "84532")) ??
  baseSepolia;

const walletConnectProjectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID;
const appUrl = import.meta.env.VITE_APP_URL || globalThis.location?.origin || "https://alterford.invalid";
const connectors = [
  injected(),
  ...(walletConnectProjectId
    ? [
        walletConnect({
          projectId: walletConnectProjectId,
          showQrModal: true,
          metadata: {
            name: "Alterford",
            description: "No-house-risk prediction markets on Base.",
            url: appUrl,
            icons: [`${appUrl}/icon.png`],
          },
        }),
      ]
    : []),
];

export const wagmiConfig = createConfig({
  chains: supportedChains,
  connectors,
  transports: {
    [baseSepolia.id]: http(import.meta.env.VITE_BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org"),
    [anvil.id]: http(anvil.rpcUrls.default.http[0]),
    [base.id]: http(),
    [arbitrum.id]: http(),
    [polygon.id]: http(),
    [optimism.id]: http(),
  },
});
