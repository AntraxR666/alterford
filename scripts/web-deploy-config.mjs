const defaultPinataApiUrl = "https://api.pinata.cloud/pinning/pinFileToIPFS";

export function resolvePinningConfig(env = process.env) {
  const provider = env.PINNING_PROVIDER;
  if (!provider) throw new Error("PINNING_PROVIDER is required (pinata|fleek).");
  if (provider !== "pinata" && provider !== "fleek") {
    throw new Error("PINNING_PROVIDER must be pinata|fleek.");
  }

  const token = env.PINNING_TOKEN;
  if (!token) throw new Error("PINNING_TOKEN is required.");

  const projectId = env.PINNING_PROJECT_ID || undefined;
  if (provider === "fleek" && !projectId) {
    throw new Error("PINNING_PROJECT_ID is required for Fleek.");
  }

  return {
    provider,
    token,
    apiUrl: env.PINNING_API_URL || (provider === "pinata" ? defaultPinataApiUrl : undefined),
    projectId,
  };
}

export function assertStableRelease(env = process.env) {
  if (env.RELEASE_CHANNEL !== "stable") {
    throw new Error("Arweave publication is restricted to RELEASE_CHANNEL=stable.");
  }
}

export function resolveIrysConfig(env = process.env) {
  assertStableRelease(env);
  if (!env.IRYS_PRIVATE_KEY) throw new Error("IRYS_PRIVATE_KEY is required.");
  return {
    token: env.IRYS_TOKEN || "ethereum",
    privateKey: env.IRYS_PRIVATE_KEY,
    rpcUrl: env.IRYS_RPC_URL || undefined,
    network: env.IRYS_NETWORK || "mainnet",
  };
}

export function safeErrorMessage(error, env = process.env) {
  let message = error instanceof Error ? error.message : String(error);
  for (const name of ["PINNING_TOKEN", "IRYS_PRIVATE_KEY", "PINATA_JWT", "FLEEK_API_KEY"]) {
    const secret = env[name];
    if (secret) message = message.replaceAll(secret, "[REDACTED]");
  }
  return message;
}
