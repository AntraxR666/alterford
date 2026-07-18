# Alterford Visual Lifecycle and Resolution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the approved visual refinement while making market and challenge lifecycle states accurate, understandable, and safely actionable from the UI.

**Architecture:** Add pure presentation helpers for lifecycle decisions, enrich the indexer market read model with on-chain times, expose role-aware transaction helpers from the existing Web3 hook, and render separate active/history and participant/operator workflows. Contracts, fees, bonds, allowance calculations, and deployment addresses remain unchanged.

**Tech Stack:** React 19, TypeScript, Vite, Wagmi, Viem, Vitest, Testing Library, Node indexer, Railway, Base Sepolia.

## Global Constraints

- Do not change ERC-20 allowance calculations or approval transaction behavior.
- Do not modify or redeploy contracts.
- Preserve the 3.5% market fee split and current challenge fee policy.
- Preserve Vanilla, Underworld, `isUnderworldMode`, PWA, and static-build behavior.
- All monetary values remain `bigint` in protocol and SDK boundaries.
- Terminal entities remain available as history but never as active opportunities.

---

### Task 1: Lifecycle presentation rules

**Files:**
- Create: `apps/web/src/features/lifecycle.ts`
- Create: `apps/web/src/features/lifecycle.test.ts`

**Interfaces:**
- Produces: `marketAvailability(market, nowSeconds)`, `challengeAvailability(challenge, nowSeconds)`, `partitionChallenges(challenges, nowSeconds)`.
- Consumes: `MarketDTO`, `ChallengeDTO` from `@alterford/sdk`.

- [ ] **Step 1: Write failing tests** covering resolved markets, open markets after lock time, cancelled challenge history, expired unaccepted challenge, and accepted challenge awaiting resolution.
- [ ] **Step 2: Run** `pnpm --filter @alterford/web exec vitest run --environment jsdom src/features/lifecycle.test.ts` and confirm failures because the module is absent.
- [ ] **Step 3: Implement pure typed helpers** returning `{ group, label, actionable, urgency }`, where groups are `active`, `resolution`, and `history`.
- [ ] **Step 4: Run the focused test** and confirm all lifecycle cases pass.

### Task 2: Index market lifecycle timestamps

**Files:**
- Modify: `packages/indexer/src/events.ts`
- Modify: `packages/indexer/src/projections.ts`
- Modify: `packages/indexer/src/listener.ts`
- Modify: `packages/indexer/src/store.ts`
- Modify: `packages/indexer/src/listener.test.ts`
- Modify: `packages/indexer/src/projections.test.ts`

**Interfaces:**
- `MarketCreated.payload.lockTime?: bigint`
- `MarketCreated.payload.resolutionTime?: bigint`
- `MarketProjection.lockTime?: bigint`
- `MarketProjection.resolutionTime?: bigint`

- [ ] **Step 1: Extend tests first** so a decoded `MarketCreated` and replayed projection retain both timestamps.
- [ ] **Step 2: Run** `pnpm --filter @alterford/indexer test` and confirm the new assertions fail.
- [ ] **Step 3: Read `markets(id)` during `MarketCreated` decoding** and include settlement token, state, lock time, and resolution time in the event payload.
- [ ] **Step 4: Persist and serialize both bigint fields** in projections and snapshots.
- [ ] **Step 5: Re-run indexer tests** and confirm pass.

### Task 3: Role-aware market and challenge actions

**Files:**
- Modify: `apps/web/src/hooks/useWeb3Flow.ts`
- Modify: `packages/sdk/src/abis.ts` only if the existing exported ABIs omit `hasRole`.
- Modify: `apps/web/src/web3/transactionErrors.ts`
- Test: `packages/sdk/src/abis.test.ts`
- Test: `apps/web/src/web3/transactionErrors.test.ts`

**Interfaces:**
- Produces `isMarketResolver`, `isChallengeArbiter` booleans.
- Replaces `resolveMarket()` with `resolveMarket({ marketId: string, winningOutcome: 0 | 1 })`.
- Retains existing challenge methods but exposes permission state to the UI.

