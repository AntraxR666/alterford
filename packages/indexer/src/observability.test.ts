import { describe, expect, it } from "vitest";
import { createIndexerMetrics, createStructuredLogger, renderHealth } from "./observability.js";
import { createInitialProjectionState } from "./projections.js";

describe("indexer observability", () => {
  it("tracks metrics and renders production health payloads", () => {
    const metrics = createIndexerMetrics();
    metrics.recordPoll({ processedEvents: 3, latestBlock: 12n, lastProcessedBlock: 10n });
    metrics.recordError("rpc_timeout");

    const health = renderHealth({
      projection: createInitialProjectionState(),
      cursor: { chainId: 31337, confirmations: 0, lastProcessedBlock: 10n },
      journal: [],
      blockCheckpoints: new Map(),
      metrics,
    });

    expect(health.ok).toBe(true);
    expect(health.metrics.totalEventsProcessed).toBe(3);
    expect(health.metrics.errorCount).toBe(1);
    expect(health.cursor.lastProcessedBlock).toBe("10");
  });

  it("emits structured log entries with stable fields", () => {
    const entries: unknown[] = [];
    const logger = createStructuredLogger("test", (entry) => entries.push(entry));

    logger.info("indexer.poll", { chainId: 31337, processedEvents: 2 });

    expect(entries).toEqual([
      expect.objectContaining({
        level: "info",
        component: "test",
        event: "indexer.poll",
        chainId: 31337,
        processedEvents: 2,
      }),
    ]);
  });
});
