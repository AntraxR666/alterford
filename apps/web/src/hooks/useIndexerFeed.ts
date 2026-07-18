import { useEffect, useState } from "react";
import type { ChallengeDTO, MarketDTO } from "@alterford/sdk";

interface IndexerFeed {
  status: "idle" | "connected" | "unavailable";
  marketCount: number;
  markets: MarketDTO[];
  challenges: ChallengeDTO[];
  error?: string;
}

export function useIndexerFeed(): IndexerFeed {
  const [feed, setFeed] = useState<IndexerFeed>({ status: "idle", marketCount: 0, markets: [], challenges: [] });

  useEffect(() => {
    const baseUrl = import.meta.env.VITE_INDEXER_URL;
    if (!baseUrl) {
      setFeed({ status: "unavailable", marketCount: 0, markets: [], challenges: [], error: "Indexer URL is not configured." });
      return;
    }

    const controller = new AbortController();
    async function load() {
      try {
        const [marketsResponse, challengesResponse] = await Promise.all([
          fetch(`${baseUrl}/markets`, { cache: "no-store", signal: controller.signal }),
          fetch(`${baseUrl}/challenges`, { cache: "no-store", signal: controller.signal }),
        ]);
        if (!marketsResponse.ok) throw new Error(`Indexer markets responded ${marketsResponse.status}`);
        if (!challengesResponse.ok) throw new Error(`Indexer challenges responded ${challengesResponse.status}`);
        const markets = ((await marketsResponse.json()) as MarketDTO[]).map((market) => ({
          ...market,
          id: market.id ?? String((market as { marketId?: string }).marketId ?? "0"),
          outcomes: market.outcomes?.length ? market.outcomes : ["YES", "NO"],
          impliedOddsByOutcome: market.impliedOddsByOutcome?.length
            ? market.impliedOddsByOutcome
            : deriveOdds(market.poolByOutcome),
        }));
        const challenges = ((await challengesResponse.json()) as ChallengeDTO[]).map((challenge) => ({
          ...challenge,
          id: challenge.id ?? String((challenge as { challengeId?: string }).challengeId ?? "0"),
        }));
        setFeed({ status: "connected", marketCount: markets.length, markets, challenges });
      } catch (error) {
        if (!controller.signal.aborted) {
          setFeed({
            status: "unavailable",
            marketCount: 0,
            markets: [],
            challenges: [],
            error: error instanceof Error ? error.message : "Indexer unavailable.",
          });
        }
      }
    }

    void load();
    const interval = window.setInterval(load, 12_000);
    return () => {
      controller.abort();
      window.clearInterval(interval);
    };
  }, []);

  return feed;
}

function deriveOdds(poolByOutcome?: unknown): number[] {
  if (!poolByOutcome || typeof poolByOutcome !== "object") return [50, 50];
  const values = Object.values(poolByOutcome as Record<string, string | number | bigint>).map((value) =>
    Number(value),
  );
  const yes = values[0] ?? 0;
  const no = values[1] ?? 0;
  const total = yes + no;
  if (total <= 0) return [50, 50];
  return [Math.round((yes / total) * 100), Math.round((no / total) * 100)];
}
