import {
  bountyFactoryAbi,
  bondCategoryId,
  bountyRecoveryVaultAbi,
  challengeFactoryAbi,
  marketFactoryAbi,
  type BountyState,
  type ChallengeState,
  type MarketState,
  type RiskLevel,
} from "@alterford/sdk";
import {
  createPublicClient,
  decodeEventLog,
  hexToString,
  http,
  type Abi,
  type Address,
  type Chain,
  type Hex,
  type PublicClient,
} from "viem";
import type { AlterfordEvent, BondEntityType } from "./events.js";
import { eventIdentity } from "./events.js";
import { createInitialProjectionState, projectEvent, type ProjectionState } from "./projections.js";
import {
  createBlockCheckpoint,
  replayEventJournal,
  rollbackJournalToBlock,
  shouldReorgFromBlock,
} from "./reorg.js";
import type { PersistedIndexerState } from "./store.js";
import { saveIndexerState } from "./store.js";

export interface MarketFactoryListenerOptions {
  rpcUrl: string;
  chainId: number;
  marketFactory: Address;
  bountyFactory?: Address;
  challengeFactory?: Address;
  bountyRecoveryVault?: Address;
  storePath: string;
  confirmations?: number;
}

const factoryEventAbi = uniqueEventAbi([
  ...marketFactoryAbi,
  ...bountyFactoryAbi,
  ...challengeFactoryAbi,
  ...bountyRecoveryVaultAbi,
]);

const marketDetailsAbi = [
  {
    type: "function",
    name: "markets",
    stateMutability: "view",
    inputs: [{ name: "marketId", type: "uint256" }],
    outputs: [
      { name: "creator", type: "address" },
      { name: "settlementToken", type: "address" },
      { name: "metadataHash", type: "bytes32" },
      { name: "metadataURI", type: "string" },
      { name: "lockTime", type: "uint256" },
      { name: "resolutionTime", type: "uint256" },
      { name: "state", type: "uint8" },
      { name: "noWinnersPolicy", type: "uint8" },
      { name: "winningOutcome", type: "uint8" },
      { name: "categoryId", type: "bytes32" },
      { name: "mode", type: "uint8" },
      { name: "riskLevel", type: "uint8" },
    ],
  },
] as const;

export async function pollMarketFactoryEvents(
  indexerState: PersistedIndexerState,
  options: MarketFactoryListenerOptions,
): Promise<PersistedIndexerState> {
  const confirmations = BigInt(options.confirmations ?? indexerState.cursor.confirmations);
  const chain = {
    id: options.chainId,
    name: `Alterford ${options.chainId}`,
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [options.rpcUrl] } },
  } satisfies Chain;
  const client = createPublicClient({ chain, transport: http(options.rpcUrl) });
  const hydratedMarkets = await hydrateMarketLifecycle(
    indexerState.projection,
    client,
    options.marketFactory,
  );
  const latest = await client.getBlockNumber();
  const toBlock = latest > confirmations ? latest - confirmations : 0n;

  if (toBlock <= indexerState.cursor.lastProcessedBlock) {
    if (hydratedMarkets > 0) await saveIndexerState(options.storePath, indexerState);
    return indexerState;
  }

  const logs = [];
  const maxLogBlockRange = BigInt(process.env.MAX_LOG_BLOCK_RANGE || "2000");
  const factoryAddresses = [
    options.marketFactory,
    options.bountyFactory,
    options.challengeFactory,
    options.bountyRecoveryVault,
  ].filter(Boolean) as Address[];
  let fromBlock = indexerState.cursor.lastProcessedBlock + 1n;
  while (fromBlock <= toBlock) {
    const chunkToBlock =
      maxLogBlockRange > 0n && fromBlock + maxLogBlockRange - 1n < toBlock
        ? fromBlock + maxLogBlockRange - 1n
        : toBlock;
    logs.push(
      ...(await client.getLogs({
        address: factoryAddresses,
        fromBlock,
        toBlock: chunkToBlock,
      })),
    );
    fromBlock = chunkToBlock + 1n;
  }

  for (const log of logs) {
    if (log.blockHash) {
      const reorgBlock = shouldReorgFromBlock(
        indexerState.blockCheckpoints,
        log.blockNumber ?? 0n,
        log.blockHash,
      );
      if (reorgBlock !== null) {
        indexerState.journal = rollbackJournalToBlock(indexerState.journal, reorgBlock);
        indexerState.projection = replayEventJournal(createInitialProjectionState(), indexerState.journal);
        for (const key of [...indexerState.blockCheckpoints.keys()]) {
          if (BigInt(key) >= reorgBlock) indexerState.blockCheckpoints.delete(key);
        }
        indexerState.cursor.lastProcessedBlock = reorgBlock > 0n ? reorgBlock - 1n : 0n;
      }
      indexerState.blockCheckpoints.set(
        log.blockNumber?.toString() ?? "0",
        createBlockCheckpoint(log.blockNumber ?? 0n, log.blockHash),
      );
    }
    const event = await decodeAlterfordLog(
      options.chainId,
      log,
      client,
      options.challengeFactory,
      options.bountyFactory,
    );
    if (event) {
      indexerState.journal.push(event);
      projectEvent(indexerState.projection, event);
    }
  }

  indexerState.cursor = {
    chainId: options.chainId,
    confirmations: Number(confirmations),
    lastProcessedBlock: toBlock,
  };
  await saveIndexerState(options.storePath, indexerState);
  return indexerState;
}

