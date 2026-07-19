import type { Address, BountyDTO } from "@alterford/sdk";
import type { WorkflowStep } from "../challenges/challengeWorkflow";

export type BountyWorkflowAction = "submit-evidence" | "update-evidence" | "resolve" | "cancel";
export type BountyWorkflowRole = "creator" | "submitter" | "participant" | "resolver" | "arbiter" | "observer";

export interface BountyWorkflowModel {
  role: BountyWorkflowRole;
  currentStep: number;
  steps: WorkflowStep[];
  headline: string;
  instruction: string;
  primaryAction: BountyWorkflowAction | null;
  secondaryActions: BountyWorkflowAction[];
}

const labels = ["Publicado", "Entregas", "Revision", "Ganador", "Pago"];

export function filterBountiesByMode(bounties: BountyDTO[], isUnderworldMode: boolean) {
  const expected = isUnderworldMode ? "Underworld" : "Vanilla";
  return bounties.filter((bounty) => bounty.modeAffinity === expected);
}

export function bountyWorkflow(
  bounty: BountyDTO,
  account: Address | undefined,
  isResolver: boolean,
  isArbiter: boolean,
  nowSeconds: number,
): BountyWorkflowModel {
  const normalized = account?.toLowerCase();
  const isCreator = Boolean(normalized && bounty.creator.toLowerCase() === normalized);
  const ownSubmission = bounty.submissions?.find(
    (submission) => submission.submitter.toLowerCase() === normalized,
  );
  const deadline = Number(bounty.deadline);
  const open = bounty.state === "Open" && (!Number.isFinite(deadline) || deadline > nowSeconds);
  const final = ["Resolved", "Cancelled", "Fraud", "Refunded", "Settled", "EmergencyRecovered"].includes(bounty.state);
  const role: BountyWorkflowRole = isCreator
    ? "creator"
    : ownSubmission
      ? "submitter"
      : isResolver
        ? "resolver"
        : isArbiter
          ? "arbiter"
          : normalized
            ? "participant"
            : "observer";

  let currentStep = final ? 4 : open ? 1 : 2;
  let headline = final ? "Bounty finalizado" : "Esperando revision";
  let instruction = final
    ? "Consulta el ganador y el pago registrado on-chain."
    : "El escrow sigue protegido mientras el operador revisa las entregas.";
  let primaryAction: BountyWorkflowAction | null = null;
  let secondaryActions: BountyWorkflowAction[] = [];

  if (open) {
    if (isCreator) {
      headline = "Esperando entregas";
      instruction = "La recompensa ya esta en escrow. Comparte el bounty y revisa las entregas cuando cierre.";
    } else if (ownSubmission) {
      headline = "Tu entrega esta registrada";
      instruction = "Puedes reemplazar la foto o enlace antes del cierre. Solo la ultima entrega queda activa.";
      primaryAction = "update-evidence";
    } else {
      headline = "Puedes competir por esta recompensa";
      instruction = "Sube una foto o pega un enlace verificable y confirma la entrega on-chain antes del cierre.";
      primaryAction = "submit-evidence";
    }
    if (isArbiter) secondaryActions = ["cancel"];
  } else if (!final) {
    if (isResolver) {
      headline = "Selecciona al ganador";
      instruction = "Elige una wallet que haya entregado evidencia. El pago saldra automaticamente del escrow.";
      primaryAction = "resolve";
    } else {
      headline = "Esperando resultado";
      instruction = "No necesitas hacer otra transaccion. El resolver revisara las entregas y publicara al ganador.";
    }
    if (isArbiter) secondaryActions = ["cancel"];
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
