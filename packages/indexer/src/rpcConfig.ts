const BASE_SEPOLIA_PUBLIC_RPC = "https://sepolia.base.org";
const LOCAL_RPC = "http://127.0.0.1:8545";

export function resolveRpcUrls(
  env: Partial<Pick<NodeJS.ProcessEnv, "RPC_URL" | "RPC_URLS">>,
  chainId: number,
): string[] {
  const configured = [
    ...(env.RPC_URLS ?? "").split(","),
    env.RPC_URL ?? "",
  ].map((value) => value.trim()).filter(Boolean);

  if (chainId === 84532) configured.unshift(BASE_SEPOLIA_PUBLIC_RPC);
  if (configured.length === 0 && chainId === 31337) configured.push(LOCAL_RPC);

  const valid = [...new Set(configured)].filter(isHttpUrl);
  if (valid.length === 0) throw new Error("No valid HTTP RPC URL is configured for the indexer.");
  return valid;
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}
