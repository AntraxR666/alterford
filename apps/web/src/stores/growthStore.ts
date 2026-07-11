import { create } from "zustand";

interface GrowthState {
  referralCode: string;
  activeCampaigns: readonly string[];
  activeQuests: readonly string[];
}

export const useGrowthStore = create<GrowthState>(() => ({
  referralCode: "ALTER-BASE-001",
  activeCampaigns: ["Underworld Drop", "Creator Season One"],
  activeQuests: ["First valid bet", "Enter Underworld", "Create a bonded market"],
}));
