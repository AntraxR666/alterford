import { describe, expect, expectTypeOf, it } from "vitest";
import type { BountyDTO, BountyState, ChallengeDTO, ChallengeState, RiskLevel } from "./types.js";

describe("phase 1 resilience SDK types", () => {
  it("includes emergency bounty recovery and disputed challenges", () => {
    const bountyState: BountyState = "EmergencyRecovered";
    const challengeState: ChallengeState = "Disputed";

    expect(bountyState).toBe("EmergencyRecovered");
    expect(challengeState).toBe("Disputed");
  });

  it("exposes bounty DTOs and challenge risk level", () => {
    expectTypeOf<BountyDTO["state"]>().toEqualTypeOf<BountyState>();
    expectTypeOf<ChallengeDTO["riskLevel"]>().toEqualTypeOf<RiskLevel>();
  });
});
