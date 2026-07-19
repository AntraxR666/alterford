import type { Address, ChallengeDTO } from "@alterford/sdk";

export type ChallengeWorkflowAction =
  | "accept"
  | "submit-evidence"
  | "propose-result"
  | "review-proposal"
  | "finalize"
  | "resolve-dispute"
  | "resolve-early"
  | "cancel-expired";

export type ChallengeWorkflowRole = "creator" | "executor" | "participant" | "arbiter" | "observer";

export interface WorkflowStep {
  label: string;
  state: "complete" | "current" | "upcoming";
}

export interface ChallengeWorkflowModel {
  role: ChallengeWorkflowRole;
  currentStep: number;
  steps: WorkflowStep[];
  headline: string;
  instruction: string;
  primaryAction: ChallengeWorkflowAction | null;
  secondaryActions: ChallengeWorkflowAction[];
}

const labels = ["Creado", "Aceptado", "Evidencia", "Decision", "Pago"];
const finalStates = new Set(["Resolved", "Cancelled", "Fraud", "Refunded"]);

export function filterChallengesByMode(challenges: ChallengeDTO[], isUnderworldMode: boolean) {
  const expected = isUnderworldMode ? "Underworld" : "Vanilla";
  return challenges.filter((challenge) => challenge.modeAffinity === expected);
}

export function challengeWorkflow(
  challenge: ChallengeDTO,
  account: Address | undefined,
  isArbiter: boolean,
  nowSeconds: number,
): ChallengeWorkflowModel {
  const normalized = account?.toLowerCase();
  const isCreator = Boolean(normalized && challenge.creator.toLowerCase() === normalized);
  const isExecutor = Boolean(normalized && challenge.executor?.toLowerCase() === normalized);
  const role: ChallengeWorkflowRole = isCreator
    ? "creator"
    : isExecutor
      ? "executor"
      : isArbiter
        ? "arbiter"
        : normalized
          ? "participant"
          : "observer";
  const deadline = Number(challenge.deadline);
  const expired = Number.isFinite(deadline) && deadline <= nowSeconds;
  const proposal = challenge.resolutionProposal;
  const proposalExpired = Boolean(proposal && Number(proposal.disputeDeadline) <= nowSeconds);

  let currentStep = stepForState(challenge.state);
  let headline = "Reto finalizado";
  let instruction = "Consulta el resultado y los movimientos de escrow registrados on-chain.";
  let primaryAction: ChallengeWorkflowAction | null = null;
  let secondaryActions: ChallengeWorkflowAction[] = [];

  if (challenge.state === "Open") {
    if (expired) {
      headline = "El plazo termino sin ejecutor";
      instruction = isArbiter
        ? "Cancela el reto para devolver la recompensa y el bond del creador."
        : "No se puede aceptar. El arbitro debe cerrar el escrow.";
      primaryAction = isArbiter ? "cancel-expired" : null;
    } else if (isCreator) {
      headline = "Esperando un ejecutor";
      instruction = "Tu recompensa ya esta protegida. Comparte el reto; otra wallet debe aceptarlo.";
    } else {
      headline = "Puedes tomar este reto";
      instruction = "Primero autoriza el bond exacto y despues acepta. Autorizar no mueve fondos; aceptar si los bloquea.";
      primaryAction = "accept";
    }
  } else if (challenge.state === "Accepted") {
    if (expired) {
      headline = "Esperando resolucion";
      instruction = isArbiter
        ? "El plazo de evidencia termino. Revisa lo disponible y publica la decision."
        : "El plazo termino. No envies otra transaccion; el arbitro revisara el resultado.";
      primaryAction = isArbiter ? "resolve-early" : null;
    } else if (isExecutor) {
      headline = "Realiza el reto y entrega la prueba";
      instruction = "Puedes publicar el live durante el reto. Al terminar, sube la evidencia final antes del contador.";
      primaryAction = "submit-evidence";
    } else {
      headline = "El ejecutor esta realizando el reto";
      instruction = "Sigue el live si existe. La siguiente accion corresponde al ejecutor.";
      primaryAction = isArbiter ? "resolve-early" : null;
    }
  } else if (challenge.state === "EvidenceSubmitted") {
    headline = "La evidencia esta lista para decidir";
    instruction = isCreator || isExecutor
      ? "Revisa la prueba y propone si el reto se cumplio o no se cumplio."
      : "El creador o ejecutor debe proponer el resultado.";
    primaryAction = isCreator || isExecutor ? "propose-result" : isArbiter ? "resolve-early" : null;
  } else if (challenge.state === "Review") {
    if (proposalExpired) {
      headline = "La ventana termino sin disputa";
      instruction = "Cualquier cuenta puede finalizar el resultado propuesto y liberar el escrow.";
      primaryAction = "finalize";
    } else {
      const isOtherParticipant = Boolean(
        (isCreator || isExecutor)
          && proposal?.proposer.toLowerCase() !== normalized,
      );
      headline = isOtherParticipant ? "Confirma o disputa el resultado" : "Esperando a la otra parte";
      instruction = isOtherParticipant
        ? "Confirma exactamente la propuesta para cerrar antes, o disputa con un motivo y evidencia."
        : "La otra parte debe confirmar o disputar antes de que termine la ventana.";
      primaryAction = isOtherParticipant ? "review-proposal" : isArbiter ? "resolve-early" : null;
      secondaryActions = isOtherParticipant ? [] : [];
    }
  } else if (challenge.state === "Disputed") {
    headline = isArbiter ? "Debes emitir la decision final" : "El reto esta en arbitraje";
    instruction = isArbiter
      ? "Revisa la evidencia y el motivo. Tu decision libera o devuelve el escrow y procesa los bonds."
      : "No envies mas transacciones. Solo el arbitro autorizado puede resolver la disputa.";
    primaryAction = isArbiter ? "resolve-dispute" : null;
  } else if (finalStates.has(challenge.state)) {
    currentStep = 4;
  }

  return {
    role,
    currentStep,
    steps: labels.map((label, index) => ({
      label,
      state: index < currentStep ? "complete" : index === currentStep ? "current" : "upcoming",
    })),
    headline,
    instruction,
    primaryAction,
    secondaryActions,
  };
}

function stepForState(state: ChallengeDTO["state"]) {
  if (state === "Open") return 0;
  if (state === "Accepted") return 1;
  if (state === "EvidenceSubmitted") return 2;
  if (state === "Review" || state === "Disputed") return 3;
  return 4;
}
