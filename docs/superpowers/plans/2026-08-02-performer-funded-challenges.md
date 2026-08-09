# Performer-funded challenges implementation plan

## Outcome

Add a second, backward-compatible challenge funding model. Existing sponsored challenges keep their current behavior. A performer offer lets its creator lock only the dynamic creation bond; the first different account that accepts locks the requested reward in escrow.

## Invariants

- Keep Base, no-house-risk, escrow-first, the dynamic bond policy, and current challenge fee policy unchanged.
- Existing `createChallenge` and sponsored challenge behavior remain compatible.
- No challenge can resolve before its reward is escrowed.
- Success pays the performer; failure refunds the sponsor.
- An unaccepted performer offer can be cancelled without attempting to refund an unescrowed reward.
- The performer bond remains refundable or slashable under the existing resolution/fraud rules.

## Tasks

1. Add focused Foundry tests for performer-offer creation, first-party funding, successful payout, failed-performance refund, insufficient funding, and cancellation before acceptance. Run them red.
2. Extend `ChallengeFactory` with an explicit funding model and escrow state, role-aware sponsor/performer helpers, performer-offer creation functions, and conditional acceptance/cancellation/settlement. Keep sponsored entry points unchanged. Run focused and neighboring contract tests green.
3. Extend SDK ABI/types and indexer events/projections for funding model, sponsor, performer, and reward escrow status. Add tests first and run package tests.
4. Extend the challenge creation and detail UI with a clear `Patrocino / Ofrezco cumplirlo` choice, role-aware cost explanations, and role-aware actions. Add workflow/hook/component tests first.
5. Export the updated ABI through the existing deployment tooling and run `forge test`, `pnpm test`, `pnpm typecheck`, and `pnpm build`.
6. Report the required Base Sepolia redeploy, service address refresh, and two-account wallet smoke test. Do not deploy or publish without a separate explicit release action.

