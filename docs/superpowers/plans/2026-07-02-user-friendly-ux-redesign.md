# User-Friendly UX Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign Alterford's frontend into a clear user-facing prediction-market app with obvious costs, deposits, creation wizard, market browsing, portfolio, and creator center.

**Architecture:** Keep contracts, SDK, indexer, and web3 hooks intact. Refactor `apps/web/src/App.tsx` into focused presentation components and update CSS to support the new information architecture.

**Tech Stack:** React, Vite, Tailwind-compatible CSS, Zustand, wagmi, viem, lucide-react, Alterford SDK.

---

### Task 1: Web3 Copy And Spending Model

**Files:**
- Modify: `apps/web/src/hooks/useWeb3Flow.ts`

- [ ] Update transaction labels so users understand each action.
- [ ] Keep function names stable to avoid breaking existing UI.
- [ ] Add `hasEnoughBalance`, `needsApproval`, `spendPreview`, and `createCostLabel` return values.
- [ ] Run `pnpm typecheck`.

### Task 2: App Information Architecture

**Files:**
- Modify: `apps/web/src/App.tsx`

- [ ] Replace the technical hero/control layout with tab navigation: Markets, Create, Portfolio, Creator Center.
- [ ] Add market cards with YES/NO actions and clear stake buttons.
- [ ] Add create wizard fields for question, category, mode, timing, and review.
- [ ] Add wallet balance panel explaining connect, add funds, authorize, spend.
- [ ] Keep all existing web3 actions wired through `useWeb3Flow`.

### Task 3: Visual System

**Files:**
- Modify: `apps/web/src/styles.css`

- [ ] Replace the current card-heavy technical layout with clean app navigation and market layout.
- [ ] Keep Vanilla clear/professional.
- [ ] Keep Underworld dark/neon but legible.
- [ ] Ensure mobile layout has no overlapping text.

### Task 4: Verification

**Files:**
- Existing tests: `apps/web/src/App.test.tsx`

- [ ] Update tests for new headings/actions.
- [ ] Run `pnpm --filter @alterford/web test`.
- [ ] Run `pnpm typecheck`.
- [ ] Run `pnpm build`.
- [ ] Verify `http://127.0.0.1:5173/` loads.

