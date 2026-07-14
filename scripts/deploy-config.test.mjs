// @vitest-environment node

import { describe, expect, it } from "vitest";
import { deploymentRpcUrl, redactedRpcUrl } from "./deploy-config.mjs";

describe("deployment artifact RPC handling", () => {
  it("does not persist credential-bearing Base Sepolia RPC endpoints", () => {
    expect(deploymentRpcUrl(84532, "https://example.quiknode.pro/private-token/"))
      .toBe("https://sepolia.base.org");
  });

  it("preserves local RPC endpoints for reproducible Anvil deployments", () => {
    expect(deploymentRpcUrl(31337, "http://127.0.0.1:9545"))
      .toBe("http://127.0.0.1:9545");
  });

  it("redacts credential-bearing RPC paths from diagnostic output", () => {
    expect(redactedRpcUrl("https://example.quiknode.pro/private-token/"))
      .toBe("https://example.quiknode.pro");
  });
});
