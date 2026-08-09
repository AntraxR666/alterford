// @vitest-environment node

import { describe, expect, it } from "vitest";
import {
  contractsMissingFromReuse,
  deploymentRpcUrl,
  indexFoundryContractCreations,
  redactedRpcUrl,
} from "./deploy-config.mjs";

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

describe("Foundry broadcast contract selection", () => {
  it("records a newly deployed settlement token while excluding reused contracts", () => {
    const selected = contractsMissingFromReuse({
      creationBondPolicy: { address: "0x0000000000000000000000000000000000000001" },
    });

    expect(selected).toContainEqual(["settlementToken", "MockSettlementToken"]);
    expect(selected).not.toContainEqual(["creationBondPolicy", "CreationBondPolicy"]);
  });

  it("keeps the CREATE transaction when a later configuration call targets the same contract", () => {
    const selected = indexFoundryContractCreations([
      {
        contractName: "BountyFactory",
        contractAddress: "0x0000000000000000000000000000000000000001",
        transactionType: "CREATE",
        hash: "0xcreate",
      },
      {
        contractName: "BountyFactory",
        contractAddress: "0x0000000000000000000000000000000000000001",
        transactionType: "CALL",
        hash: "0xconfigure",
      },
    ]);

    expect(selected.get("BountyFactory")?.hash).toBe("0xcreate");
  });
});
