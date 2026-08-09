import { resolve } from "node:path";
import type { Address } from "viem";
import { pollMarketFactoryEvents } from "./listener.js";
import { createIndexerMetrics, createStructuredLogger, renderHealth } from "./observability.js";
import { startReadServer } from "./server.js";
import { loadIndexerState, replayPersistedJournal, snapshotIndexerState } from "./store.js";
import { resolveRpcUrls } from "./rpcConfig.js";

const chainId = Number(process.env.CHAIN_ID || "31337");
const rpcUrls = resolveRpcUrls(process.env, chainId);
const rpcUrl = rpcUrls[0];
const marketFactory = process.env.MARKET_FACTORY_ADDRESS as Address | undefined;
const bountyFactory = process.env.BOUNTY_FACTORY_ADDRESS as Address | undefined;
const challengeFactory = process.env.CHALLENGE_FACTORY_ADDRESS as Address | undefined;
const bountyRecoveryVault = process.env.BOUNTY_RECOVERY_VAULT_ADDRESS as Address | undefined;
const commandRoot = process.env.INIT_CWD || process.cwd();
const storePath = process.env.INDEXER_STORE
  ? resolve(commandRoot, process.env.INDEXER_STORE)
  : resolve(commandRoot, "data", `alterford-${chainId}.json`);
const port = Number(process.env.PORT || "8787");
const confirmations = Number(process.env.CONFIRMATIONS || (chainId === 31337 ? "0" : "6"));
const startBlock = BigInt(process.env.START_BLOCK || "0");

if (!marketFactory) {
  throw new Error("MARKET_FACTORY_ADDRESS is required to start the Alterford indexer.");
}
const requiredMarketFactory = marketFactory;

const indexerState = await loadIndexerState(storePath, {
  chainId,
  confirmations,
  lastProcessedBlock: startBlock > 0n ? startBlock - 1n : 0n,
});
const replayedState = replayPersistedJournal(indexerState);
indexerState.projection = replayedState.projection;
const metrics = createIndexerMetrics();
const logger = createStructuredLogger("indexer");

startReadServer(
  indexerState.projection,
  port,
  () => renderHealth({ ...indexerState, metrics }),
  () => snapshotIndexerState(indexerState),
);

async function tick() {
  try {
    const before = indexerState.projection.processedEventIds.size;
    await pollMarketFactoryEvents(indexerState, {
      rpcUrl,
      rpcUrls,
      chainId,
      marketFactory: requiredMarketFactory,
      bountyFactory,
      challengeFactory,
      bountyRecoveryVault,
      storePath,
      confirmations,
    });
    const processedEvents = indexerState.projection.processedEventIds.size - before;
    metrics.recordPoll({
      processedEvents,
      latestBlock: indexerState.cursor.lastProcessedBlock,
      lastProcessedBlock: indexerState.cursor.lastProcessedBlock,
    });
    logger.info("indexer.poll", {
      chainId,
      processedEvents,
      lastProcessedBlock: indexerState.cursor.lastProcessedBlock.toString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown_error";
    metrics.recordError(message);
    logger.error("indexer.poll_failed", { chainId, error: message });
    throw error;
  }
}

await tick();
setInterval(() => {
  tick().catch((error) => console.error(error));
}, Number(process.env.POLL_INTERVAL_MS || "12000"));

console.log(`Alterford indexer listening on http://127.0.0.1:${port}`);
