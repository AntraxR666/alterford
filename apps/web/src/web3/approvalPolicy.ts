import type { ApprovalMode } from "../stores/appStore";

const USDT = 1_000_000n;
const SMART_ALLOWANCE_TIERS = [25n, 100n, 250n, 500n, 1_000n, 2_000n].map((amount) => amount * USDT);

export function approvalTarget(requiredAmount: bigint, mode: ApprovalMode): bigint {
  if (requiredAmount <= 0n || mode === "exact") return requiredAmount;

  return SMART_ALLOWANCE_TIERS.find((tier) => tier > requiredAmount) ?? requiredAmount;
}

export function approvalTierLabel(mode: ApprovalMode): string {
  return mode === "smart" ? "Permiso reutilizable limitado" : "Permiso exacto por operacion";
}
