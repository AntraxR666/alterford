import type { BountyDTO, ChallengeDTO, MarketDTO } from "@alterford/sdk";

export type LifecycleGroup = "active" | "resolution" | "history";
export type LifecycleUrgency = "none" | "normal" | "high";

export interface LifecycleAvailability {
  group: LifecycleGroup;
  label: string;
  actionable: boolean;
  urgency: LifecycleUrgency;
}

export interface LifecycleCountdown {
  label: string;
  remainingSeconds: number;
  urgency: LifecycleUrgency;
  target: string;
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

export function formatRemainingTime(seconds: number): string {
  const remaining = Math.max(0, Math.floor(seconds));
  const days = Math.floor(remaining / 86_400);
  const hours = Math.floor((remaining % 86_400) / 3_600);
  const minutes = Math.floor((remaining % 3_600) / 60);
  const secs = remaining % 60;
  if (days > 0) return `${days}d ${pad(hours)}h ${pad(minutes)}m`;
  if (hours > 0) return `${pad(hours)}h ${pad(minutes)}m`;
  return `${pad(minutes)}m ${pad(secs)}s`;
}

export function marketCountdown(market: MarketDTO, nowSeconds: number): LifecycleCountdown | undefined {
  if (market.state === "Open") {
    const lockTime = timestampSeconds(market.lockTime);
    if (lockTime !== undefined && nowSeconds < lockTime) {
      return countdown("Apuestas cierran en", lockTime, nowSeconds);
    }
    const resolutionTime = timestampSeconds(market.resolutionTime);
    if (resolutionTime !== undefined && nowSeconds < resolutionTime) {
      return countdown("Resolucion disponible en", resolutionTime, nowSeconds);
    }
  }
  if (market.state === "Locked") {
    const resolutionTime = timestampSeconds(market.resolutionTime);
    if (resolutionTime !== undefined && nowSeconds < resolutionTime) {
      return countdown("Resolucion disponible en", resolutionTime, nowSeconds);
    }
  }
  return undefined;
}

export function challengeCountdown(
  challenge: ChallengeDTO,
  nowSeconds: number,
): LifecycleCountdown | undefined {
  const disputeDeadline = timestampSeconds(challenge.resolutionProposal?.disputeDeadline);
  if (challenge.state === "Review" && disputeDeadline !== undefined && nowSeconds < disputeDeadline) {
    return countdown("Disputa cierra en", disputeDeadline, nowSeconds);
  }
  if (["Open", "Accepted", "EvidenceSubmitted"].includes(challenge.state)) {
    const deadline = timestampSeconds(challenge.deadline);
    if (deadline !== undefined && nowSeconds < deadline) {
      const prefix = challenge.state === "Open" ? "Aceptacion cierra en" : "Evidencia cierra en";
      return countdown(prefix, deadline, nowSeconds);
    }
  }
  return undefined;
}

export function bountyCountdown(bounty: BountyDTO, nowSeconds: number): LifecycleCountdown | undefined {
  const deadline = timestampSeconds(bounty.deadline);
  if (bounty.state !== "Open" || deadline === undefined || nowSeconds >= deadline) return undefined;
  return countdown("Entrega cierra en", deadline, nowSeconds);
}

function countdown(prefix: string, target: number, nowSeconds: number): LifecycleCountdown {
  const remainingSeconds = Math.max(0, Math.floor(target - nowSeconds));
  return {
    label: `${prefix} ${formatRemainingTime(remainingSeconds)}`,
    remainingSeconds,
    urgency: remainingSeconds <= 900 ? "high" : "normal",
    target: new Date(target * 1_000).toISOString(),
  };
}

function pad(value: number): string {
  return value.toString().padStart(2, "0");
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
