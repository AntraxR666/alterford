import { describe, expect, it } from "vitest";
import {
  challengeAcceptanceCost,
  challengeCreationCost,
  challengeCreationFunction,
} from "./challengeFunding";

describe("challenge funding model", () => {
  it("charges reward plus bond when a sponsor publishes a challenge", () => {
    expect(challengeCreationCost("Sponsored", 5_000_000n, 100_000_000n)).toBe(105_000_000n);
    expect(challengeAcceptanceCost("Sponsored", 5_000_000n, 100_000_000n)).toBe(5_000_000n);
  });

  it("charges only the bond when a performer publishes an offer", () => {
    expect(challengeCreationCost("PerformerOffer", 5_000_000n, 100_000_000n)).toBe(5_000_000n);
    expect(challengeAcceptanceCost("PerformerOffer", 5_000_000n, 100_000_000n)).toBe(100_000_000n);
  });

  it("selects the compatible contract entry point", () => {
    expect(challengeCreationFunction("Sponsored", false)).toBe("createChallenge");
    expect(challengeCreationFunction("Sponsored", true)).toBe("createChallengeWithPermit");
    expect(challengeCreationFunction("PerformerOffer", false)).toBe("createChallenge");
    expect(challengeCreationFunction("PerformerOffer", true)).toBe("createChallengeWithPermit");
  });
});
