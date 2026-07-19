import { getAddress, type Address } from "viem";

export interface XmrConversionAuthorization {
  destination: Address;
  quoteId: string;
  idempotencyKey: string;
  nonce: bigint;
  deadline: number;
}

export function buildXmrConversionAuthorization(
  chainId: number,
  input: XmrConversionAuthorization,
) {
  return {
    domain: { name: "Alterford XMR Conversion", version: "1", chainId },
    primaryType: "AuthorizeXmrConversion" as const,
    types: {
      AuthorizeXmrConversion: [
        { name: "destination", type: "address" },
        { name: "quoteId", type: "string" },
        { name: "idempotencyKey", type: "string" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint64" },
      ],
    },
    message: {
      destination: getAddress(input.destination),
      quoteId: input.quoteId,
      idempotencyKey: input.idempotencyKey,
      nonce: input.nonce,
      deadline: BigInt(input.deadline),
    },
  } as const;
}
