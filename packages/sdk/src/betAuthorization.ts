import type { Address } from "./types.js";

export const UNRESTRICTED_BET_RELAYER: Address = "0x0000000000000000000000000000000000000000";

export const BET_AUTHORIZATION_TYPES = {
  BetAuthorization: [
    { name: "bettor", type: "address" },
    { name: "marketId", type: "uint256" },
    { name: "outcome", type: "uint8" },
    { name: "amount", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
    { name: "authorizedRelayer", type: "address" },
  ],
} as const;

export interface BetAuthorization {
  bettor: Address;
  marketId: bigint;
  outcome: number;
  amount: bigint;
  nonce: bigint;
  deadline: bigint;
  authorizedRelayer: Address;
}

export interface BetAuthorizationInput extends Omit<BetAuthorization, "authorizedRelayer"> {
  authorizedRelayer?: Address;
}

export interface BetAuthorizationTypedDataInput {
  chainId: number;
  verifyingContract: Address;
  authorization: BetAuthorization;
}

export function buildBetAuthorization(input: BetAuthorizationInput): BetAuthorization {
  return {
    ...input,
    authorizedRelayer: input.authorizedRelayer ?? UNRESTRICTED_BET_RELAYER,
  };
}

export function betAuthorizationDeadline(nowSeconds: bigint, validitySeconds: bigint): bigint {
  if (validitySeconds <= 0n) throw new Error("validitySeconds must be greater than zero");
  return nowSeconds + validitySeconds;
}

export function nextBetAuthorizationNonce(currentNonce: bigint): bigint {
  return currentNonce + 1n;
}

export function isBetAuthorizationExpired(
  authorization: Pick<BetAuthorization, "deadline">,
  nowSeconds: bigint,
): boolean {
  return nowSeconds > authorization.deadline;
}

export function isBetAuthorizationRelayerAllowed(
  authorization: Pick<BetAuthorization, "authorizedRelayer">,
  relayer: Address,
): boolean {
  const authorizedRelayer = authorization.authorizedRelayer.toLowerCase();
  return authorizedRelayer === UNRESTRICTED_BET_RELAYER || authorizedRelayer === relayer.toLowerCase();
}

export function buildBetAuthorizationTypedData(input: BetAuthorizationTypedDataInput) {
  return {
    domain: {
      name: "AlterfordMarketFactory",
      version: "1",
      chainId: input.chainId,
      verifyingContract: input.verifyingContract,
    },
    primaryType: "BetAuthorization",
    types: BET_AUTHORIZATION_TYPES,
    message: input.authorization,
  } as const;
}