export async function hydrateMarketLifecycle(
  projection: ProjectionState,
  client: Pick<PublicClient, "readContract">,
  marketFactory: Address,
): Promise<number> {
  let hydrated = 0;
  for (const market of projection.markets.values()) {
    if (market.lockTime !== undefined && market.resolutionTime !== undefined) continue;
    const details = await readMarketDetails(client, marketFactory, BigInt(market.marketId));
    if (!details) continue;
    market.lockTime = details.lockTime;
    market.resolutionTime = details.resolutionTime;
    market.state = details.state;
    hydrated += 1;
  }
  return hydrated;
}

export async function decodeAlterfordLog(
  chainId: number,
  log: {
    address?: Address;
    blockNumber: bigint | null;
    transactionHash: Hex | null;
    logIndex: number;
    data: Hex;
    topics: readonly Hex[];
  },
  client: Pick<PublicClient, "readContract">,
  challengeFactory?: Address,
  bountyFactory?: Address,
): Promise<AlterfordEvent | null> {
  if (!log.address || log.blockNumber === null || log.transactionHash === null) return null;

  try {
    const decoded = decodeEventLog({
      abi: factoryEventAbi,
      data: log.data,
      topics: log.topics as [`0x${string}`, ...`0x${string}`[]],
      strict: false,
    }) as unknown as { eventName: string; args: Record<string, unknown> };
    const args = decoded.args;
    const base = {
      id: eventIdentity({ chainId, blockNumber: log.blockNumber, logIndex: log.logIndex }),
      chainId,
      blockNumber: log.blockNumber,
      txHash: log.transactionHash,
      logIndex: log.logIndex,
    };

    switch (decoded.eventName) {
      case "MarketCreated":
        {
        const marketId = args.marketId as bigint;
        const details = await readMarketDetails(client, log.address, marketId);
        return {
          ...base,
          type: "MarketCreated",
          payload: {
            marketId: String(marketId),
            creator: args.creator as Address,
            settlementToken: args.settlementToken as Address,
            metadataHash: args.metadataHash as string,
            metadataURI: args.metadataURI as string,
            title: `Market ${String(args.marketId)}`,
            category: decodeCategory(args.categoryId as string),
            modeAffinity: decodeMode(Number(args.mode)),
            categoryId: args.categoryId as string,
            riskLevel: decodeRiskLevel(Number(args.riskLevel)),
            lockTime: details?.lockTime,
            resolutionTime: details?.resolutionTime,
            state: details?.state ?? "Open",
          },
        };
        }
      case "BetPlaced":
        return {
          ...base,
          type: "BetPlaced",
          payload: {
            marketId: String(args.marketId),
            user: args.user as Address,
            outcome: Number(args.outcome),
            amount: args.amount as bigint,
          },
        };
      case "SignedBetExecuted":
        return {
          ...base,
          type: "SignedBetExecuted",
          payload: {
            marketId: String(args.marketId),
            bettor: args.bettor as Address,
            relayer: args.relayer as Address,
            outcome: Number(args.outcome),
            amount: args.amount as bigint,
            nonce: args.nonce as bigint,
          },
        };
      case "NonceInvalidated":
        return {
          ...base,
          type: "NonceInvalidated",
          payload: {
            bettor: args.bettor as Address,
            oldNonce: args.oldNonce as bigint,
            newNonce: args.newNonce as bigint,
          },
        };
      case "MarketResolved":
        return {
          ...base,
          type: "MarketResolved",
          payload: {
            marketId: String(args.marketId),
            winningOutcome: Number(args.winningOutcome),
          },
        };
      case "MarketLocked":
        return { ...base, type: "MarketLocked", payload: { marketId: String(args.marketId) } };
      case "MarketCancelled":
        return {
          ...base,
          type: "MarketCancelled",
          payload: { marketId: String(args.marketId), reasonHash: args.reasonHash as string },
        };
      case "MarketFraudConfirmed":
        return {
          ...base,
          type: "MarketFraudConfirmed",
          payload: { marketId: String(args.marketId), reasonHash: args.reasonHash as string },
        };
      case "FeesAccrued":
        return {
          ...base,
          type: "FeesAccrued",
          payload: {
            marketId: String(args.marketId),
            admin: args.admin as Address,
            creator: args.creator as Address,
            adminFee: args.adminFee as bigint,
            creatorFee: args.creatorFee as bigint,
          },
        };
      case "RewardClaimed":
        return {
          ...base,
          type: "RewardClaimed",
          payload: {
            marketId: String(args.marketId),
            user: args.user as Address,
            amount: args.amount as bigint,
          },
        };
      case "RefundClaimed":
        return {
          ...base,
          type: "RefundClaimed",
          payload: {
            marketId: String(args.marketId),
            user: args.user as Address,
            amount: args.amount as bigint,
          },
        };
      case "BountyCreated": {
        const bountyId = String(args.bountyId);
        const details =
          bountyFactory && log.address?.toLowerCase() === bountyFactory.toLowerCase()
            ? await readBountyDetails(client, bountyFactory, BigInt(bountyId))
            : null;
        return {
          ...base,
          type: "BountyCreated",
          payload: {
            bountyId,
            creator: args.creator as Address,
            rewardPool: args.rewardPool as bigint,
            rewardEscrow: details?.rewardEscrow ?? (args.rewardPool as bigint),
            rulesHash: args.rulesHash as string,
            settlementToken: details?.settlementToken,
            deadline: details?.deadline,
            metadataURI: details?.metadataURI,
            state: details?.state,
            categoryId: (args.categoryId as string) || details?.categoryId,
            modeAffinity: decodeMode(Number(args.mode ?? details?.mode ?? 0)),
            riskLevel: decodeRiskLevel(Number(args.riskLevel ?? details?.riskLevel ?? 0)),
          },
        };
      }
      case "SubmissionCreated":
        return {
          ...base,
          type: "SubmissionCreated",
          payload: {
            bountyId: String(args.bountyId),
            submitter: args.submitter as Address,
            submissionHash: args.submissionHash as string,
          },
        };
      case "SubmissionEvidenceCreated":
        return {
          ...base,
          type: "SubmissionEvidenceCreated",
          payload: {
            bountyId: String(args.bountyId),
            submitter: args.submitter as Address,
            submissionHash: args.submissionHash as string,
            evidenceURI: args.evidenceURI as string,
          },
        };
      case "BountyResolved":
        return {
          ...base,
          type: "BountyResolved",
          payload: {
            bountyId: String(args.bountyId),
            winners: args.winners as Address[],
            amounts: args.amounts as bigint[],
          },
        };
      case "BountyCancelled":
        return {
          ...base,
          type: "BountyCancelled",
          payload: { bountyId: String(args.bountyId), reasonHash: args.reasonHash as string },
        };
      case "RecoveryVaultUpdated":
        return {
          ...base,
          type: "RecoveryVaultUpdated",
          payload: { oldVault: args.oldVault as Address, newVault: args.newVault as Address },
        };
      case "EmergencyBountyRecovered":
        return {
          ...base,
          type: "EmergencyBountyRecovered",
          payload: {
            bountyId: String(args.bountyId),
            token: args.token as Address,
            recoveryVault: args.recoveryVault as Address,
            rewardAmount: args.rewardAmount as bigint,
            bondAmount: args.bondAmount as bigint,
            incidentHash: args.incidentHash as string,
            securityAdmin: args.securityAdmin as Address,
          },
        };
      case "EmergencyLiquidityRecovered":
        return {
          ...base,
          type: "EmergencyLiquidityRecovered",
          payload: {
            token: args.token as Address,
            coldWallet: args.coldWallet as Address,
            amount: args.amount as bigint,
            incidentHash: args.incidentHash as string,
            securityAdmin: args.securityAdmin as Address,
          },
        };
      case "ChallengeCreated": {
        const challengeId = String(args.challengeId);
        const details =
          challengeFactory && log.address?.toLowerCase() === challengeFactory.toLowerCase()
            ? await readChallengeDetails(client, challengeFactory, BigInt(challengeId))
            : null;
        return {
          ...base,
          type: "ChallengeCreated",
          payload: {
            challengeId,
            creator: args.creator as Address,
            rewardPool: args.rewardPool as bigint,
            rulesHash: args.rulesHash as string,
            settlementToken: details?.settlementToken,
            metadataURI: details?.metadataURI,
            deadline: details?.deadline,
            state: details?.state,
            categoryId: (args.categoryId as string) || details?.categoryId,
            modeAffinity: decodeMode(Number(args.mode ?? details?.mode ?? 0)),
            riskLevel: decodeRiskLevel(Number(args.riskLevel ?? details?.riskLevel ?? 0)),
          },
        };
      }
      case "ChallengeAccepted":
        return {
          ...base,
          type: "ChallengeAccepted",
          payload: {
            challengeId: String(args.challengeId),
            executor: args.executor as Address,
            executorBond: args.executorBond as bigint,
          },
        };
      case "ChallengeLiveStreamUpdated":
        return {
          ...base,
          type: "ChallengeLiveStreamUpdated",
          payload: {
            challengeId: String(args.challengeId),
            actor: args.actor as Address,
            liveStreamURI: args.liveStreamURI as string,
          },
        };
      case "ChallengeEvidenceSubmitted":
        return {
          ...base,
          type: "ChallengeEvidenceSubmitted",
          payload: {
            challengeId: String(args.challengeId),
            executor: args.executor as Address,
            evidenceHash: args.evidenceHash as string,
            evidenceURI: args.evidenceURI as string,
            liveStreamURI: args.liveStreamURI as string,
          },
        };
      case "ChallengeResolutionProposed":
        return {
          ...base,
          type: "ChallengeResolutionProposed",
          payload: {
            challengeId: String(args.challengeId),
            proposer: args.proposer as Address,
            executorSucceeded: Boolean(args.executorSucceeded),
            evidenceHash: args.evidenceHash as string,
            disputeDeadline: args.disputeDeadline as bigint,
          },
        };
      case "ChallengeResolutionConfirmed":
        return {
          ...base,
          type: "ChallengeResolutionConfirmed",
          payload: {
            challengeId: String(args.challengeId),
            confirmer: args.confirmer as Address,
            executorSucceeded: Boolean(args.executorSucceeded),
          },
        };
      case "ChallengeResolutionDisputed":
        return {
          ...base,
          type: "ChallengeResolutionDisputed",
          payload: {
            challengeId: String(args.challengeId),
            disputant: args.disputant as Address,
            bondAmount: args.bondAmount as bigint,
            reasonHash: args.reasonHash as string,
          },
        };
      case "ChallengeDisputeResolved":
        return {
          ...base,
          type: "ChallengeDisputeResolved",
          payload: {
            challengeId: String(args.challengeId),
            executorSucceeded: Boolean(args.executorSucceeded),
            disputeSucceeded: Boolean(args.disputeSucceeded),
            reasonHash: args.reasonHash as string,
          },
        };
      case "ChallengeResolvedEarly":
        return {
          ...base,
          type: "ChallengeResolvedEarly",
          payload: {
            challengeId: String(args.challengeId),
            executorSucceeded: Boolean(args.executorSucceeded),
            reasonHash: args.reasonHash as string,
          },
        };
      case "ResolutionWindowUpdated":
        return {
          ...base,
          type: "ResolutionWindowUpdated",
          payload: { oldWindow: args.oldWindow as bigint, newWindow: args.newWindow as bigint },
        };
      case "ChallengeResolved":
        return {
          ...base,
          type: "ChallengeResolved",
          payload: {
            challengeId: String(args.challengeId),
            winner: args.winner as Address,
            executorSucceeded: Boolean(args.executorSucceeded),
            rewardPayout: args.rewardPayout as bigint,
            adminFee: args.adminFee as bigint,
            creatorFee: args.creatorFee as bigint,
          },
        };
      case "ChallengeCancelled":
        return {
          ...base,
          type: "ChallengeCancelled",
          payload: { challengeId: String(args.challengeId), reasonHash: args.reasonHash as string },
        };
      case "ChallengeFraudConfirmed":
        return {
          ...base,
          type: "ChallengeFraudConfirmed",
          payload: {
            challengeId: String(args.challengeId),
            offender: args.offender as Address,
            reasonHash: args.reasonHash as string,
          },
        };
      case "BondCalculated":
        return {
          ...base,
          type: "BondCalculated",
          payload: {
            entityType: decodeEntityType(args.entityType as Hex),
            entityId: String(args.entityId),
            creator: args.creator as Address,
            requiredBond: args.requiredBond as bigint,
            reasonFlags: Number(args.reasonFlags),
          },
        };
      case "BondLocked":
        return {
          ...base,
          type: "BondLocked",
          payload: {
            entityType: decodeEntityType(args.entityType as Hex),
            entityId: String(args.entityId),
            creator: args.creator as Address,
            amount: args.amount as bigint,
          },
        };
      case "BondReleased":
        return {
          ...base,
          type: "BondReleased",
          payload: {
            entityType: decodeEntityType(args.entityType as Hex),
            entityId: String(args.entityId),
            creator: args.creator as Address,
            amount: args.amount as bigint,
          },
        };
      case "BondSlashed":
        return {
          ...base,
          type: "BondSlashed",
          payload: {
            entityType: decodeEntityType(args.entityType as Hex),
            entityId: String(args.entityId),
            amount: args.amount as bigint,
            reasonHash: args.reasonHash as string,
          },
        };
      default:
        return null;
    }
  } catch {
    return null;
  }
}

