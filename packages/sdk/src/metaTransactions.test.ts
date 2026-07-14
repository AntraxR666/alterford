import { describe, expect, it } from "vitest";
import { hashTypedData, type Address, type Hex } from "viem";
import { buildForwardRequestTypedData, encodeForwarderExecute } from "./metaTransactions.js";

describe("forward request helpers", () => {
  const forwarder = "0x1111111111111111111111111111111111111111" as Address;
  const request = {
    from: "0x2222222222222222222222222222222222222222" as Address,
    to: "0x3333333333333333333333333333333333333333" as Address,
    value: 0n,
    gas: 600_000n,
    nonce: 7n,
    deadline: 1_700_000_000,
    data: "0x12345678" as Hex,
  };

  it("matches the OpenZeppelin ERC2771Forwarder EIP-712 domain and fields", () => {
    const typedData = buildForwardRequestTypedData(84532, forwarder, request);

    expect(typedData.domain).toEqual({
      name: "AlterfordForwarder",
      version: "1",
      chainId: 84532,
      verifyingContract: forwarder,
    });
    expect(typedData.message.nonce).toBe(7n);
    expect(hashTypedData(typedData)).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("encodes execute with the signature but not the implicit nonce", () => {
    const calldata = encodeForwarderExecute({
      ...request,
      signature: `0x${"11".repeat(65)}` as Hex,
    });
    expect(calldata).toMatch(/^0x[0-9a-f]+$/);
    expect(calldata.slice(0, 10)).not.toBe(request.data);
  });
});
