import type { BountyDTO, ChallengeDTO, MarketDTO } from "@alterford/sdk";
import { describe, expect, it } from "vitest";
import {
  challengeAvailability,
  challengeCountdown,
  bountyCountdown,
  formatRemainingTime,
  marketAvailability,
  marketCountdown,
  partitionChallenges,
} from "./lifecycle";

const nowSeconds = 1_750_000_000;

const market = (overrides: Partial<MarketDTO> = {}): MarketDTO => ({
  id: "market-1",
  chainId: 84532,
  address: "0x0000000000000000000000000000000000000001",
  creator: "0x0000000000000000000000000000000000000002",
  title: "Will the market resolve?",
  description: "A lifecycle test market.",
  category: "News",
  modeAffinity: "Vanilla",
  outcomes: ["Yes", "No"],
  state: "Open",
  settlementToken: "0x0000000000000000000000000000000000000003",
  totalPool: 0n,
  poolByOutcome: [0n, 0n],
  impliedOddsByOutcome: [50, 50],
  lockTime: "2025-06-16T00:00:00.000Z",
  resolutionTime: "2025-06-17T00:00:00.000Z",
  metadataURI: "",
  metadataHash: "",
  ...overrides,
});

const challenge = (overrides: Partial<ChallengeDTO> = {}): ChallengeDTO => ({
  id: "challenge-1",
  chainId: 84532,
  address: "0x0000000000000000000000000000000000000011",
  creator: "0x0000000000000000000000000000000000000012",
  title: "Complete the challenge",
  description: "A lifecycle test challenge.",
  rewardPool: 0n,
  deadline: "2025-06-16T00:00:00.000Z",
  state: "Open",
  riskLevel: "Low",
  ...overrides,
});

const bounty = (overrides: Partial<BountyDTO> = {}): BountyDTO => ({
  id: "bounty-1",
  chainId: 84532,
  address: "0x0000000000000000000000000000000000000021",
  creator: "0x0000000000000000000000000000000000000022",
  settlementToken: "0x0000000000000000000000000000000000000003",
  title: "Complete the bounty",
  description: "A lifecycle test bounty.",
  rewardPool: 1_000_000n,
  rewardEscrow: 1_000_000n,
  deadline: String(nowSeconds + 3_600),
  state: "Open",
  metadataURI: "",
  rulesHash: "0x01",
  ...overrides,
});

describe("lifecycle presentation helpers", () => {
  it("formats live countdowns without negative values", () => {
    expect(formatRemainingTime(90_061)).toBe("1d 01h 01m");
    expect(formatRemainingTime(3_661)).toBe("01h 01m");
    expect(formatRemainingTime(59)).toBe("00m 59s");
    expect(formatRemainingTime(-1)).toBe("00m 00s");
  });

  it("counts down an open market to betting close and then to resolution", () => {
    expect(marketCountdown(market({
      lockTime: String(nowSeconds + 3_600),
      resolutionTime: String(nowSeconds + 7_200),
    }), nowSeconds)).toMatchObject({ label: "Apuestas cierran en 01h 00m", urgency: "normal" });

    expect(marketCountdown(market({
      lockTime: String(nowSeconds - 1),
      resolutionTime: String(nowSeconds + 600),
    }), nowSeconds)).toMatchObject({ label: "Resolucion disponible en 10m 00s", urgency: "high" });
  });

  it("counts down challenge participation and optimistic dispute windows", () => {
    expect(challengeCountdown(challenge({ deadline: String(nowSeconds + 900) }), nowSeconds))
      .toMatchObject({ label: "Aceptacion cierra en 15m 00s", urgency: "high" });

    expect(challengeCountdown(challenge({
      state: "Review",
      resolutionProposal: {
        proposer: "0x0000000000000000000000000000000000000012",
        executorSucceeded: true,
        evidenceHash: "0x01",
        disputeDeadline: String(nowSeconds + 3_600),
      },
    }), nowSeconds)).toMatchObject({ label: "Disputa cierra en 01h 00m", urgency: "normal" });
  });

  it("counts down an open bounty submission deadline", () => {
    expect(bountyCountdown(bounty(), nowSeconds)).toMatchObject({
      label: "Entrega cierra en 01h 00m",
      urgency: "normal",
    });
    expect(bountyCountdown(bounty({ state: "Resolved" }), nowSeconds)).toBeUndefined();
  });

  it("places resolved markets in history and makes them non-actionable", () => {
    expect(marketAvailability(market({ state: "Resolved" }), nowSeconds)).toEqual({
      group: "history",
      label: "Resolved",
      actionable: false,
      urgency: "none",
    });
  });

  it("closes betting after lock time but waits for resolution time", () => {
    expect(
      marketAvailability(
        market({
          lockTime: "2025-06-15T00:00:00.000Z",
          resolutionTime: "2025-06-17T00:00:00.000Z",
        }),
        nowSeconds,
      ),
    ).toEqual({
      group: "resolution",
      label: "Apuestas cerradas",
      actionable: false,
      urgency: "normal",
    });
  });

  it("marks a market resolvable only after resolution time", () => {
    expect(
      marketAvailability(
        market({
          lockTime: "2025-06-14T00:00:00.000Z",
          resolutionTime: "2025-06-15T00:00:00.000Z",
        }),
        nowSeconds,
      ),
    ).toEqual({
      group: "resolution",
      label: "Listo para resolver",
      actionable: true,
      urgency: "high",
    });
  });

  it("keeps a locked market non-actionable until resolution time", () => {
    expect(
      marketAvailability(
        market({
          state: "Locked",
          resolutionTime: "2025-06-17T00:00:00.000Z",
        }),
        nowSeconds,
      ),
    ).toEqual({
      group: "resolution",
      label: "Apuestas cerradas",
      actionable: false,
      urgency: "normal",
    });
  });

  it("does not offer normal resolution for a disputed market", () => {
    expect(marketAvailability(market({ state: "Disputed" }), nowSeconds)).toEqual({
      group: "resolution",
      label: "En disputa",
      actionable: false,
      urgency: "high",
    });
  });

  it("keeps cancelled challenges in history", () => {
    expect(challengeAvailability(challenge({ state: "Cancelled" }), nowSeconds)).toEqual({
      group: "history",
      label: "Cancelled",
      actionable: false,
      urgency: "none",
    });
  });

  it("expires an unaccepted challenge after its deadline", () => {
    expect(
      challengeAvailability(
        challenge({ state: "Open", deadline: "2025-06-15T00:00:00.000Z" }),
        nowSeconds,
      ),
    ).toEqual({
      group: "history",
      label: "Vencido",
      actionable: false,
      urgency: "none",
    });
  });

  it("marks an accepted challenge as awaiting resolution", () => {
    expect(challengeAvailability(challenge({ state: "Accepted" }), nowSeconds)).toEqual({
      group: "resolution",
      label: "Pendiente de resolucion",
      actionable: true,
      urgency: "high",
    });
  });

  it("partitions challenges by their lifecycle presentation group", () => {
    const active = challenge({ id: "active", deadline: "2025-07-20T00:00:00.000Z" });
    const resolution = challenge({ id: "resolution", state: "Accepted" });
    const history = challenge({ id: "history", state: "Cancelled" });

    expect(partitionChallenges([active, resolution, history], nowSeconds)).toEqual({
      active: [active],
      resolution: [resolution],
      history: [history],
    });
  });
});
