// @vitest-environment node

import { describe, expect, it } from "vitest";
import { staticBuildEnvironment } from "./build-web-static.mjs";
import {
  assertStableRelease,
  resolveIrysConfig,
  resolvePinningConfig,
  safeErrorMessage,
} from "./web-deploy-config.mjs";

describe("decentralized web deployment configuration", () => {
  it("isolates static releases from local Vite environment values", () => {
    expect(staticBuildEnvironment({
      VITE_CHAIN_ID: "31337",
      VITE_LOCAL_RPC_URL: "http://127.0.0.1:8545",
      VITE_INDEXER_URL: "http://127.0.0.1:8787",
      VITE_BASE_SEPOLIA_RPC_URL: "https://base.example/rpc",
    })).toMatchObject({
      VITE_CHAIN_ID: "84532",
      VITE_LOCAL_RPC_URL: "",
      VITE_INDEXER_URL: "",
      VITE_BASE_SEPOLIA_RPC_URL: "https://base.example/rpc",
    });
  });

  it("keeps explicitly configured public static release endpoints", () => {
    expect(staticBuildEnvironment({
      VITE_CHAIN_ID: "84532",
      VITE_INDEXER_URL: "https://indexer.alterford.example",
    })).toMatchObject({
      VITE_CHAIN_ID: "84532",
      VITE_LOCAL_RPC_URL: "",
      VITE_INDEXER_URL: "https://indexer.alterford.example",
    });
  });

  it("selects Pinata through provider-agnostic environment variables", () => {
    expect(resolvePinningConfig({
      PINNING_PROVIDER: "pinata",
      PINNING_TOKEN: "pinata-token",
      PINNING_API_URL: "https://pin.example/upload",
    })).toEqual({
      provider: "pinata",
      token: "pinata-token",
      apiUrl: "https://pin.example/upload",
      projectId: undefined,
    });
  });

  it("selects Fleek through the same generic token plus its project id", () => {
    expect(resolvePinningConfig({
      PINNING_PROVIDER: "fleek",
      PINNING_TOKEN: "fleek-token",
      PINNING_PROJECT_ID: "project-id",
    })).toMatchObject({ provider: "fleek", token: "fleek-token", projectId: "project-id" });
  });

  it.each([
    [{}, /PINNING_PROVIDER/],
    [{ PINNING_PROVIDER: "other", PINNING_TOKEN: "token" }, /pinata\|fleek/],
    [{ PINNING_PROVIDER: "pinata" }, /PINNING_TOKEN/],
    [{ PINNING_PROVIDER: "fleek", PINNING_TOKEN: "token" }, /PINNING_PROJECT_ID/],
  ])("rejects incomplete IPFS configuration", (env, error) => {
    expect(() => resolvePinningConfig(env)).toThrow(error);
  });

  it("allows Irys only for explicitly stable releases", () => {
    expect(() => assertStableRelease({ RELEASE_CHANNEL: "stable" })).not.toThrow();
    expect(() => assertStableRelease({ RELEASE_CHANNEL: "preview" })).toThrow(/stable/i);
    expect(() => assertStableRelease({})).toThrow(/stable/i);
  });

  it("uses generic Irys variables without accepting an empty wallet", () => {
    expect(resolveIrysConfig({
      RELEASE_CHANNEL: "stable",
      IRYS_TOKEN: "ethereum",
      IRYS_PRIVATE_KEY: "secret-wallet",
      IRYS_RPC_URL: "https://rpc.example",
    })).toEqual({
      token: "ethereum",
      privateKey: "secret-wallet",
      rpcUrl: "https://rpc.example",
      network: "mainnet",
    });
    expect(() => resolveIrysConfig({ RELEASE_CHANNEL: "stable", IRYS_TOKEN: "ethereum" })).toThrow(/IRYS_PRIVATE_KEY/);
  });

  it("redacts deployment credentials from provider errors", () => {
    const message = safeErrorMessage(
      new Error("upload rejected token=pinata-secret wallet=wallet-secret"),
      { PINNING_TOKEN: "pinata-secret", IRYS_PRIVATE_KEY: "wallet-secret" },
    );
    expect(message).toBe("upload rejected token=[REDACTED] wallet=[REDACTED]");
  });
});
