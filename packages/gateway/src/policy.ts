import { getAbiItem, isAddress, size, toFunctionSelector, type Address, type Hex } from "viem";
import { challengeFactoryAbi } from "@alterford/sdk";

export type SponsoredChallengeAction =
  | "createChallenge"
  | "acceptChallenge"
  | "updateLiveStreamURI"
  | "submitEvidence"
  | "proposeResolution"
  | "confirmResolution"
  | "disputeResolution"
  | "finalizeUndisputed";

export interface SponsorshipPolicyConfig {
  chainId: number;
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

const gasByAction: Record<SponsoredChallengeAction, bigint> = {
  createChallenge: 1_500_000n,
  acceptChallenge: 600_000n,
  updateLiveStreamURI: 300_000n,
  submitEvidence: 500_000n,
  proposeResolution: 350_000n,
  confirmResolution: 900_000n,
  disputeResolution: 700_000n,
  finalizeUndisputed: 900_000n,
};

const actionBySelector = new Map(
  (Object.keys(gasByAction) as SponsoredChallengeAction[]).map((action) => {
    const item = getAbiItem({ abi: challengeFactoryAbi, name: action });
    return [toFunctionSelector(item), action] as const;
  }),
);

export class PolicyViolation extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "PolicyViolation";
  }
}

export class SponsorshipPolicy {
  constructor(private readonly config: SponsorshipPolicyConfig) {
    if (!isAddress(config.challengeFactory) || config.requestTtlSeconds < 60) {
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
    if (candidate.target.toLowerCase() !== this.config.challengeFactory.toLowerCase()) {
      throw new PolicyViolation("TARGET_NOT_ALLOWED", "Only the configured challenge contract is sponsored.");
    }
    if (candidate.value !== 0n) {
      throw new PolicyViolation("VALUE_NOT_ALLOWED", "Sponsored requests cannot transfer native value.");
    }
    if (!/^0x[0-9a-fA-F]+$/.test(candidate.data) || size(candidate.data) > this.config.maxCalldataBytes) {
      throw new PolicyViolation("INVALID_CALLDATA", "Calldata is malformed or exceeds the policy limit.");
    }

    const action = actionBySelector.get(candidate.data.slice(0, 10).toLowerCase() as Hex);
    if (!action) {
      throw new PolicyViolation("SELECTOR_NOT_ALLOWED", "This challenge action is not sponsored.");
    }

    return {
      action,
      deadline: nowSeconds + this.config.requestTtlSeconds,
      gas: gasByAction[action],
    };
  }
}
