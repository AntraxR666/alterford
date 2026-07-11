import type { IndexerCursor, PersistedIndexerState } from "./store.js";

export interface IndexerMetrics {
  totalPolls: number;
  totalEventsProcessed: number;
  errorCount: number;
  latestBlock: bigint;
  lastProcessedBlock: bigint;
  lastError?: string;
  lastPollAt?: string;
  recordPoll(input: { processedEvents: number; latestBlock: bigint; lastProcessedBlock: bigint }): void;
  recordError(error: string): void;
  snapshot(): IndexerMetricsSnapshot;
}

export interface IndexerMetricsSnapshot {
  totalPolls: number;
  totalEventsProcessed: number;
  errorCount: number;
  latestBlock: string;
  lastProcessedBlock: string;
  lastError?: string;
  lastPollAt?: string;
}

export interface HealthPayload {
  ok: boolean;
  cursor: Omit<IndexerCursor, "lastProcessedBlock"> & { lastProcessedBlock: string };
  metrics: IndexerMetricsSnapshot;
  readModel: {
    markets: number;
    challenges: number;
    bets: number;
    claims: number;
    bonds: number;
  };
}

export interface StructuredLogEntry {
  timestamp: string;
  level: "info" | "warn" | "error";
  component: string;
  event: string;
  [key: string]: unknown;
}

export function createIndexerMetrics(): IndexerMetrics {
  return {
    totalPolls: 0,
    totalEventsProcessed: 0,
    errorCount: 0,
    latestBlock: 0n,
    lastProcessedBlock: 0n,
    recordPoll(input) {
      this.totalPolls += 1;
      this.totalEventsProcessed += input.processedEvents;
      this.latestBlock = input.latestBlock;
      this.lastProcessedBlock = input.lastProcessedBlock;
      this.lastPollAt = new Date().toISOString();
    },
    recordError(error) {
      this.errorCount += 1;
      this.lastError = error;
    },
    snapshot() {
      return {
        totalPolls: this.totalPolls,
        totalEventsProcessed: this.totalEventsProcessed,
        errorCount: this.errorCount,
        latestBlock: this.latestBlock.toString(),
        lastProcessedBlock: this.lastProcessedBlock.toString(),
        lastError: this.lastError,
        lastPollAt: this.lastPollAt,
      };
    },
  };
}

export function renderHealth(state: PersistedIndexerState & { metrics: IndexerMetrics }): HealthPayload {
  return {
    ok: state.metrics.errorCount < 10,
    cursor: {
      chainId: state.cursor.chainId,
      confirmations: state.cursor.confirmations,
      lastProcessedBlock: state.cursor.lastProcessedBlock.toString(),
    },
    metrics: state.metrics.snapshot(),
    readModel: {
      markets: state.projection.markets.size,
      challenges: state.projection.challenges.size,
      bets: state.projection.bets.size,
      claims: state.projection.claims.size,
      bonds: state.projection.bonds.size,
    },
  };
}

export function createStructuredLogger(
  component: string,
  sink: (entry: StructuredLogEntry) => void = (entry) => console.log(JSON.stringify(entry)),
) {
  function write(level: StructuredLogEntry["level"], event: string, fields: Record<string, unknown>) {
    sink({
      timestamp: new Date().toISOString(),
      level,
      component,
      event,
      ...fields,
    });
  }

  return {
    info: (event: string, fields: Record<string, unknown> = {}) => write("info", event, fields),
    warn: (event: string, fields: Record<string, unknown> = {}) => write("warn", event, fields),
    error: (event: string, fields: Record<string, unknown> = {}) => write("error", event, fields),
  };
}
