const chainId = Number(process.env.CHAIN_ID || process.argv[2] || "31337");
const indexerUrl = process.env.INDEXER_URL || process.env.VITE_INDEXER_URL || "http://127.0.0.1:8787";

const health = await fetchJson(`${indexerUrl}/health`);
const markets = await fetchJson(`${indexerUrl}/markets`);
const ok = Boolean(health.ok && Number(health.cursor?.chainId) === chainId && Array.isArray(markets));

console.log(
  JSON.stringify(
    {
      ok,
      indexerUrl,
      expectedChainId: chainId,
      actualChainId: health.cursor?.chainId,
      lastProcessedBlock: health.cursor?.lastProcessedBlock,
      markets: Array.isArray(markets) ? markets.length : null,
      errors: health.metrics?.errorCount,
    },
    null,
    2,
  ),
);

process.exitCode = ok ? 0 : 1;

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
  return response.json();
}
