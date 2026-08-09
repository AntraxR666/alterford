import type { ChallengeFundingModel } from "@alterford/sdk";

export function challengeCreationCost(
  fundingModel: ChallengeFundingModel,
  bond: bigint,
  reward: bigint,
): bigint {
  return fundingModel === "PerformerOffer" ? bond : bond + reward;
}

export function challengeAcceptanceCost(
  fundingModel: ChallengeFundingModel,
  bond: bigint,
  reward: bigint,
): bigint {
  return fundingModel === "PerformerOffer" ? reward : bond;
}

export function challengeCreationFunction(
  _fundingModel: ChallengeFundingModel,
  withPermit: boolean,
): "createChallenge" | "createChallengeWithPermit" {
  return withPermit ? "createChallengeWithPermit" : "createChallenge";
}
