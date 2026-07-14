import type { BountyProjection, ChallengeProjection, MarketProjection } from "./projections.js";
import type { ProjectionState } from "./projections.js";
import type { Category, ModeAffinity } from "@alterford/sdk";

export function createReadApi(state: ProjectionState) {
  return {
    listMarkets: () => [...state.markets.values()].map(enrichMarketMetadata),
    listBounties: () => [...state.bounties.values()].map(enrichBountyMetadata),
    getBounty: (bountyId: string) => {
      const bounty = state.bounties.get(bountyId);
      return bounty ? enrichBountyMetadata(bounty) : null;
    },
    listChallenges: () => [...state.challenges.values()].map(enrichChallengeMetadata),
    getChallenge: (challengeId: string) => {
      const challenge = state.challenges.get(challengeId);
      return challenge ? enrichChallengeMetadata(challenge) : null;
    },
    getMarket: (marketId: string) => {
      const market = state.markets.get(marketId);
      return market ? enrichMarketMetadata(market) : null;
    },
    listBets: (marketId?: string, user?: string) =>
      [...state.bets.values()].filter(
        (bet) =>
          (!marketId || bet.marketId === marketId) &&
          (!user || bet.user.toLowerCase() === user.toLowerCase()),
      ),
    listClaims: (marketId?: string, user?: string) =>
      [...state.claims.values()].filter(
        (claim) =>
          (!marketId || claim.marketId === marketId) &&
          (!user || claim.user.toLowerCase() === user.toLowerCase()),
      ),
    getFees: (marketId: string) => state.fees.get(marketId) ?? null,
    getReferral: (user: string) => state.referrals.get(user as `0x${string}`) ?? null,
    getOracleResult: (marketId: string) => state.oracleResults.get(marketId) ?? null,
    listModerationCases: () => [...state.moderationCases.values()],
    getBond: (entityType: string, entityId: string) => state.bonds.get(`${entityType}:${entityId}`) ?? null,
  };
}

function enrichBountyMetadata(bounty: BountyProjection): BountyProjection {
  if (!bounty.metadataURI?.startsWith("alterford://bounty?")) return bounty;
  try {
    const url = new URL(bounty.metadataURI);
    return {
      ...bounty,
      title: url.searchParams.get("title")?.trim() || bounty.title,
      description: url.searchParams.get("description")?.trim() || bounty.description,
    };
  } catch {
    return bounty;
  }
}

function enrichMarketMetadata(market: MarketProjection): MarketProjection {
  const metadata = parseAlterfordMarketMetadata(market.metadataURI);
  if (!metadata) return market;

  return {
    ...market,
    title: metadata.question || market.title,
    description: metadata.description || market.description || "Mercado creado por usuarios en Alterford.",
    category: (metadata.category as Category | undefined) || market.category,
    modeAffinity: (metadata.mode as ModeAffinity | undefined) || market.modeAffinity,
  };
}

function parseAlterfordMarketMetadata(metadataURI?: string) {
  if (!metadataURI?.startsWith("alterford://market?")) return null;
  try {
    const url = new URL(metadataURI);
    return {
      question: url.searchParams.get("question")?.trim() || undefined,
      category: url.searchParams.get("category")?.trim() || undefined,
      mode: url.searchParams.get("mode")?.trim() || undefined,
      description: url.searchParams.get("description")?.trim() || undefined,
    };
  } catch {
    return null;
  }
}

function enrichChallengeMetadata(challenge: ChallengeProjection): ChallengeProjection {
  const metadata = parseAlterfordChallengeMetadata(challenge.metadataURI);
  if (!metadata) return challenge;

  return {
    ...challenge,
    title: metadata.title || challenge.title,
    description: metadata.evidence || challenge.description,
    liveStreamURI: metadata.live || challenge.liveStreamURI,
  };
}

function parseAlterfordChallengeMetadata(metadataURI?: string) {
  if (!metadataURI?.startsWith("alterford://challenge?")) return null;
  try {
    const url = new URL(metadataURI);
    return {
      title: url.searchParams.get("title")?.trim() || undefined,
      evidence: url.searchParams.get("evidence")?.trim() || undefined,
      live: url.searchParams.get("live")?.trim() || undefined,
    };
  } catch {
    return null;
  }
}
