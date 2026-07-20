import { describe, expect, it } from "vitest";
import { SponsorshipLedger } from "./ledger.js";

const user = "0x1111111111111111111111111111111111111111" as const;
const config = { globalDailyLimit: 10, walletDailyLimit: 1, ipHourlyLimit: 10 };

describe("SponsorshipLedger persistence", () => {
  it("restores committed idempotency records and rate limits", () => {
    const first = new SponsorshipLedger(config);
    first.reserve("relay-key-0001", user, "127.0.0.1", "acceptChallengeWithPermit", 100_000);
    first.commit("relay-key-0001", "task-1");

    const restored = new SponsorshipLedger(config, first.snapshot());

    expect(restored.taskFor("relay-key-0001")).toEqual({ taskId: "task-1" });
    expect(() => restored.reserve(
      "relay-key-0002",
      user,
      "127.0.0.2",
      "submitEvidence",
      100_100,
    )).toThrow("daily sponsorship limit");
  });
});
