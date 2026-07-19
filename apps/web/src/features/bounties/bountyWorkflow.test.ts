import { describe, expect, it } from "vitest";
import type { BountyDTO } from "@alterford/sdk";
import { bountyWorkflow, filterBountiesByMode } from "./bountyWorkflow";

const creator = "0x0000000000000000000000000000000000000001" as const;
const submitter = "0x0000000000000000000000000000000000000002" as const;
const observer = "0x0000000000000000000000000000000000000003" as const;

describe("bounty workflow model", () => {
  it("strictly partitions Vanilla and Underworld from indexed mode", () => {
    const vanilla = bounty({ id: "1", modeAffinity: "Vanilla" });
    const underworld = bounty({ id: "2", modeAffinity: "Underworld" });
    expect(filterBountiesByMode([vanilla, underworld], false).map((item) => item.id)).toEqual(["1"]);
    expect(filterBountiesByMode([vanilla, underworld], true).map((item) => item.id)).toEqual(["2"]);
  });

  it("guides a new participant to submit evidence, not accept or bet", () => {
    const model = bountyWorkflow(bounty(), observer, false, false, 1_000);
    expect(model.role).toBe("participant");
    expect(model.primaryAction).toBe("submit-evidence");
    expect(model.instruction).toMatch(/foto.*enlace.*entrega/i);
  });

  it("shows a previous submitter that the evidence can be replaced before close", () => {
    const model = bountyWorkflow(bounty({
      submissions: [{ submitter, submissionHash: "0xproof", evidenceURI: "ipfs://proof" }],
    }), submitter, false, false, 1_000);
    expect(model.role).toBe("submitter");
    expect(model.primaryAction).toBe("update-evidence");
  });

  it("does not invite the creator to submit to their own bounty", () => {
    const model = bountyWorkflow(bounty(), creator, false, false, 1_000);
    expect(model.role).toBe("creator");
    expect(model.primaryAction).toBeNull();
    expect(model.headline).toMatch(/esperando entregas/i);
  });

  it("allows only the resolver to select a winner after close", () => {
    const closed = bounty({ deadline: "500" });
    expect(bountyWorkflow(closed, observer, true, false, 1_000).primaryAction).toBe("resolve");
    expect(bountyWorkflow(closed, submitter, false, false, 1_000).primaryAction).toBeNull();
  });
});

function bounty(overrides: Partial<BountyDTO> = {}): BountyDTO {
  return {
    id: "4",
    chainId: 84532,
    address: "0x0000000000000000000000000000000000000010",
    creator,
    settlementToken: "0x0000000000000000000000000000000000000020",
    title: "Publicar la mejor fotografia",
    description: "Entrega una fotografia verificable.",
    rewardPool: 5_000_000n,
    rewardEscrow: 5_000_000n,
    deadline: "2000",
    state: "Open",
    metadataURI: "alterford://bounty",
    rulesHash: "0xrules",
    modeAffinity: "Vanilla",
    ...overrides,
  };
}