async function readChallengeDetails(
  client: Pick<PublicClient, "readContract">,
  challengeFactory: Address,
  challengeId: bigint,
) {
  try {
    const result = await client.readContract({
      address: challengeFactory,
      abi: challengeFactoryAbi,
      functionName: "challenges",
      args: [challengeId],
    });
    const values = result as readonly unknown[];
    return {
      settlementToken: values[2] as Address,
      metadataURI: values[4] as string,
      deadline: values[7] as bigint,
      state: decodeChallengeState(Number(values[8] ?? 0)),
      categoryId: values[11] as string,
      mode: Number(values[12] ?? 0),
      riskLevel: Number(values[13] ?? 0),
    };
  } catch {
    return null;
  }
}

async function readMarketDetails(
  client: Pick<PublicClient, "readContract">,
  marketFactory: Address,
  marketId: bigint,
) {
  try {
    const result = await client.readContract({
      address: marketFactory,
      abi: marketDetailsAbi,
      functionName: "markets",
      args: [marketId],
    });
    const values = result as unknown as readonly unknown[];
    return {
      lockTime: values[4] as bigint,
      resolutionTime: values[5] as bigint,
      state: decodeMarketState(Number(values[6] ?? 0)),
    };
  } catch {
    return null;
  }
}

async function readBountyDetails(
  client: Pick<PublicClient, "readContract">,
  bountyFactory: Address,
  bountyId: bigint,
) {
  try {
    const result = await client.readContract({
      address: bountyFactory,
      abi: bountyFactoryAbi,
      functionName: "bounties",
      args: [bountyId],
    });
    const values = result as readonly unknown[];
    return {
      settlementToken: values[1] as Address,
      deadline: values[3] as bigint,
      metadataURI: values[5] as string,
      state: decodeBountyState(Number(values[6] ?? 0)),
      rewardEscrow: values[2] as bigint,
      categoryId: values[7] as string,
      mode: Number(values[8] ?? 0),
      riskLevel: Number(values[9] ?? 0),
    };
  } catch {
    return null;
  }
}

