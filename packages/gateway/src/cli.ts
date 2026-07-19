import { isAbsolute } from "node:path";
import { createPublicClient, http, isAddress, isHex, type Address, type Hex } from "viem";
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
import { CryptoLedger } from "./cryptoLedger.js";
import { atomicCryptoLedgerWriter, loadCryptoLedgerSnapshot } from "./cryptoLedgerFile.js";
import { MoneroWalletRpcClient } from "./moneroRpc.js";
import { MoneroService } from "./moneroService.js";
import { XmrConversionLedger } from "./xmrConversion.js";
import { atomicXmrConversionWriter, loadXmrConversionSnapshot } from "./xmrConversionLedger.js";
import { SideShiftXmrProvider } from "./xmrProviders.js";
import { ViemBaseSettlementVerifier } from "./baseSettlementVerifier.js";
import { XmrConversionService } from "./xmrConversionService.js";
import {
  DEFAULT_EVIDENCE_MAX_BYTES,
  EVIDENCE_IMAGE_TYPES,
  EvidencePinningService,
  FleekEvidencePinner,
  PinataEvidencePinner,
} from "./evidencePinning.js";

const chainId = numberEnv("CHAIN_ID", 84532);
const challengeFactory = addressEnv("CHALLENGE_FACTORY_ADDRESS");
const forwarder = addressEnv("ALTERFORD_FORWARDER_ADDRESS");
const configuredRpcUrl = process.env.RPC_URL || process.env.BASE_MAINNET_RPC_URL || process.env.BASE_SEPOLIA_RPC_URL;
if (chainId === base.id && !configuredRpcUrl) {
  throw new Error("RPC_URL or BASE_MAINNET_RPC_URL is required for Base Mainnet.");
}
const rpcUrl = configuredRpcUrl || "https://sepolia.base.org";
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
const monero = moneroProvider();
const xmrConversion = xmrConversionProvider();
const evidencePinning = evidencePinningProvider();
if (monero && xmrConversion) {
  throw new Error("Native Monero custody and XMR conversion modes cannot be enabled together.");
}
const moneroSyncIntervalMs = numberEnv("MONERO_SYNC_INTERVAL_MS", 30_000);
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

const server = startGatewayServer({
  prepareRelay: service.prepareRelay.bind(service),
  submitRelay: service.submitRelay.bind(service),
  relayStatus: service.relayStatus.bind(service),
  createFiatSession: service.createFiatSession.bind(service),
  ...(monero
    ? {
        createMoneroDeposit: monero.createDeposit.bind(monero),
        moneroDeposit: monero.deposit.bind(monero),
        syncMoneroDeposits: monero.syncDeposits.bind(monero),
        moneroWithdrawalNonce: monero.withdrawalNonce.bind(monero),
        submitMoneroWithdrawal: monero.submitWithdrawal.bind(monero),
      }
    : {}),
  ...(xmrConversion
    ? {
        xmrCapabilities: xmrConversion.capabilities.bind(xmrConversion),
        createXmrQuote: xmrConversion.createQuote.bind(xmrConversion),
        createXmrConversion: xmrConversion.createConversion.bind(xmrConversion),
        syncXmrConversion: xmrConversion.syncConversion.bind(xmrConversion),
        xmrAssistanceCase: xmrConversion.assistanceCase.bind(xmrConversion),
      }
    : {}),
  ...(evidencePinning
    ? { pinEvidence: evidencePinning.pinImage.bind(evidencePinning) }
    : {}),
}, {
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
    monero: monero?.capabilities(),
    xmrConversion: xmrConversion
      ? {
          enabled: true,
          provider: "sideshift",
          assistedThresholdMinor: bigintEnv("XMR_ASSISTED_THRESHOLD_MINOR", 1_500_000_000n).toString(),
          settlementChainId: chainId,
        }
      : undefined,
    evidenceUploads: evidencePinning
      ? {
          enabled: true,
          maxBytes: evidencePinning.maxBytes,
          mimeTypes: EVIDENCE_IMAGE_TYPES,
        }
      : undefined,
  },
  operatorSyncToken: process.env.MONERO_SYNC_TOKEN?.trim(),
  xmrOperatorToken: process.env.XMR_OPERATOR_TOKEN?.trim(),
  evidenceUploadMaxBytes: evidencePinning?.maxBytes,
});

