import { once } from "node:events";
import { afterEach, describe, expect, it } from "vitest";
import { createInitialProjectionState, projectEvent } from "./projections.js";
import { startReadServer } from "./server.js";

let server: ReturnType<typeof startReadServer> | undefined;

describe("Alterford read server", () => {
  afterEach(async () => {
    if (!server) return;
    server.close();
    await once(server, "close");
    server = undefined;
  });

  it("serves bounty collection and detail routes", async () => {
    const state = createInitialProjectionState();
    projectEvent(state, {
      id: "31337:1:0",
      chainId: 31337,
      blockNumber: 1n,
      txHash: "0xbounty",
      logIndex: 0,
      type: "BountyCreated",
      payload: {
        bountyId: "1",
        creator: "0x0000000000000000000000000000000000000001",
        rewardPool: 1_000_000n,
        rulesHash: "0xrules",
      },
    });
    server = startReadServer(state, 0);
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Expected TCP server address");

    const list = await fetch(`http://127.0.0.1:${address.port}/bounties`).then((response) => response.json());
    const detail = await fetch(`http://127.0.0.1:${address.port}/bounties/1`).then((response) => response.json());

    expect(list).toHaveLength(1);
    expect(detail).toMatchObject({ bountyId: "1", rewardPool: "1000000", rewardEscrow: "1000000" });
  });
});
