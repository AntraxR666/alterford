import { create } from "zustand";

interface AppState {
  isUnderworldMode: boolean;
  quickBetAmount: bigint;
  highRollerMode: boolean;
  toggleUnderworldMode: () => void;
  setQuickBetAmount: (amount: bigint) => void;
  setHighRollerMode: (enabled: boolean) => void;
}

export const useAppStore = create<AppState>((set) => ({
  isUnderworldMode: false,
  quickBetAmount: 500_000n,
  highRollerMode: false,
  toggleUnderworldMode: () => set((state) => ({ isUnderworldMode: !state.isUnderworldMode })),
  setQuickBetAmount: (amount) => set({ quickBetAmount: amount }),
  setHighRollerMode: (enabled) => set({ highRollerMode: enabled }),
}));