const moneroSyncTimer = monero
  ? setInterval(() => {
      monero.syncDeposits().catch((error) => {
        console.error(JSON.stringify({
          level: "error",
          event: "monero_sync_failed",
          message: error instanceof Error ? error.message : "Unknown Monero synchronization error.",
        }));
      });
    }, moneroSyncIntervalMs)
  : undefined;
moneroSyncTimer?.unref();

console.log(JSON.stringify({
  level: "info",
  event: "gateway_started",
  port: numberEnv("PORT", 8790),
  chainId,
  relayEnabled: relayProvider !== "disabled",
  relayProvider,
  fiatEnabled: Boolean(transak),
  moneroEnabled: Boolean(monero),
  xmrConversionEnabled: Boolean(xmrConversion),
  evidenceUploadsEnabled: Boolean(evidencePinning),
  moneroNetwork: monero?.capabilities().network,
  moneroWithdrawalsEnabled: monero?.capabilities().withdrawalsEnabled ?? false,
  moneroSyncIntervalMs: monero ? moneroSyncIntervalMs : undefined,
  ledgerPath,
}));

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    if (moneroSyncTimer) clearInterval(moneroSyncTimer);
    server.close(() => process.exit(0));
  });
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

function moneroProvider() {
  const rpcUrl = process.env.MONERO_RPC_URL?.trim();
  if (!rpcUrl) return undefined;
  const gatewayId = process.env.MONERO_GATEWAY_ID?.trim();
  const syncToken = process.env.MONERO_SYNC_TOKEN?.trim();
  if (!gatewayId || !isHex(gatewayId) || gatewayId.length !== 66) {
    throw new Error("MONERO_GATEWAY_ID must be a bytes32 hex value when Monero is enabled.");
  }
  if (!syncToken || syncToken.length < 24) {
    throw new Error("MONERO_SYNC_TOKEN must contain at least 24 characters when Monero is enabled.");
  }
  const username = process.env.MONERO_RPC_USERNAME?.trim();
  const password = process.env.MONERO_RPC_PASSWORD?.trim();
  if (Boolean(username) !== Boolean(password)) {
    throw new Error("MONERO_RPC_USERNAME and MONERO_RPC_PASSWORD must be configured together.");
  }
  const network = moneroNetwork(process.env.MONERO_NETWORK);
  const cryptoLedgerPath = process.env.MONERO_LEDGER_PATH || "data/monero-ledger.json";
  return new MoneroService({
    rpc: new MoneroWalletRpcClient({
      rpcUrl,
      accountIndex: nonNegativeNumberEnv("MONERO_ACCOUNT_INDEX", 0),
      username,
      password,
    }),
    ledger: new CryptoLedger(
      loadCryptoLedgerSnapshot(cryptoLedgerPath),
      atomicCryptoLedgerWriter(cryptoLedgerPath),
    ),
    chainId,
    gatewayId: gatewayId as Hex,
    network,
    minimumConfirmations: numberEnv("MONERO_MIN_CONFIRMATIONS", 10),
    withdrawalsEnabled: process.env.MONERO_WITHDRAWALS_ENABLED === "true",
  });
}

