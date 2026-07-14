# Alterford

Alterford is a Web3 prediction markets, bounties, challenges, and social entertainment ecosystem built first for Base.

This repository implements the Alterford Constitution v1.1 as a monorepo:

- `apps/web`: React/Vite/Tailwind PWA with Vanilla and Underworld modes.
- `packages/contracts`: Foundry Solidity contracts.
- `packages/sdk`: shared TypeScript domain rules, DTOs, constants, and calculators.
- `packages/indexer`: event projection and API foundation.

Core constitutional rules:

- The house never bets against users.
- Funds are escrow-first.
- Base is the initial target chain.
- Market fees are dynamic and capped by the legacy 3.5% market ceiling on the losing pool: small markets use 3.0%, standard markets preserve 3.5%, large markets use 2.5%, and very large markets use 2.0%.
- Challenge fees are platform-only and volume-tiered: 10%, 8%, 6%, or 4% depending on reward size.
- Creation bond is dynamic through `CreationBondPolicy`: small low-risk Vanilla markets can use a low bond, while Underworld, high-risk, disputed, or fraud-prone creators require progressively higher escrowed bonds.
- Growth, quests, referrals, campaigns, and monetization cannot use market escrow.

## Current End-to-End Scope

The repo now includes the real local Web3 loop:

1. Connect wallet through WalletConnect-first wagmi configuration, with injected wallet fallback.
2. Detect the active chain and switch to Base Sepolia or local Anvil.
3. Read settlement-token balance and allowance.
4. Approve only the currently required amount for creation bond plus selected bet.
5. Create a bonded market through `MarketFactory`.
6. Place escrowed bets through `placeBet`.
7. Resolve a market through the resolver role.
8. Claim winner rewards or no-winners/cancelled refunds.
9. Persist emitted events through the indexer read model.

## Commands

Install and verify:

```bash
pnpm install
pnpm test
pnpm build
```

Foundry verification from WSL:

```bash
cd packages/contracts
forge build
forge test
```

If Foundry is installed at `~/.foundry/bin`, use:

```bash
~/.foundry/bin/forge build
~/.foundry/bin/forge test
```

## Local Anvil Flow

Start Anvil:

```bash
anvil --host 0.0.0.0 --chain-id 31337
```

If Anvil runs inside WSL and Windows clients cannot reach `127.0.0.1:8545`, start it with:

```bash
ANVIL_IP_ADDR=0.0.0.0 anvil --chain-id 31337
```

Deploy contracts and write frontend env:

```bash
pnpm contracts:build
pnpm deploy:local
pnpm contracts:export-abis
pnpm web:env 31337
pnpm dev
```

The deployment is written to `deployments/31337.json`. The frontend env is written to `apps/web/.env.local`.

Run the reproducible local product demo:

```bash
pnpm demo:local-flow
```

Expected result:

- settlement token is minted to creator and bettors;
- creator approves the dynamic creation bond;
- market is created with `CreationBondPolicy`;
- two bettors approve and place bets;
- local time advances;
- resolver resolves the market;
- winner claims reward;
- winner final balance is `3.91 USDT` after the small-market `3.0%` dynamic fee on the losing pool.

In the web app:

1. Connect wallet.
2. Switch to Anvil if using local wallet RPC, or set `VITE_CHAIN_ID=84532` for Base Sepolia.
3. Mint test USDT.
4. Approve token.
5. Create market.
6. Place bet.
7. Resolve after the configured resolution time or with a local test account that has resolver role.
8. Claim reward or refund.

## Base Sepolia Deploy

Import a funded deployer into the Foundry encrypted keystore and set the account name:

```bash
cast wallet import alterford-base-sepolia
set FOUNDRY_ACCOUNT=alterford-base-sepolia
set FOUNDRY_PASSWORD_FILE=C:\path\to\foundry-password.txt
set BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
set SECURITY_COUNCIL_ADDRESS=<Safe multisig address>
set COLD_WALLET_ADDRESS=<distinct cold wallet address>
set BASESCAN_API_KEY=<Basescan API key>
pnpm contracts:build
pnpm release:base-sepolia
```

The release reuses the existing settlement token and bond policy, deploys the three
factories plus `BountyRecoveryVault`, exports ABIs, writes frontend/indexer env files,
and verifies contracts. `PRIVATE_KEY` is not used for Base Sepolia.

Run preflight before broadcasting:

```bash
pnpm deploy:base-sepolia:preflight
```

Verify with Basescan when `BASESCAN_API_KEY` is available:

```bash
pnpm deploy:base-sepolia:verify
```

## Indexer

Build and run the read-only indexer:

```bash
pnpm build
set CHAIN_ID=31337
set RPC_URL=http://127.0.0.1:8545
set MARKET_FACTORY_ADDRESS=<deployed MarketFactory>
set INDEXER_STORE=data/alterford-31337.json
pnpm --filter @alterford/indexer start
```

Endpoints:

- `GET /health`
- `GET /markets`
- `GET /markets/:id`
- `GET /bounties` and `GET /bounties/:id`
- `GET /challenges` and `GET /challenges/:id`
- `GET /bets?marketId=1&user=0x...`
- `GET /claims?marketId=1&user=0x...`
- `GET /fees/:marketId`
- `GET /bonds/:entityType/:entityId`

The indexer processes confirmed logs only. Use `CONFIRMATIONS=0` for local Anvil and `CONFIRMATIONS=6` or higher for Base Sepolia.

After `pnpm demo:local-flow`, local indexer responses should include:

- `/markets`: one resolved market with totalPool `4000000`;
- `/bets?marketId=1`: YES `1000000` and NO `3000000`;
- `/claims?marketId=1`: winner reward `3910000`.

## Production Readiness

Operational runbooks are maintained in `docs/PRODUCTION_RUNBOOK.md`.

Security and coverage:

```bash
pnpm contracts:coverage
pnpm security:all
```

`security:slither` audits application contracts while filtering vendored libraries,
tests and deployment scripts. It excludes `timestamp`, `divide-before-multiply` and
the OpenZeppelin role-getter naming convention by design. Other Slither findings fail
the scan.

Use strict security mode before production gates:

```bash
set SECURITY_STRICT=1
pnpm security:all
```

The indexer exposes `/health`, `/metrics`, and `/snapshot` for observability and replay operations.

## Static PWA Publication

One relative-path production build is used for every static destination:

```bash
pnpm build:web:static
```

Set `VITE_INDEXER_URL` and `VITE_APP_URL` to public HTTPS endpoints for a live
release. The static builder removes local/loopback values instead of embedding
developer-machine addresses in an immutable publication.

Fast IPFS releases use either Pinata or Fleek through environment variables:

```bash
set PINNING_PROVIDER=pinata
set PINNING_TOKEN=<Pinata JWT>
pnpm deploy:web:ipfs
```

Stable immutable releases use Arweave through Irys:

```bash
set IRYS_PRIVATE_KEY=<release wallet key>
pnpm release:web:stable
```

The static preflight rejects loopback URLs, deploy credentials, source maps, and
other environment-specific data before publication. RPC, indexer and wallet traffic
remain network-only in the service worker and are never cached.
