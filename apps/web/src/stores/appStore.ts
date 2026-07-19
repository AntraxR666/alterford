import { create } from "zustand";

export type ApprovalMode = "smart" | "exact";

interface AppState {
  isUnderworldMode: boolean;
  quickBetAmount: bigint;
  highRollerMode: boolean;
  approvalMode: ApprovalMode;
  toggleUnderworldMode: () => void;
  setQuickBetAmount: (amount: bigint) => void;
  setHighRollerMode: (enabled: boolean) => void;
  setApprovalMode: (mode: ApprovalMode) => void;
}

export const useAppStore = create<AppState>((set) => ({
  isUnderworldMode: false,
  quickBetAmount: 500_000n,
  highRollerMode: false,
  approvalMode: "smart",
  toggleUnderworldMode: () => set((state) => ({ isUnderworldMode: !state.isUnderworldMode })),
  setQuickBetAmount: (amount) => set({ quickBetAmount: amount }),
  setHighRollerMode: (enabled) => set({ highRollerMode: enabled }),
  setApprovalMode: (approvalMode) => set({ approvalMode }),
}));
