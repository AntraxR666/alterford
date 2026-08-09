# Non-Custodial XMR Conversion Rail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the disabled custody-style Monero rail with a provider-agnostic XMR-to-Base conversion flow that settles directly to the user's wallet.

**Architecture:** The gateway owns quote orchestration, idempotent persistence, provider normalization, EIP-712 order authorization, and independent Base settlement verification. Providers receive XMR and send the existing settlement token directly to the user's wallet; Solidity contracts remain unchanged.

**Tech Stack:** TypeScript, Node HTTP, Viem, React/Vite, Vitest, atomic JSON persistence, external swap provider REST APIs.

## Global Constraints

- No Alterford XMR custody, synthetic token, manual balance, or contract change.
- `1,500 USDC` equivalent is the initial configurable assisted threshold.
- Provider-reported completion is insufficient without Base verification.
- Existing native Monero endpoints remain disabled and are removed from public capabilities.
- Provider secrets never enter `VITE_*` variables or browser bundles.

---

### Task 1: Conversion domain and atomic ledger

**Files:**
- Create: `packages/gateway/src/xmrConversion.ts`
- Create: `packages/gateway/src/xmrConversionLedger.ts`
- Test: `packages/gateway/src/xmrConversion.test.ts`

**Interfaces:**
- Produces: `XmrQuote`, `XmrConversion`, `XmrAssistanceCase`, `XmrConversionProvider`, and `XmrConversionLedger`.

- [ ] Write failing tests for decimal-safe quote normalization, immutable destination wallet, idempotent quote/order/case creation, allowed state transitions, expiry, and atomic serialization.
- [ ] Run `pnpm --filter @alterford/gateway exec vitest run src/xmrConversion.test.ts`; expect missing-module failure.
- [ ] Implement the domain types, transition guards, and bigint-safe atomic ledger.
- [ ] Re-run the focused test; expect all cases to pass.

### Task 2: Provider adapter and settlement verifier

**Files:**
- Create: `packages/gateway/src/xmrProviders.ts`
- Create: `packages/gateway/src/baseSettlementVerifier.ts`
- Test: `packages/gateway/src/xmrProviders.test.ts`
- Test: `packages/gateway/src/baseSettlementVerifier.test.ts`

**Interfaces:**
- Consumes: `XmrConversionProvider` from Task 1.
- Produces: `SideShiftXmrProvider` and `ViemBaseSettlementVerifier`.

- [ ] Write failing provider tests for capability, permission, fixed quote, order, status, timeout, malformed response, redacted errors, and forwarded end-user IP.
- [ ] Write failing verifier tests for wrong chain, token, recipient, amount, failed receipt, insufficient confirmations, and valid ERC-20 transfer.
- [ ] Implement the SideShift-compatible adapter behind the generic interface and a Viem ERC-20 settlement verifier.
- [ ] Run both focused tests; expect all cases to pass.

### Task 3: Orchestration and HTTP API

**Files:**
- Create: `packages/gateway/src/xmrConversionService.ts`
- Test: `packages/gateway/src/xmrConversionService.test.ts`
- Modify: `packages/gateway/src/server.ts`
- Modify: `packages/gateway/src/server.test.ts`
- Modify: `packages/gateway/src/cli.ts`

**Interfaces:**
- Consumes: provider, verifier, and ledger from Tasks 1-2.
- Produces: capabilities, quote, conversion, status, assistance, and operator synchronization methods.

- [ ] Write failing tests for automatic routing below threshold, assisted routing at/above threshold, voluntary assistance, ownership signature, quote expiry, idempotency, direct-to-wallet settlement, and independent completion verification.
- [ ] Add the six `/v1/xmr/*` routes and operator-authenticated synchronization.
- [ ] Disable the old `/v1/crypto/xmr/*` public routes whenever conversion mode is selected.
- [ ] Run gateway tests; expect all tests to pass.

### Task 4: Transparent frontend flow

**Files:**
- Modify: `apps/web/src/web3/gatewayClient.ts`
- Modify: `apps/web/src/web3/gatewayClient.test.ts`
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/App.test.tsx`

**Interfaces:**
- Consumes: `/v1/xmr/capabilities`, `/quotes`, `/conversions`, and `/assistance`.

- [ ] Write failing UI/client tests for all quote fields, fee mode, expiry, assisted routing, payment instructions, status polling, and Base settlement link.
- [ ] Replace `MoneroDepositCard` with `XmrConversionCard`; never display an Alterford-owned XMR address.
- [ ] Require explicit quote acceptance before creating an order and display provider identity and destination wallet.
- [ ] Run focused web tests; expect all tests to pass.

### Task 5: Production wiring and verification

**Files:**
- Modify: `.env.example`
- Modify: `Dockerfile.gateway`
- Modify: `docs/ALTERFORD_MASTER_BOOK.md`

- [ ] Add only the server-side variables defined by the specification and durable ledger mount requirements.
- [ ] Add preflight failure when provider, Base RPC, token, or durable storage is incomplete.
- [ ] Run `pnpm --filter @alterford/gateway test`, `pnpm --filter @alterford/web test`, `pnpm typecheck`, and `pnpm build`.
- [ ] Run a mocked end-to-end flow: quote -> order -> provider settlement -> verified Base transfer -> completed.
- [ ] Keep production capability disabled until a provider account secret and Base Mainnet settlement token are configured.
