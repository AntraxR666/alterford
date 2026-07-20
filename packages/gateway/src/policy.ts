import {
  getAbiItem,
  isAddress,
  size,
  toFunctionSelector,
  type Abi,
  type AbiFunction,
  type Address,
  type Hex,
} from "viem";
import { bountyFactoryAbi, challengeFactoryAbi, marketFactoryAbi } from "@alterford/sdk";

export type SponsoredAction =
  | "createMarketWithPermit"
  | "placeBetWithPermit"
  | "claimReward"
  | "claimRefund"
  | "createBountyWithPermit"
  | "submit"
  | "submitEvidence"
  | "createChallengeWithPermit"
  | "acceptChallengeWithPermit"
  | "updateLiveStreamURI"
  | "proposeResolution"
  | "confirmResolution"
  | "disputeResolution"
  | "finalizeUndisputed";

type FactoryKey = "marketFactory" | "bountyFactory" | "challengeFactory";

export interface SponsorshipPolicyConfig {
  chainId: number;
  marketFactory: Address;
  bountyFactory: Address;
  challengeFactory: Address;
  requestTtlSeconds: number;
  maxCalldataBytes: number;
}

export interface SponsorshipCandidate {
  chainId: number;
  target: Address;
  user: Address;
  value: bigint;
  data: Hex;
}

const actions: readonly { factory: FactoryKey; action: SponsoredAction; selector: Hex; gas: bigint }[] = [
  sponsored("marketFactory", marketFactoryAbi, "createMarketWithPermit", 1_500_000n),
  sponsored("marketFactory", marketFactoryAbi, "placeBetWithPermit", 600_000n),
  sponsored("marketFactory", marketFactoryAbi, "claimReward", 350_000n),
  sponsored("marketFactory", marketFactoryAbi, "claimRefund", 350_000n),
  sponsored("bountyFactory", bountyFactoryAbi, "createBountyWithPermit", 1_500_000n),
  sponsored("bountyFactory", bountyFactoryAbi, "submit", 350_000n),
  sponsored("bountyFactory", bountyFactoryAbi, "submitEvidence", 600_000n),
  sponsored("challengeFactory", challengeFactoryAbi, "createChallengeWithPermit", 1_500_000n),
  sponsored("challengeFactory", challengeFactoryAbi, "acceptChallengeWithPermit", 700_000n),
  sponsored("challengeFactory", challengeFactoryAbi, "updateLiveStreamURI", 300_000n),
  sponsored("challengeFactory", challengeFactoryAbi, "submitEvidence", 500_000n),
  sponsored("challengeFactory", challengeFactoryAbi, "proposeResolution", 350_000n),
  sponsored("challengeFactory", challengeFactoryAbi, "confirmResolution", 900_000n),
  sponsored("challengeFactory", challengeFactoryAbi, "disputeResolution", 700_000n),
  sponsored("challengeFactory", challengeFactoryAbi, "finalizeUndisputed", 900_000n),
];

export class PolicyViolation extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "PolicyViolation";
  }
}

export class SponsorshipPolicy {
  constructor(private readonly config: SponsorshipPolicyConfig) {
    if (
      !isAddress(config.marketFactory)
      || !isAddress(config.bountyFactory)
      || !isAddress(config.challengeFactory)
      || config.requestTtlSeconds < 60
    ) {
      throw new PolicyViolation("INVALID_CONFIG", "Invalid sponsorship policy configuration.");
    }
  }

  authorize(candidate: SponsorshipCandidate, nowSeconds: number) {
    if (candidate.chainId !== this.config.chainId) {
      throw new PolicyViolation("CHAIN_NOT_ALLOWED", "The requested chain is not sponsored.");
    }
    if (!isAddress(candidate.user) || !isAddress(candidate.target)) {
      throw new PolicyViolation("INVALID_ADDRESS", "A valid user and target are required.");
    }
    if (candidate.value !== 0n) {
      throw new PolicyViolation("VALUE_NOT_ALLOWED", "Sponsored requests cannot transfer native value.");
    }
    if (!/^0x[0-9a-fA-F]+$/.test(candidate.data) || size(candidate.data) > this.config.maxCalldataBytes) {
      throw new PolicyViolation("INVALID_CALLDATA", "Calldata is malformed or exceeds the policy limit.");
    }

    const selector = candidate.data.slice(0, 10).toLowerCase() as Hex;
    const rule = actions.find((entry) =>
      this.config[entry.factory].toLowerCase() === candidate.target.toLowerCase()
      && entry.selector === selector,
    );
    if (!rule) {
      throw new PolicyViolation("ACTION_NOT_ALLOWED", "This action is not eligible for sponsorship.");
    }

    return {
      action: rule.action,
      deadline: nowSeconds + this.config.requestTtlSeconds,
      gas: rule.gas,
    };
  }
}

function sponsored(
  factory: FactoryKey,
  abi: Abi,
  action: SponsoredAction,
  gas: bigint,
) {
  const item = getAbiItem({ abi: abi as Abi, name: action as never }) as AbiFunction;
  return {
    factory,
    action,
    selector: toFunctionSelector(item),
    gas,
  };
}
