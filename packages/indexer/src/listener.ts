import {
  createPublicClient,
  decodeEventLog,
  hexToString,
  http,
  type Address,
  type Chain,
  type PublicClient,
  type Hex,
} from "viem";
import type { AlterfordEvent, BondEntityType } from "./events.js";
import { eventIdentity } from "./events.js";
import { createInitialProjectionState, projectEvent } from "./projections.js";
import { createBlockCheckpoint, replayEventJournal, rollbackJournalToBlock, shouldReorgFromBlock } from "./reorg.js";
import type { PersistedIndexerState } from "./store.js";
import { saveIndexerState } from "./store.js";

export interface MarketFactoryListenerOptions {
  rpcUrl: string;
  chainId: number;
  marketFactory: Address;
  challengeFactory?: Address;
  storePath: string;
  confirmations?: number;
}

const factoryEventAbi = [
  {
    type: "event",
    name: "MarketCreated",
    inputs: [
      { name: "marketId", type: "uint256", indexed: true },
      { name: "creator", type: "address", indexed: true },
      { name: "settlementToken", type: "address", indexed: true },
      { name: "metadataHash", type: "bytes32", indexed: false },
      { name: "metadataURI", type: "string", indexed: false },
    ],
  },
  {
    type: "event",
    name: "BetPlaced",
    inputs: [
      { name: "marketId", type: "uint256", indexed: true },
      { name: "user", type: "address", indexed: true },
      { name: "outcome", type: "uint8", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "MarketResolved",
    inputs: [
      { name: "marketId", type: "uint256", indexed: true },
      { name: "winningOutcome", type: "uint8", indexed: false },
    ],
  },
  {
    type: "event",
    name: "FeesAccrued",
    inputs: [
      { name: "marketId", type: "uint256", indexed: true },
      { name: "admin", type: "address", indexed: true },
      { name: "creator", type: "address", indexed: true },
      { name: "adminFee", type: "uint256", indexed: false },
      { name: "creatorFee", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "RewardClaimed",
    inputs: [
      { name: "marketId", type: "uint256", indexed: true },
      { name: "user", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "RefundClaimed",
    inputs: [
      { name: "marketId", type: "uint256", indexed: true },
      { name: "user", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "BondCalculated",
    inputs: [
      { name: "entityType", type: "bytes32", indexed: true },
      { name: "entityId", type: "uint256", indexed: true },
      { name: "creator", type: "address", indexed: true },
      { name: "requiredBond", type: "uint256", indexed: false },
      { name: "reasonFlags", type: "uint16", indexed: false },
    ],
  },
  {
    type: "event",
    name: "BondLocked",
    inputs: [
      { name: "entityType", type: "bytes32", indexed: true },
      { name: "entityId", type: "uint256", indexed: true },
      { name: "creator", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "BondReleased",
    inputs: [
      { name: "entityType", type: "bytes32", indexed: true },
      { name: "entityId", type: "uint256", indexed: true },
      { name: "creator", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "BondSlashed",
    inputs: [
      { name: "entityType", type: "bytes32", indexed: true },
      { name: "entityId", type: "uint256", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
      { name: "reasonHash", type: "bytes32", indexed: false },
    ],
  },
  {
    type: "event",
    name: "ChallengeCreated",
    inputs: [
      { name: "challengeId", type: "uint256", indexed: true },
      { name: "creator", type: "address", indexed: true },
      { name: "rewardPool", type: "uint256", indexed: false },
      { name: "rulesHash", type: "bytes32", indexed: false },
    ],
  },
  {
    type: "event",
    name: "ChallengeAccepted",
    inputs: [
      { name: "challengeId", type: "uint256", indexed: true },
      { name: "executor", type: "address", indexed: true },
      { name: "executorBond", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "ChallengeLiveStreamUpdated",
    inputs: [
      { name: "challengeId", type: "uint256", indexed: true },
      { name: "actor", type: "address", indexed: true },
      { name: "liveStreamURI", type: "string", indexed: false },
    ],
  },
  {
    type: "event",
    name: "ChallengeEvidenceSubmitted",
    inputs: [
      { name: "challengeId", type: "uint256", indexed: true },
      { name: "executor", type: "address", indexed: true },
      { name: "evidenceHash", type: "bytes32", indexed: false },
      { name: "evidenceURI", type: "string", indexed: false },
      { name: "liveStreamURI", type: "string", indexed: false },
    ],
  },
  {
    type: "event",
    name: "ChallengeResolved",
    inputs: [
      { name: "challengeId", type: "uint256", indexed: true },
      { name: "winner", type: "address", indexed: true },
      { name: "executorSucceeded", type: "bool", indexed: false },
      { name: "rewardPayout", type: "uint256", indexed: false },
      { name: "adminFee", type: "uint256", indexed: false },
      { name: "creatorFee", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "ChallengeCancelled",
    inputs: [
      { name: "challengeId", type: "uint256", indexed: true },
      { name: "reasonHash", type: "bytes32", indexed: false },
    ],
  },
  {
    type: "event",
    name: "ChallengeFraudConfirmed",
    inputs: [
      { name: "challengeId", type: "uint256", indexed: true },
      { name: "offender", type: "address", indexed: true },
      { name: "reasonHash", type: "bytes32", indexed: false },
    ],
  },
] as const;

const challengeGetterAbi = [
  {
    type: "function",
    name: "challenges",
    stateMutability: "view",
    inputs: [{ name: "challengeId", type: "uint256" }],
    outputs: [
      { name: "creator", type: "address" },
      { name: "executor", type: "address" },
      { name: "settlementToken", type: "address" },
      { name: "rulesHash", type: "bytes32" },
      { name: "metadataURI", type: "string" },
      { name: "liveStreamURI", type: "string" },
      { name: "rewardPool", type: "uint256" },
      { name: "deadline", type: "uint256" },
      { name: "state", type: "uint8" },
      { name: "evidenceHash", type: "bytes32" },
      { name: "evidenceURI", type: "string" },
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
  const latest = await client.getBlockNumber();
  const toBlock = latest > confirmations ? latest - confirmations : 0n;

  if (toBlock <= indexerState.cursor.lastProcessedBlock) {
    return indexerState;
  }

  const logs = [];
  const maxLogBlockRange = BigInt(process.env.MAX_LOG_BLOCK_RANGE || "2000");
  const factoryAddresses = [options.marketFactory, options.challengeFactory].filter(Boolean) as Address[];
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
    const event = await decodeAlterfordLog(options.chainId, log, client, options.challengeFactory);
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

async function decodeAlterfordLog(
  chainId: number,
  log: { address?: Address; blockNumber: bigint | null; transactionHash: Hex | null; logIndex: number; data: Hex; topics: Hex[] },
  client: PublicClient,
  challengeFactory?: Address,
): Promise<AlterfordEvent | null> {
  if (log.blockNumber === null || log.transactionHash === null) return null;

  try {
    const decoded = decodeEventLog({
      abi: factoryEventAbi,
      data: log.data,
      topics: log.topics as [`0x${string}`, ...`0x${string}`[]],
      strict: false,
    });
    const args = decoded.args as Record<string, unknown>;
    const base = {
      id: eventIdentity({ chainId, blockNumber: log.blockNumber, logIndex: log.logIndex }),
      chainId,
      blockNumber: log.blockNumber,
      txHash: log.transactionHash,
      logIndex: log.logIndex,
    };

    switch (decoded.eventName) {
      case "MarketCreated":
        return {
          ...base,
          type: "MarketCreated",
          payload: {
            marketId: String(args.marketId),
            creator: args.creator as Address,
            settlementToken: args.settlementToken as Address,
            metadataHash: args.metadataHash as string,
            metadataURI: args.metadataURI as string,
            title: `Market ${String(args.marketId)}`,
            category: "UserMarkets",
            modeAffinity: "Both",
          },
        };
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
      case "MarketResolved":
        return {
          ...base,
          type: "MarketResolved",
          payload: {
            marketId: String(args.marketId),
            winningOutcome: Number(args.winningOutcome),
          },
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
          payload: {
            challengeId: String(args.challengeId),
            reasonHash: args.reasonHash as string,
          },
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

async function readChallengeDetails(client: PublicClient, challengeFactory: Address, challengeId: bigint) {
  try {
    const result = await client.readContract({
      address: challengeFactory,
      abi: challengeGetterAbi,
      functionName: "challenges",
      args: [challengeId],
    });
    const values = result as readonly unknown[];
    return {
      settlementToken: values[2] as Address,
      metadataURI: values[4] as string,
      deadline: values[7] as bigint,
      state: decodeChallengeState(Number(values[8] ?? 0)),
    };
  } catch {
    return null;
  }
}

function decodeChallengeState(value: number) {
  return ([
    "Open",
    "Accepted",
    "EvidenceSubmitted",
    "Review",
    "Resolved",
    "Cancelled",
    "Fraud",
    "Refunded",
  ] as const)[value] ?? "Open";
}

function decodeEntityType(value: Hex): BondEntityType {
  const decoded = hexToString(value, { size: 32 }).replace(/\0/g, "");
  if (decoded === "Bounty" || decoded === "Challenge" || decoded === "ChallengeExecutor") return decoded;
  return "Market";
}
