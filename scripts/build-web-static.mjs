import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { runPnpm } from "./web-process.mjs";
import { auditDist } from "./web-preflight.mjs";

export async function buildStaticWeb({ run = runPnpm, distDir = resolve("apps", "web", "dist") } = {}) {
  await run(["--filter", "@alterford/web", "build"], staticBuildEnvironment(process.env));
  return auditDist(distDir);
}

export function staticBuildEnvironment(env = process.env) {
  return {
    ...env,
    VITE_CHAIN_ID: "84532",
    VITE_LOCAL_RPC_URL: "",
    VITE_BASE_SEPOLIA_RPC_URL: publicUrlOrFallback(
      env.VITE_BASE_SEPOLIA_RPC_URL,
      "https://sepolia.base.org",
    ),
    VITE_INDEXER_URL: publicUrlOrFallback(env.VITE_INDEXER_URL, ""),
    VITE_APP_URL: publicUrlOrFallback(env.VITE_APP_URL, ""),
  };
}

function publicUrlOrFallback(value, fallback) {
  if (!value) return fallback;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    const loopback = host === "localhost" || host === "0.0.0.0" || host === "::1" || host.startsWith("127.");
    return (url.protocol === "https:" || url.protocol === "http:") && !loopback ? value : fallback;
  } catch {
    return fallback;
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    console.log(JSON.stringify(await buildStaticWeb(), null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
