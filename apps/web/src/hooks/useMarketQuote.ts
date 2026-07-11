import { calculateMarketSettlement, DEFAULT_ECONOMICS } from "@alterford/sdk";

export function useMarketQuote(userWinningStake: bigint) {
  const visibleWinningPool = userWinningStake > 1_000_000n ? userWinningStake : 1_000_000n;

  return calculateMarketSettlement({
    stakesByOutcome: [visibleWinningPool, 3_000_000n],
    winningOutcome: 0,
    userWinningStake,
    noWinnersPolicy: "RefundAll",
    economics: DEFAULT_ECONOMICS,
  });
}
