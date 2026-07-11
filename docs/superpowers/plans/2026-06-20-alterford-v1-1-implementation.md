# Alterford v1.1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a working Alterford v1.1 monorepo foundation from the Constitution v1.1: Solidity contracts, TypeScript SDK, React/Vite PWA, stores/hooks, indexer/API skeleton, tests, and CI.

**Architecture:** The implementation uses npm/pnpm workspaces with clear package boundaries. Solidity contracts live in `packages/contracts`, shared domain rules and DTOs live in `packages/sdk`, the PWA lives in `apps/web`, and off-chain read-model/API foundations live in `packages/indexer`.

**Tech Stack:** Solidity/Foundry layout, React, Vite, TailwindCSS, Zustand, Wagmi/Viem-ready adapters, TypeScript, Vitest, GitHub Actions.

---

### Task 1: Workspace Foundation

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`
- Create: `.gitignore`
- Create: `README.md`

- [ ] **Step 1: Write workspace metadata and scripts**

Create a workspace with scripts: `typecheck`, `test`, `build`, and package-scoped commands.

- [ ] **Step 2: Verify package manager can install dependencies**

Run: bundled `pnpm install`
Expected: lockfile created and dependencies installed.

### Task 2: SDK Domain Core

**Files:**
- Create: `packages/sdk/src/types.ts`
- Create: `packages/sdk/src/constants.ts`
- Create: `packages/sdk/src/economics.ts`
- Create: `packages/sdk/src/index.ts`
- Test: `packages/sdk/src/economics.test.ts`

- [ ] **Step 1: Write failing tests for payout formulas**

Tests must cover: fee split, winner payout, zero losing pool, no winners `RefundAll`, and invalid fee configuration.

- [ ] **Step 2: Run SDK tests and observe failure**

Run: `pnpm --filter @alterford/sdk test`
Expected: tests fail because implementation is missing.

- [ ] **Step 3: Implement minimal economic functions**

Implement bigint-safe fee and payout functions matching Constitution v1.0/v1.1.

- [ ] **Step 4: Run SDK tests**

Run: `pnpm --filter @alterford/sdk test`
Expected: all SDK tests pass.

### Task 3: Contract Foundation

**Files:**
- Create: `packages/contracts/foundry.toml`
- Create: `packages/contracts/src/libraries/AlterfordTypes.sol`
- Create: `packages/contracts/src/libraries/AlterfordErrors.sol`
- Create: `packages/contracts/src/security/ReentrancyGuardLite.sol`
- Create: `packages/contracts/src/security/Governed.sol`
- Create: `packages/contracts/src/token/IERC20.sol`
- Create: `packages/contracts/src/core/CoreProtocol.sol`
- Create: `packages/contracts/src/treasury/Treasury.sol`
- Create: `packages/contracts/src/rewards/RewardDistributor.sol`
- Create: `packages/contracts/src/registry/CreatorRegistry.sol`
- Create: `packages/contracts/src/factories/MarketFactory.sol`
- Create: `packages/contracts/src/factories/BountyFactory.sol`
- Create: `packages/contracts/src/growth/ReferralEngine.sol`
- Create: `packages/contracts/src/growth/QuestEngine.sol`
- Create: `packages/contracts/src/reputation/ReputationEngine.sol`
- Create: `packages/contracts/src/oracle/OracleRouter.sol`
- Create: `packages/contracts/src/oracle/EvidenceVault.sol`
- Create: `packages/contracts/src/moderation/ModerationCouncil.sol`

- [ ] **Step 1: Implement constitution-aligned contract interfaces and state**

Contracts must preserve no-house-risk, escrow-first, module registration, role checks, events, errors, and v1.1 extension boundaries.

- [ ] **Step 2: Add Foundry-style tests**

Add tests for economic invariants and module restrictions where possible.

### Task 4: React/Vite PWA

**Files:**
- Create: `apps/web/package.json`
- Create: `apps/web/index.html`
- Create: `apps/web/vite.config.ts`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/tailwind.config.ts`
- Create: `apps/web/postcss.config.js`
- Create: `apps/web/src/main.tsx`
- Create: `apps/web/src/App.tsx`
- Create: `apps/web/src/styles.css`
- Create: `apps/web/src/stores/*.ts`
- Create: `apps/web/src/hooks/*.ts`
- Create: `apps/web/src/features/*`
- Create: `apps/web/public/manifest.webmanifest`
- Test: `apps/web/src/App.test.tsx`

- [ ] **Step 1: Write failing frontend smoke tests**

Tests must assert Vanilla/Underworld mode, quick bet controls, market cards, Gateway, and risk/oracle indicators.

- [ ] **Step 2: Implement minimal UI**

Build a usable PWA shell with dual theme, markets, bounties, challenges, creator center, referrals, quests, reputation, moderation, and oracle status.

- [ ] **Step 3: Run frontend tests and build**

Run: `pnpm --filter @alterford/web test` and `pnpm --filter @alterford/web build`.

### Task 5: Indexer/API Foundation

**Files:**
- Create: `packages/indexer/src/events.ts`
- Create: `packages/indexer/src/projections.ts`
- Create: `packages/indexer/src/api.ts`
- Create: `packages/indexer/src/index.ts`
- Test: `packages/indexer/src/projections.test.ts`

- [ ] **Step 1: Write failing projection tests**

Tests must cover idempotent event handling and reorg-safe event identity.

- [ ] **Step 2: Implement projections**

Implement in-memory projection reducers for market, referral, quest, reputation, oracle, and moderation events.

### Task 6: CI/CD

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Add CI workflow**

CI must run install, typecheck, tests, and build.

### Task 7: Verification

- [ ] **Step 1: Run full verification**

Run: `pnpm typecheck`, `pnpm test`, and `pnpm build`.

- [ ] **Step 2: Report exact status**

Report passing commands and any unavailable external tool such as `forge`.
