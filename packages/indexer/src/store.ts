import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { AlterfordEvent } from "./events.js";
import type {
  BetProjection,
  BondProjection,
  ChallengeProjection,
  ClaimProjection,
  FeeProjection,
  ProjectionState,
} from "./projections.js";
import { createInitialProjectionState } from "./projections.js";
import type { BlockCheckpoint } from "./reorg.js";
import { replayEventJournal } from "./reorg.js";

export interface IndexerCursor {
  chainId: number;
  lastProcessedBlock: bigint;
  confirmations: number;
}

export interface PersistedIndexerState {
  projection: ProjectionState;
  cursor: IndexerCursor;
  journal: AlterfordEvent[];
  blockCheckpoints: Map<string, BlockCheckpoint>;
}

export interface IndexerSnapshot {
  cursor: {
    chainId: number;
    confirmations: number;
    lastProcessedBlock: string;
  };
  journalLength: number;
  blockCheckpointCount: number;
    readModel: {
      markets: number;
      challenges: number;
      bets: number;
    claims: number;
    bonds: number;
  };
}

export async function loadIndexerState(path: string, cursor: IndexerCursor): Promise<PersistedIndexerState> {
  try {
    const raw = JSON.parse(await readFile(path, "utf8"));
    return {
      projection: deserializeProjection(raw.projection),
      cursor: deserializeCursor(raw.cursor),
      journal: deserializeJournal(raw.journal ?? []),
      blockCheckpoints: new Map(raw.blockCheckpoints ?? []),
    };
  } catch {
    return {
      projection: createInitialProjectionState(),
      cursor,
      journal: [],
      blockCheckpoints: new Map(),
    };
  }
}

export async function saveIndexerState(path: string, state: PersistedIndexerState): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(serializeIndexerState(state), bigintReplacer, 2)}\n`);
}

export function replayPersistedJournal(state: PersistedIndexerState): PersistedIndexerState {
  return {
    ...state,
    projection: replayEventJournal(createInitialProjectionState(), state.journal),
  };
}

export function snapshotIndexerState(state: PersistedIndexerState): IndexerSnapshot {
  return {
    cursor: {
      chainId: state.cursor.chainId,
      confirmations: state.cursor.confirmations,
      lastProcessedBlock: state.cursor.lastProcessedBlock.toString(),
    },
    journalLength: state.journal.length,
    blockCheckpointCount: state.blockCheckpoints.size,
    readModel: {
      markets: state.projection.markets.size,
      challenges: state.projection.challenges.size,
      bets: state.projection.bets.size,
      claims: state.projection.claims.size,
      bonds: state.projection.bonds.size,
    },
  };
}

function serializeIndexerState(state: PersistedIndexerState) {
  return {
    cursor: {
      ...state.cursor,
      lastProcessedBlock: state.cursor.lastProcessedBlock.toString(),
    },
    journal: state.journal,
    blockCheckpoints: [...state.blockCheckpoints],
    projection: {
      processedEventIds: [...state.projection.processedEventIds],
      markets: [...state.projection.markets].map(([marketId, market]) => [
        marketId,
        {
          ...market,
          poolByOutcome: [...market.poolByOutcome],
        },
      ]),
      challenges: [...state.projection.challenges],
      referrals: [...state.projection.referrals],
      completedQuests: [...state.projection.completedQuests].map(([questId, users]) => [questId, [...users]]),
      reputation: [...state.projection.reputation],
      oracleResults: [...state.projection.oracleResults],
      moderationCases: [...state.projection.moderationCases],
      bonds: [...state.projection.bonds],
      bets: [...state.projection.bets],
      claims: [...state.projection.claims],
      fees: [...state.projection.fees],
    },
  };
}

function bigintReplacer(_key: string, value: unknown) {
  return typeof value === "bigint" ? value.toString() : value;
}

function deserializeProjection(raw: any): ProjectionState {
  const state = createInitialProjectionState();
  state.processedEventIds = new Set(raw?.processedEventIds ?? []);
  state.markets = new Map(
    (raw?.markets ?? []).map(([key, value]: [string, any]) => [
      key,
      {
        ...value,
        totalPool: BigInt(value.totalPool ?? 0),
        poolByOutcome: new Map(
          [...(value.poolByOutcome ?? [])].map(([outcome, amount]: [number, string]) => [
            Number(outcome),
            BigInt(amount),
          ]),
        ),
      },
    ]),
  );
  state.challenges = mapBigints<ChallengeProjection>(raw?.challenges ?? [], [
    "rewardPool",
    "deadline",
    "rewardPayout",
    "adminFee",
    "creatorFee",
  ]);
  state.referrals = new Map(raw?.referrals ?? []);
  state.completedQuests = new Map(
    (raw?.completedQuests ?? []).map(([questId, users]: [string, `0x${string}`[]]) => [questId, new Set(users)]),
  );
  state.reputation = new Map(raw?.reputation ?? []);
  state.oracleResults = new Map(raw?.oracleResults ?? []);
  state.moderationCases = new Map(raw?.moderationCases ?? []);
  state.bonds = mapBigints<BondProjection>(raw?.bonds ?? [], [
    "requiredBond",
    "paidBond",
    "releasedBond",
    "slashedBond",
  ]);
  state.bets = mapBigints<BetProjection>(raw?.bets ?? [], ["amount"]);
  state.claims = mapBigints<ClaimProjection>(raw?.claims ?? [], ["amount"]);
  state.fees = mapBigints<FeeProjection>(raw?.fees ?? [], ["adminFee", "creatorFee"]);
  return state;
}

function mapBigints<T>(entries: [string, T][], keys: string[]): Map<string, T> {
  return new Map(
    entries.map(([key, value]: [string, any]) => [
      key,
      Object.fromEntries(Object.entries(value).map(([field, fieldValue]) => [
        field,
        keys.includes(field) ? BigInt(String(fieldValue)) : fieldValue,
      ])),
    ]) as [string, T][],
  );
}

function deserializeCursor(raw: any): IndexerCursor {
  return {
    chainId: Number(raw?.chainId ?? 31337),
    lastProcessedBlock: BigInt(raw?.lastProcessedBlock ?? 0),
    confirmations: Number(raw?.confirmations ?? 3),
  };
}

function deserializeJournal(raw: any[]): AlterfordEvent[] {
  return raw.map((event) => ({
    ...event,
    blockNumber: BigInt(event.blockNumber ?? 0),
    payload: revivePayloadBigints(event.type, event.payload),
  })) as AlterfordEvent[];
}

function revivePayloadBigints(type: string, payload: Record<string, unknown>) {
  const bigintFieldsByType: Record<string, string[]> = {
    BetPlaced: ["amount"],
    FeesAccrued: ["adminFee", "creatorFee"],
    RewardClaimed: ["amount"],
    RefundClaimed: ["amount"],
    ChallengeCreated: ["rewardPool", "deadline"],
    ChallengeAccepted: ["executorBond"],
    ChallengeResolved: ["rewardPayout", "adminFee", "creatorFee"],
    BondCalculated: ["requiredBond"],
    BondLocked: ["amount"],
    BondReleased: ["amount"],
    BondSlashed: ["amount"],
  };
  const bigintFields = bigintFieldsByType[type] ?? [];
  return Object.fromEntries(
    Object.entries(payload ?? {}).map(([key, value]) => [
      key,
      bigintFields.includes(key) ? BigInt(String(value)) : value,
    ]),
  );
}
