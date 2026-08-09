import { describe, expect, it } from "vitest";
import { resolveRpcUrls } from "./rpcConfig";

describe("indexer RPC configuration", () => {
  it("prioritizes the Base Sepolia public endpoint and keeps configured fallbacks", () => {
    expect(resolveRpcUrls({
      RPC_URL: "https://primary.example",
      RPC_URLS: "https://primary.example, https://fallback.example",
    }, 84532)).toEqual([
      "https://sepolia.base.org",
      "https://primary.example",
      "https://fallback.example",
    ]);
  });

  it("keeps local development local", () => {
    expect(resolveRpcUrls({}, 31337)).toEqual(["http://127.0.0.1:8545"]);
  });

  it("drops invalid configured endpoints and keeps the Base Sepolia fallback", () => {
    expect(resolveRpcUrls({ RPC_URLS: "file:///tmp/node" }, 84532)).toEqual([
      "https://sepolia.base.org",
    ]);
  });
});