function xmrConversionProvider() {
  const requested = process.env.XMR_CONVERSION_PROVIDER?.trim().toLowerCase() || "disabled";
  if (requested === "disabled") return undefined;
  if (requested !== "sideshift") throw new Error(`Unsupported XMR_CONVERSION_PROVIDER: ${requested}.`);
  if (chainId !== base.id) {
    throw new Error("Real XMR conversion can only be enabled with Base Mainnet settlement.");
  }
  const accountId = process.env.XMR_PROVIDER_ACCOUNT_ID?.trim();
  const secret = process.env.XMR_PROVIDER_SECRET?.trim();
  if (!accountId || !secret) {
    throw new Error("XMR_PROVIDER_ACCOUNT_ID and XMR_PROVIDER_SECRET are required for XMR conversion.");
  }
  const operatorToken = process.env.XMR_OPERATOR_TOKEN?.trim();
  if (!operatorToken || operatorToken.length < 24) {
    throw new Error("XMR_OPERATOR_TOKEN must contain at least 24 characters when XMR conversion is enabled.");
  }
  const token = addressEnv("XMR_SETTLEMENT_TOKEN_ADDRESS");
  const conversionLedgerPath = process.env.XMR_CONVERSION_LEDGER_PATH?.trim();
  if (!conversionLedgerPath || !isAbsolute(conversionLedgerPath)) {
    throw new Error("XMR_CONVERSION_LEDGER_PATH must be an absolute path on durable storage.");
  }
  return new XmrConversionService({
    chainId,
    assistedThresholdMinor: bigintEnv("XMR_ASSISTED_THRESHOLD_MINOR", 1_500_000_000n),
    provider: new SideShiftXmrProvider({
      baseUrl: process.env.XMR_PROVIDER_BASE_URL || "https://sideshift.ai/api/v2",
      accountId,
      secret,
    }),
    verifier: new ViemBaseSettlementVerifier(publicClient as never, {
      chainId,
      token,
      confirmations: numberEnv("XMR_SETTLEMENT_CONFIRMATIONS", 12),
    }),
    ledger: new XmrConversionLedger(
      loadXmrConversionSnapshot(conversionLedgerPath),
      atomicXmrConversionWriter(conversionLedgerPath),
    ),
  });
}

function evidencePinningProvider() {
  const provider = (
    process.env.EVIDENCE_PINNING_PROVIDER
      || process.env.PINNING_PROVIDER
      || "disabled"
  ).trim().toLowerCase();
  const token = (process.env.EVIDENCE_PINNING_TOKEN || process.env.PINNING_TOKEN)?.trim();
  if (provider === "disabled" && !token) return undefined;
  if (!token) throw new Error("EVIDENCE_PINNING_TOKEN or PINNING_TOKEN is required for evidence uploads.");
  const maxBytes = numberEnv("EVIDENCE_UPLOAD_MAX_BYTES", DEFAULT_EVIDENCE_MAX_BYTES);
  if (provider === "pinata") {
    return new EvidencePinningService(new PinataEvidencePinner({
      token,
      apiUrl: process.env.EVIDENCE_PINNING_API_URL || process.env.PINNING_API_URL,
    }), maxBytes);
  }
  if (provider === "fleek") {
    const projectId = (
      process.env.EVIDENCE_PINNING_PROJECT_ID
        || process.env.PINNING_PROJECT_ID
    )?.trim();
    if (!projectId) throw new Error("EVIDENCE_PINNING_PROJECT_ID or PINNING_PROJECT_ID is required for Fleek.");
    return new EvidencePinningService(new FleekEvidencePinner({ token, projectId }), maxBytes);
  }
  throw new Error("EVIDENCE_PINNING_PROVIDER must be pinata, fleek or disabled.");
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

function nonNegativeNumberEnv(name: string, fallback: number) {
  const parsed = Number(process.env[name] ?? fallback);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`${name} must be a non-negative integer.`);
  }
  return parsed;
}

function bigintEnv(name: string, fallback: bigint) {
  const value = process.env[name]?.trim() || fallback.toString();
  if (!/^\d+$/.test(value) || BigInt(value) <= 0n) throw new Error(`${name} must be a positive integer.`);
  return BigInt(value);
}

function moneroNetwork(value?: string): "mainnet" | "stagenet" | "testnet" {
  const network = value?.trim().toLowerCase() || "stagenet";
  if (network === "mainnet" || network === "stagenet" || network === "testnet") return network;
  throw new Error("MONERO_NETWORK must be mainnet, stagenet or testnet.");
}
