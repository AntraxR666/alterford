import type { AlterfordEvent } from "./events.js";
import type { ProjectionState } from "./projections.js";
import { projectEvent } from "./projections.js";

export interface BlockCheckpoint {
  blockNumber: bigint;
  blockHash: string;
}

export function createBlockCheckpoint(blockNumber: bigint, blockHash: string): BlockCheckpoint {
  return { blockNumber, blockHash };
}

export function shouldReorgFromBlock(
  checkpoints: ReadonlyMap<string, BlockCheckpoint>,
  blockNumber: bigint,
  observedBlockHash: string,
): bigint | null {
  const checkpoint = checkpoints.get(blockNumber.toString());
  if (!checkpoint) return null;
  return checkpoint.blockHash.toLowerCase() === observedBlockHash.toLowerCase() ? null : blockNumber;
}

export function rollbackJournalToBlock(
  journal: readonly AlterfordEvent[],
  rollbackBlock: bigint,
): AlterfordEvent[] {
  return journal.filter((event) => event.blockNumber < rollbackBlock);
}

export function replayEventJournal(state: ProjectionState, journal: readonly AlterfordEvent[]): ProjectionState {
  for (const event of journal) {
    projectEvent(state, event);
  }
  return state;
}
