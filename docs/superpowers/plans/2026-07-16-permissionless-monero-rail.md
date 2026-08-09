# Permissionless Monero Rail Implementation Plan

> **Superseded on 2026-07-17:** This custody-style `monero-wallet-rpc` design is retained only as history. The active decision and implementation plan are `docs/superpowers/specs/2026-07-17-noncustodial-xmr-conversion-rail.md` and `docs/superpowers/plans/2026-07-17-noncustodial-xmr-conversion-rail.md`.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a self-hosted Monero deposit and withdrawal rail that does not require commercial API approval, while keeping Alterford's Base contracts and economics unchanged.

**Architecture:** The existing gateway gains an optional `monero-wallet-rpc` adapter and an atomic JSON ledger. Each deposit request receives a unique Monero subaddress tied to an EVM beneficiary, and confirmed incoming transfers are reported without automatically minting USDC or inventing an internal betting balance. Withdrawals are created only through the authenticated server-side wallet RPC and remain disabled unless the operator explicitly enables them.

**Tech Stack:** TypeScript, Node HTTP, Monero Wallet RPC JSON-RPC, atomic JSON persistence, React/Vite, Vitest.

---

### Task 1: Monero RPC boundary

**Files:**
- Create: `packages/gateway/src/moneroRpc.ts`
- Test: `packages/gateway/src/moneroRpc.test.ts`

- [ ] Write failing tests for authenticated RPC calls, unique subaddress creation, incoming transfer normalization, transfer submission, malformed responses and upstream failures.
- [ ] Run `pnpm --filter @alterford/gateway test -- moneroRpc.test.ts` and confirm the tests fail because the adapter does not exist.
- [ ] Implement a focused `MoneroWalletRpcClient` with `createAddress`, `incomingTransfers`, `transfer` and `height`.
- [ ] Re-run the focused tests and confirm they pass.

### Task 2: Persistent payment ledger

**Files:**
- Create: `packages/gateway/src/cryptoLedger.ts`
- Create: `packages/gateway/src/cryptoLedgerFile.ts`
- Test: `packages/gateway/src/cryptoLedger.test.ts`

- [ ] Write failing tests for idempotent deposit requests, unique subaddress ownership, confirmation updates, no double credit, withdrawal idempotency and atomic serialization.
- [ ] Run the focused tests and confirm the expected failures.
- [ ] Implement bigint-safe records and atomic file replacement following the existing sponsorship ledger pattern.
- [ ] Re-run the focused tests and confirm they pass.

### Task 3: Permissionless crypto service and HTTP API

**Files:**
- Create: `packages/gateway/src/moneroService.ts`
- Test: `packages/gateway/src/moneroService.test.ts`
- Modify: `packages/gateway/src/server.ts`
- Modify: `packages/gateway/src/server.test.ts`
- Modify: `packages/gateway/src/cli.ts`

- [ ] Write failing tests for deposit creation/status, confirmation synchronization, disabled withdrawals, validated XMR addresses, idempotent withdrawals and public capability reporting.
- [ ] Run the gateway tests and confirm the new behavior is absent.
- [ ] Add:
  - `POST /v1/crypto/xmr/deposits`
  - `GET /v1/crypto/xmr/deposits/:id`
  - `POST /v1/crypto/xmr/sync`
  - `POST /v1/crypto/xmr/withdrawals`
- [ ] Require an explicit operator sync token for synchronization and keep withdrawals disabled by default.
- [ ] Re-run all gateway tests.

### Task 4: Frontend XMR deposit experience

**Files:**
- Modify: `apps/web/src/web3/gatewayClient.ts`
- Modify: `apps/web/src/web3/gatewayClient.test.ts`
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/App.test.tsx`

- [ ] Write failing tests showing that XMR availability comes from gateway capabilities and that creating a deposit displays the native XMR address, amount and confirmation state.
- [ ] Implement the typed gateway client methods and a simple deposit panel.
- [ ] State explicitly that native XMR is not yet spendable in Base markets until a separately audited bridge/conversion layer exists.
- [ ] Re-run web tests.

### Task 5: Configuration and verification

**Files:**
- Modify: `.env.example`
- Modify: `docs/ALTERFORD_MASTER_BOOK.md`

- [ ] Add non-secret variables for Monero network, RPC URL, ledger path, minimum confirmations, sync token and withdrawal enablement.
- [ ] Document that Transak, Coinbase and OAuth are optional adapters, not protocol dependencies.
- [ ] Run:
  - `pnpm typecheck`
  - `pnpm test`
  - `pnpm build`
  - `pnpm test:web:pipeline`
  - `forge test`
- [ ] Confirm the repository remains clean except for the intended implementation.