- [ ] **Step 1: Add failing ABI and error-message tests** for role reads and unauthorized resolution.
- [ ] **Step 2: Run focused tests** and confirm expected failures.
- [ ] **Step 3: Add `hasRole` reads** using `keccak256(toBytes("RESOLVER"))` and `keccak256(toBytes("ARBITER"))` against the connected account.
- [ ] **Step 4: Make market resolution arguments explicit** and map unauthorized errors to a clear operator-only message.
- [ ] **Step 5: Run SDK/web focused tests and typecheck.**

### Task 4: Safe market explorer and operator resolution panel

**Files:**
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/App.test.tsx`
- Modify: `apps/web/src/styles.css`

**Interfaces:**
- Consumes lifecycle helpers and `isMarketResolver`.
- Produces a selected open market for betting and a separate selected resolvable market for the operator.

- [ ] **Step 1: Add failing component tests** proving resolved markets do not appear in active discovery, elapsed markets move to resolution, no bet ticket exists without an open market, and resolution requires explicit market and winning outcome selection.
- [ ] **Step 2: Run `App.test.tsx`** and confirm the new expectations fail.
- [ ] **Step 3: Add search/category filters and lifecycle partitioning** without changing bet or allowance callbacks.
- [ ] **Step 4: Replace the single Creator Center resolve button** with an explicit resolution panel showing market ID, question, eligibility time, winner selector, role status, and confirmation copy.
- [ ] **Step 5: Re-run component tests** and confirm pass.

### Task 5: Active challenge workflow and history

**Files:**
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/App.test.tsx`
- Modify: `apps/web/src/styles.css`

**Interfaces:**
- Consumes `partitionChallenges`, connected address, and `isChallengeArbiter`.
- Produces active, resolution-required, and history sections.

- [ ] **Step 1: Add failing tests** proving cancelled/resolved challenges are history, expired open challenges cannot be accepted, and only valid actions for the selected challenge state are visible.
- [ ] **Step 2: Run `App.test.tsx`** and confirm failures.
- [ ] **Step 3: Split cards into active/resolution/history groups** and add deadline labels derived from indexed timestamps.
- [ ] **Step 4: Replace the undifferentiated action grid** with participant flow (`accept`, `evidence`, `propose`, `confirm`, `dispute`, `finalize`) and a separately labelled arbiter flow.
- [ ] **Step 5: Re-run component tests** and confirm pass.

### Task 6: Approved Vanilla and Underworld visual refinement

**Files:**
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/styles.css`
- Modify: `apps/web/src/App.test.tsx`

**Interfaces:**
- Preserves all existing callbacks and product tabs.
- Adds no runtime dependency unless existing CSS cannot meet the approved motion requirements.

- [ ] **Step 1: Add semantic assertions** for search, category navigation, lifecycle badges, payout labels, and Underworld evidence status.
- [ ] **Step 2: Implement the approved hierarchy**: compact header, scannable market rows, sticky desktop ticket, mobile focused ticket, and controlled Underworld accents.
- [ ] **Step 3: Add reduced-motion CSS** disabling nonessential transitions and keyframes.
- [ ] **Step 4: Run web tests, typecheck, and build.**

### Task 7: Production verification and publication

**Files:**
- Modify only if verification finds a defect: `apps/web/nginx.conf`, `apps/web/vite.config.ts`.

**Interfaces:**
- Produces a verified Railway deployment and preserves decentralized static artifacts.

- [ ] **Step 1: Run** `pnpm --filter @alterford/web test`, `pnpm --filter @alterford/web typecheck`, `pnpm --filter @alterford/web build`, and `pnpm --filter @alterford/indexer test`.
- [ ] **Step 2: Check desktop and mobile screenshots** for Vanilla and Underworld, including empty, active, resolution, and history states.
- [ ] **Step 3: Deploy the indexer only if timestamp schema changed**, then verify `/health`, `/markets`, and `/challenges` after replay.
- [ ] **Step 4: Deploy `alterford-web` to Railway**, verify the new asset hash, service-worker headers, and public UI.
- [ ] **Step 5: Confirm on-chain state remains unchanged** except for any separately user-authorized resolution transaction; no resolution transaction is part of this deployment plan.
