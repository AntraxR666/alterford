import { describe, expect, it, vi } from "vitest";
import type { Address, Hex } from "viem";
import type { SignedForwardRequest } from "@alterford/sdk";
import { GelatoRelayAdapter, ViemGatewayChain } from "./providers.js";

const forwarder = "0x1111111111111111111111111111111111111111" as Address;
const request: SignedForwardRequest = {
  from: "0x2222222222222222222222222222222222222222",
  to: "0x3333333333333333333333333333333333333333",
  value: 0n,
  gas: 600_000n,
  nonce: 3n,
  deadline: 1_700_000_000,
  data: "0x12345678",
  signature: `0x${"11".repeat(65)}` as Hex,
};

describe("production provider adapters", () => {
  it("maps the current Gelato task API without exposing its key", async () => {
    const client = {
      sendTransaction: vi.fn(async () => "0xgelato-task" as Hex),
      getStatus: vi.fn(async () => ({
        status: 200,
        receipt: { transactionHash: "0xabc" as Hex },
      })),
    };
    const adapter = new GelatoRelayAdapter(client);

    await expect(adapter.submit({ chainId: 84532, to: forwarder, data: "0x1234" })).resolves.toEqual({
      taskId: "0xgelato-task",
    });
    await expect(adapter.status("0xgelato-task")).resolves.toEqual({
      state: "confirmed",
      transactionHash: "0xabc",
    });
  });

  it("reads nonce and verifies then simulates the exact forward request", async () => {
    const client = {
      readContract: vi.fn(async ({ functionName }: { functionName: string }) =>
        functionName === "nonces" ? 3n : true,
      ),
      simulateContract: vi.fn(async () => ({ result: undefined })),
    };
    const chain = new ViemGatewayChain(client, forwarder);

    await expect(chain.getNonce(request.from)).resolves.toBe(3n);
    await expect(chain.verify(request)).resolves.toBe(true);
    await chain.simulate(request);
    expect(client.simulateContract).toHaveBeenCalledOnce();
  });
});
