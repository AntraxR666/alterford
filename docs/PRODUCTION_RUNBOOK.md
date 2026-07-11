# Alterford v1.1 Production Runbook

Status: production-readiness runbook for Base Sepolia and Base Mainnet preparation.

## Networks

- Local: `31337`, Anvil.
- Testnet: `84532`, Base Sepolia.
- Mainnet target: `8453`, Base.

Base remains the initial production target. Arbitrum, Polygon, and Optimism remain prepared expansion networks.

## Deploy To Base Sepolia

Prerequisites:

- Foundry encrypted keystore account funded with Base Sepolia ETH.
- `FOUNDRY_ACCOUNT` or `ETH_KEYSTORE_ACCOUNT`.
- `FOUNDRY_PASSWORD_FILE` or `ETH_PASSWORD` for non-interactive deploys.
- `BASE_SEPOLIA_RPC_URL` or default `https://sepolia.base.org`.
- Optional `BASESCAN_API_KEY` for verification.

Commands:

```bash
pnpm install
pnpm contracts:build
cast wallet import alterford-base-sepolia
set FOUNDRY_ACCOUNT=alterford-base-sepolia
set FOUNDRY_PASSWORD_FILE=C:\path\to\foundry-password.txt
set BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
pnpm deploy:base-sepolia:preflight
pnpm deploy:base-sepolia
pnpm contracts:export-abis
pnpm web:env 84532
```

Verification:

```bash
set BASESCAN_API_KEY=...
pnpm deploy:base-sepolia:verify
```

Outputs:

- `deployments/84532.json`
- `deployments/abis/*.json`
- `apps/web/.env.local`

## Local Production Smoke

```bash
ANVIL_IP_ADDR=0.0.0.0 anvil --chain-id 31337
pnpm deploy:local
pnpm web:env 31337
pnpm demo:local-flow
```

Expected demo output includes:

- `marketId: "1"`
- `yesBalance: "3910000"`
- `expectedWinnerBalance: "3910000"`

This validates mint, approve, create market, bet, resolve, claim, and the active dynamic market fee policy.

## Indexer Operations

Start local indexer:

```bash
set CHAIN_ID=31337
set RPC_URL=http://127.0.0.1:8545
set MARKET_FACTORY_ADDRESS=<MarketFactory>
set INDEXER_STORE=data/alterford-31337.json
set CONFIRMATIONS=0
pnpm --filter @alterford/indexer build
pnpm --filter @alterford/indexer start
```

Base Sepolia indexer:

```bash
set CHAIN_ID=84532
set RPC_URL=https://sepolia.base.org
set MARKET_FACTORY_ADDRESS=<Base Sepolia MarketFactory>
set INDEXER_STORE=data/alterford-84532.json
set CONFIRMATIONS=6
pnpm --filter @alterford/indexer start
```

Read-only endpoints:

- `/health`
- `/metrics`
- `/snapshot`
- `/markets`
- `/markets/:id`
- `/bets?marketId=1`
- `/claims?marketId=1`
- `/fees/:marketId`
- `/bonds/:entityType/:entityId`

Reorg policy:

- The indexer stores block checkpoints and a journal of processed events.
- If a block hash mismatch is detected, it rolls back events from the first mismatched block.
- The read model is replayed from the persisted canonical journal.
- Use `CONFIRMATIONS=0` only for local Anvil.
- Use `CONFIRMATIONS=6` or higher for Base Sepolia.
- Raise confirmations for mainnet during abnormal chain conditions.

Snapshot policy:

- `/snapshot` exposes cursor, journal length, checkpoint count, and read-model counts.
- Persist `data/alterford-<chainId>.json` as an operational artifact.
- Recovery is replay based: restart the indexer with the same store path.

## Security Checks

Foundry:

```bash
forge fmt --check
forge build
forge test
forge coverage --ir-minimum
```

Static and property tools:

```bash
pnpm security:slither
pnpm security:echidna
pnpm security:mythril
pnpm security:all
```

By default, missing external tools are reported as skipped so CI can run in minimal environments.
Set `SECURITY_STRICT=1` to fail if Slither, Echidna, or Mythril is not installed.

Slither policy:

- `timestamp` is accepted for deadline, lock, resolution, and subscription windows.
- `divide-before-multiply` is accepted for discrete bond volume tiers.
- Reentrancy, arbitrary token transfer, access-control, and ERC20 interaction findings must be fixed or explicitly reviewed before release.

Install guidance:

- Slither: `pipx install slither-analyzer`
- Local WSL fallback: `python3 -m venv .venv-slither && . .venv-slither/bin/activate && pip install slither-analyzer`
- Mythril: `pipx install mythril`
- Echidna: install from official Crytic release packages.

## Rollback

Contract rollback:

- Do not mutate existing deployment files.
- Deploy a new version and write a new `deployments/<chainId>.json`.
- Keep previous deployment JSON for operator rollback.
- Point frontend env back to previous contract addresses with `pnpm web:env <chainId>` after restoring the target deployment file.

Indexer rollback:

- Stop indexer.
- Restore previous `data/alterford-<chainId>.json`.
- Restart indexer.
- Confirm `/health`, `/snapshot`, and read endpoints.

Frontend rollback:

- Redeploy the previous static build artifact.
- Verify `VITE_CHAIN_ID` and contract addresses match intended deployment.

## Mainnet Readiness Gate

Before Base Mainnet:

- All TypeScript tests pass.
- All Foundry tests pass.
- Coverage report reviewed.
- Slither, Echidna, and Mythril run in strict mode.
- Base Sepolia deployment verified.
- At least one full local and Base Sepolia demo flow completed.
- Indexer replay tested from persisted store.
- Runbook owner signs off on rollback procedure.