function decodeChallengeState(value: number): ChallengeState {
  return (
    [
      "Open",
      "Accepted",
      "EvidenceSubmitted",
      "Review",
      "Resolved",
      "Cancelled",
      "Fraud",
      "Refunded",
      "Disputed",
    ] as const
  )[value] ?? "Open";
}

function decodeMarketState(value: number): MarketState {
  return (
    [
      "Draft",
      "Open",
      "Locked",
      "Resolved",
      "Disputed",
      "Cancelled",
      "Fraud",
      "Expired",
      "Settled",
    ] as const
  )[value] ?? "Draft";
}

function decodeBountyState(value: number): BountyState {
  return (
    [
      "Open",
      "SubmissionClosed",
      "Review",
      "Resolved",
      "Cancelled",
      "Fraud",
      "Refunded",
      "Settled",
      "EmergencyRecovered",
    ] as const
  )[value] ?? "Open";
}

function decodeRiskLevel(value: number): RiskLevel {
  return (["Low", "Medium", "High", "Critical"] as const)[value] ?? "Low";
}

function decodeMode(value: number): "Vanilla" | "Underworld" {
  return value === 1 ? "Underworld" : "Vanilla";
}

function decodeCategory(categoryId: string | undefined) {
  const normalized = categoryId?.toLowerCase();
  const categories = [
    ["SPORTS", "Sports"],
    ["WEATHER", "Weather"],
    ["TECHNOLOGY", "Technology"],
    ["CRYPTO", "Crypto"],
    ["CULTURE_POP", "PopCulture"],
    ["NEWS", "News"],
    ["STRANGE_EVENTS", "StrangeEvents"],
    ["VIRAL", "Viral"],
  ] as const;
  for (const [key, category] of categories) {
    if (bondCategoryId(key).toLowerCase() === normalized) return category;
  }
  return "UserMarkets";
}

function decodeEntityType(value: Hex): BondEntityType {
  const decoded = hexToString(value, { size: 32 }).replace(/\0/g, "");
  if (
    decoded === "Bounty" ||
    decoded === "Challenge" ||
    decoded === "ChallengeExecutor" ||
    decoded === "ChallengeDispute"
  ) {
    return decoded;
  }
  return "Market";
}

function uniqueEventAbi(abi: readonly { type: string; name?: string; inputs?: readonly unknown[] }[]): Abi {
  const seen = new Set<string>();
  return abi.filter((item) => {
    if (item.type !== "event") return false;
    const signature = `${item.name}:${JSON.stringify(item.inputs)}`;
    if (seen.has(signature)) return false;
    seen.add(signature);
    return true;
  }) as Abi;
}
