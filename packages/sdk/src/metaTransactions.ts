import { encodeFunctionData, type Address, type Hex } from "viem";

export interface UnsignedForwardRequest {
  from: Address;
  to: Address;
  value: bigint;
  gas: bigint;
  nonce: bigint;
  deadline: number;
  data: Hex;
}

export interface SignedForwardRequest extends UnsignedForwardRequest {
  signature: Hex;
}

const forwardRequestFields = [
  { name: "from", type: "address" },
  { name: "to", type: "address" },
  { name: "value", type: "uint256" },
  { name: "gas", type: "uint256" },
  { name: "nonce", type: "uint256" },
  { name: "deadline", type: "uint48" },
  { name: "data", type: "bytes" },
] as const;

export const alterfordForwarderAbi = [
  {
    type: "function",
    name: "nonces",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "verify",
    stateMutability: "view",
    inputs: [
      {
        name: "request",
        type: "tuple",
        components: [
          { name: "from", type: "address" },
          { name: "to", type: "address" },
          { name: "value", type: "uint256" },
          { name: "gas", type: "uint256" },
          { name: "deadline", type: "uint48" },
          { name: "data", type: "bytes" },
          { name: "signature", type: "bytes" },
        ],
      },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "execute",
    stateMutability: "payable",
    inputs: [
      {
        name: "request",
        type: "tuple",
        components: [
          { name: "from", type: "address" },
          { name: "to", type: "address" },
          { name: "value", type: "uint256" },
          { name: "gas", type: "uint256" },
          { name: "deadline", type: "uint48" },
          { name: "data", type: "bytes" },
          { name: "signature", type: "bytes" },
        ],
      },
    ],
    outputs: [],
  },
] as const;

export function buildForwardRequestTypedData(
  chainId: number,
  forwarder: Address,
  request: UnsignedForwardRequest,
) {
  return {
    domain: {
      name: "AlterfordForwarder",
      version: "1",
      chainId,
      verifyingContract: forwarder,
    },
    types: { ForwardRequest: forwardRequestFields },
    primaryType: "ForwardRequest" as const,
    message: request,
  } as const;
}

export function encodeForwarderExecute(request: SignedForwardRequest): Hex {
  return encodeFunctionData({
    abi: alterfordForwarderAbi,
    functionName: "execute",
    args: [
      {
        from: request.from,
        to: request.to,
        value: request.value,
        gas: request.gas,
        deadline: request.deadline,
        data: request.data,
        signature: request.signature,
      },
    ],
  });
}
