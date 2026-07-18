import type { ChallengeDTO, MarketDTO } from "@alterford/sdk";

export type LifecycleGroup = "active" | "resolution" | "history";
export type LifecycleUrgency = "none" | "normal" | "high";

export interface LifecycleAvailability {
  group: LifecycleGroup;
  label: string;
  actionable: boolean;
  urgency: LifecycleUrgency;
}

export interface ChallengePartitions {
  active: ChallengeDTO[];
  resolution: ChallengeDTO[];
  history: ChallengeDTO[];
}

function timestampSeconds(value: string | undefined): number | undefined {
  if (!value) return undefined;

  const numericValue = Number(value);
  if (Number.isFinite(numericValue)) return numericValue;

  const parsedValue = Date.parse(value);
  return Number.isNaN(parsedValue) ? undefined : parsedValue / 1_000;
}

function presentation(
  group: LifecycleGroup,
  label: string,
  actionable: boolean,
  urgency: LifecycleUrgency,
): LifecycleAvailability {
  return { group, label, actionable, urgency };
}

export function marketAvailability(market: MarketDTO, nowSeconds: number): LifecycleAvailability {
  if (market.state === "Open") {
    const lockTime = timestampSeconds(market.lockTime);
    const resolutionTime = timestampSeconds(market.resolutionTime);
    if (resolutionTime !== undefined && nowSeconds >= resolutionTime) {
      return presentation("resolution", "Listo para resolver", true, "high");
    }
    if (lockTime !== undefined && nowSeconds >= lockTime) {
      return presentation("resolution", "Apuestas cerradas", false, "normal");
    }

    return presentation("active", "Abierto", true, "normal");
  }

  if (market.state === "Locked") {
    const resolutionTime = timestampSeconds(market.resolutionTime);
    if (resolutionTime === undefined || nowSeconds < resolutionTime) {
      return presentation("resolution", "Apuestas cerradas", false, "normal");
    }

    return presentation("resolution", "Listo para resolver", true, "high");
  }

  if (market.state === "Disputed") {
    return presentation("resolution", "En disputa", false, "high");
  }

  return presentation("history", market.state, false, "none");
}

export function challengeAvailability(
  challenge: ChallengeDTO,
  nowSeconds: number,
): LifecycleAvailability {
  if (challenge.state === "Open") {
    const deadline = timestampSeconds(challenge.deadline);
    if (deadline !== undefined && nowSeconds >= deadline) {
      return presentation("history", "Vencido", false, "none");
    }

    return presentation("active", "Abierto", true, "normal");
  }

  if (challenge.state === "Accepted" || challenge.state === "EvidenceSubmitted" || challenge.state === "Review") {
    return presentation("resolution", "Pendiente de resolucion", true, "high");
  }

  if (challenge.state === "Disputed") {
    return presentation("resolution", "Disputed", true, "high");
  }

  return presentation("history", challenge.state, false, "none");
}

export function partitionChallenges(
  challenges: ChallengeDTO[],
  nowSeconds: number,
): ChallengePartitions {
  return challenges.reduce<ChallengePartitions>(
    (partitions, challenge) => {
      partitions[challengeAvailability(challenge, nowSeconds).group].push(challenge);
      return partitions;
    },
    { active: [], resolution: [], history: [] },
  );
}
