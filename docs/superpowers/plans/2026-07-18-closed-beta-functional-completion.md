# Alterford Closed-Beta Functional Completion Plan

**Goal:** Close the remaining public Base Sepolia UX gaps without changing contracts or the
proposed future ten-user beta event.

**Stack:** React 19, TypeScript, Vite, Wagmi, Viem, Vitest, Testing Library, existing indexer and
gateway APIs.

## Task 1: Live lifecycle clock

- Add failing unit tests for market/challenge countdown boundaries and dispute deadlines.
- Implement pure countdown formatters and a shared live clock hook.
- Render accessible countdowns in market and challenge cards with Underworld urgency styling.

## Task 2: Reliable challenge execution

- Add focused tests for direct-default mode and relay failure behavior.
- Validate gateway public configuration before exposing gasless mode.
- Make wallet execution the default, gasless an explicit option, and never retry silently.
- Replace ambiguous creation copy with a four-stage review and exact escrow explanation.

## Task 3: Role-aware lifecycle actions

- Add UI tests proving participants see waiting states and operator controls remain hidden.
- Keep market resolution behind `RESOLVER_ROLE` and challenge arbitration behind
  `ARBITER_ROLE`.
- Show explicit participant, creator, executor, observer, and operator guidance.

## Task 4: First-run onboarding

- Add tests for the initial explanation, dismissal persistence, and reopening.
- Implement the concise Base Sepolia/no-house-risk introduction without blocking navigation.

## Task 5: Bounty public surface

- Extend the indexer feed with bounties and test deadline presentation.
- Add exact allowance/balance/bond reads and create/submit/resolve/cancel actions using the
  existing BountyFactory ABI.
- Add a Bounties tab with user and resolver states; do not expose emergency recovery.

## Task 6: Directed verification and publication

- Run only affected unit suites first, then workspace typecheck, tests, and production build.
- Confirm indexer and gateway health and inspect the public build after deployment.
- Perform targeted Base Sepolia checks for challenge direct creation and indexed visibility;
  do not repeat historical security scans because Solidity is unchanged.
