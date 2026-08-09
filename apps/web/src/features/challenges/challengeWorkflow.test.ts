import { describe, expect, it } from "vitest";
import type { ChallengeDTO } from "@alterford/sdk";
import { challengeWorkflow, filterChallengesByMode } from "./challengeWorkflow";

const creator = "0x0000000000000000000000000000000000000001" as const;
const executor = "0x0000000000000000000000000000000000000002" as const;
const observer = "0x0000000000000000000000000000000000000003" as const;

describe("challenge workflow model", () => {
  it("keeps Vanilla and Underworld challenges in separate cohorts", () => {
    const vanilla = challenge({ id: "1", modeAffinity: "Vanilla" });
    const underworld = challenge({ id: "2", modeAffinity: "Underworld" });

    expect(filterChallengesByMode([vanilla, underworld], false).map((item) => item.id)).toEqual(["1"]);
    expect(filterChallengesByMode([vanilla, underworld], true).map((item) => item.id)).toEqual(["2"]);
  });

  it("guides another account through accepting an open challenge", () => {
    const model = challengeWorkflow(challenge({ state: "Open" }), observer, false, 1_000);
    expect(model.role).toBe("participant");
    expect(model.currentStep).toBe(0);
    expect(model.primaryAction).toBe("accept");
    expect(model.instruction).toMatch(/autoriza.*bond.*acepta/i);
  });

  it("tells the creator to wait after publishing", () => {
    const model = challengeWorkflow(challenge({ state: "Open" }), creator, false, 1_000);
    expect(model.role).toBe("creator");
    expect(model.primaryAction).toBeNull();
    expect(model.headline).toMatch(/esperando.*ejecutor/i);
  });

  it("allows only the executor to submit evidence before the deadline", () => {
    const accepted = challenge({ state: "Accepted", executor, deadline: "2000" });
    expect(challengeWorkflow(accepted, executor, false, 1_000).primaryAction).toBe("submit-evidence");
    expect(challengeWorkflow(accepted, creator, false, 1_000).primaryAction).toBeNull();
    expect(challengeWorkflow(accepted, observer, false, 1_000).primaryAction).toBeNull();
  });

  it("shows confirmation only to the participant who did not propose", () => {
    const review = challenge({
      state: "Review",
      executor,
      resolutionProposal: {
        proposer: executor,
        executorSucceeded: true,
        evidenceHash: "0xevidence",
        disputeDeadline: "3000",
      },
    });
    expect(challengeWorkflow(review, creator, false, 2_000).primaryAction).toBe("review-proposal");
    expect(challengeWorkflow(review, executor, false, 2_000).primaryAction).toBeNull();
    expect(challengeWorkflow(review, observer, false, 2_000).primaryAction).toBeNull();
  });

  it("gives final disputed resolution only to the arbiter", () => {
    const disputed = challenge({ state: "Disputed", executor });
    expect(challengeWorkflow(disputed, observer, true, 2_000).primaryAction).toBe("resolve-dispute");
    expect(challengeWorkflow(disputed, creator, false, 2_000).primaryAction).toBeNull();
  });

  it("guides performer offers through sponsor funding and performer evidence", () => {
    const openOffer = challenge({
      fundingModel: "PerformerOffer",
      performer: creator,
      sponsor: undefined,
      rewardEscrowed: false,
    });
    expect(challengeWorkflow(openOffer, creator, false, 1_000)).toMatchObject({
      role: "performer",
      primaryAction: null,
    });
    expect(challengeWorkflow(openOffer, observer, false, 1_000).instruction).toMatch(/financia.*recompensa/i);

    const acceptedOffer = challenge({
      state: "Accepted",
      fundingModel: "PerformerOffer",
      performer: creator,
      sponsor: executor,
      executor,
      rewardEscrowed: true,
    });
    expect(challengeWorkflow(acceptedOffer, creator, false, 1_000).primaryAction).toBe("submit-evidence");
    expect(challengeWorkflow(acceptedOffer, executor, false, 1_000).primaryAction).toBeNull();
  });
});

function challenge(overrides: Partial<ChallengeDTO>): ChallengeDTO {
  return {
    id: "7",
    chainId: 84532,
    address: "0x0000000000000000000000000000000000000010",
    creator,
    title: "Completar una entrega verificable",
    description: "Publicar evidencia antes del cierre.",
    rewardPool: 5_000_000n,
    deadline: "2000",
    state: "Open",
    riskLevel: "Low",
    ...overrides,
  };
}
