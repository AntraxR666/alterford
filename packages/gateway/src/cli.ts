import { createPublicClient, http, isAddress, type Address } from "viem";
import { base, baseSepolia } from "viem/chains";
import {
  createBiconomyTestnetRelayAdapter,
  createGelatoRelayAdapter,
  ViemGatewayChain,
} from "./providers.js";
import { resolveRelayProvider } from "./relayConfig.js";
import { GatewayService, type RelayProvider } from "./service.js";
import { startGatewayServer } from "./server.js";
import { TransakProvider } from "./transak.js";
import { SponsorshipLedger } from "./ledger.js";
import { atomicLedgerWriter, loadLedgerSnapshot } from "./ledgerFile.js";

const chainId = numberEnv("CHAIN_ID", 84532);
const challengeFactory = addressEnv("CHALLENGE_FACTORY_ADDRESS");
const forwarder = addressEnv("ALTERFORD_FORWARDER_ADDRESS");
const rpcUrl = process.env.RPC_URL || process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org";
const chain = chainId === base.id ? base : baseSepolia;
if (chain.id !== chainId) throw new Error(`Unsupported gateway chain ${chainId}.`);

const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });
const gelatoKey = process.env.GELATO_API_KEY?.trim();
const relayProvider = resolveRelayProvider({
  chainId,
  provider: process.env.RELAY_PROVIDER,
  gelatoKey,
});
const relay: RelayProvider = relayProvider === "biconomy"
  ? await createBiconomyTestnetRelayAdapter(rpcUrl)
  : relayProvider === "gelato"
    ? createGelatoRelayAdapter(gelatoKey!, chainId !== base.id)
    : disabledRelay();
const transak = transakProvider();
const sponsorshipConfig = {
  globalDailyLimit: numberEnv("RELAY_GLOBAL_DAILY_LIMIT", 10_000),
  walletDailyLimit: numberEnv("RELAY_WALLET_DAILY_LIMIT", 20),
  ipHourlyLimit: numberEnv("RELAY_IP_HOURLY_LIMIT", 100),
};
const ledgerPath = process.env.GATEWAY_LEDGER_PATH || "data/sponsorship-ledger.json";
const service = new GatewayService({
  config: {
    chainId,
    challengeFactory,
    forwarder,
    requestTtlSeconds: numberEnv("RELAY_REQUEST_TTL_SECONDS", 600),
    maxCalldataBytes: numberEnv("RELAY_MAX_CALLDATA_BYTES", 4096),
    ...sponsorshipConfig,
  },
  chain: new ViemGatewayChain(publicClient as never, forwarder),
  relay,
  fiat: transak,
  ledger: new SponsorshipLedger(
    sponsorshipConfig,
    loadLedgerSnapshot(ledgerPath),
    atomicLedgerWriter(ledgerPath),
  ),
});

const server = startGatewayServer(service, {
  port: numberEnv("PORT", 8790),
  allowedOrigins: (process.env.GATEWAY_ALLOWED_ORIGINS || "http://127.0.0.1:5173,http://localhost:5173")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
  publicConfig: {
    chainId,
    challengeFactory,
    forwarder,
    relayEnabled: relayProvider !== "disabled",
    fiatEnabled: Boolean(transak),
  },
});

console.log(JSON.stringify({
  level: "info",
  event: "gateway_started",
  port: numberEnv("PORT", 8790),
  chainId,
  relayEnabled: relayProvider !== "disabled",
  relayProvider,
  fiatEnabled: Boolean(transak),
  ledgerPath,
}));

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => server.close(() => process.exit(0)));
}

function transakProvider() {
  const apiKey = process.env.TRANSAK_API_KEY?.trim();
  const apiSecret = process.env.TRANSAK_API_SECRET?.trim();
  const referrerDomain = process.env.TRANSAK_REFERRER_DOMAIN?.trim();
  if (!apiKey && !apiSecret && !referrerDomain) return undefined;
  if (!apiKey || !apiSecret || !referrerDomain) {
    throw new Error("TRANSAK_API_KEY, TRANSAK_API_SECRET and TRANSAK_REFERRER_DOMAIN must be configured together.");
  }
  return new TransakProvider({
    apiKey,
    apiSecret,
    referrerDomain,
    environment: process.env.TRANSAK_ENVIRONMENT === "production" ? "production" : "staging",
  });
}

function disabledRelay(): RelayProvider {
  return {
    submit: async () => { throw new Error("Transaction sponsorship is not configured."); },
    status: async () => ({ state: "failed" }),
  };
}

function addressEnv(name: string): Address {
  const value = process.env[name];
  if (!value || !isAddress(value)) throw new Error(`${name} must be a valid address.`);
  return value;
}

function numberEnv(name: string, fallback: number) {
  const parsed = Number(process.env[name] || fallback);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new Error(`${name} must be a positive integer.`);
  return parsed;
}
