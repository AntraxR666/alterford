const BASE_SEPOLIA_CHAIN_ID = 84532;

export function deploymentRpcUrl(chainId, rpcUrl) {
  return chainId === BASE_SEPOLIA_CHAIN_ID ? "https://sepolia.base.org" : rpcUrl;
}

export function redactedRpcUrl(rpcUrl) {
  try {
    return new URL(rpcUrl).origin;
  } catch {
    return "[invalid RPC URL]";
  }
}
