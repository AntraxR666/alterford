# Alterford Closed-Beta Functional Completion

## Scope

Complete the public testnet product surface without changing contracts, economics, deployed
addresses, or introducing the proposed ten-user event. The work covers first-run onboarding,
live lifecycle countdowns, reliable challenge transactions, role-aware resolution, and the
existing BountyFactory user flow.

## Invariants

- Base Sepolia and aUSDT remain the only enabled beta settlement environment.
- Authorizing aUSDT never transfers funds; creation, acceptance, and betting do.
- Market fees, challenge fees, dynamic bonds, escrow, and no-house-risk behavior do not change.
- Participants never see operator actions they cannot execute.
- A failed relay signature cannot trigger a silent gas-paying retry or a duplicate transaction.
- The ten-user contest, prize, ranking, and participant funding are outside this scope.

## First-Run Onboarding

Show a dismissible first-session introduction with three facts: Alterford matches users rather
than betting against them, escrow protects funds until resolution, and Base Sepolia assets have
no real value. The user can enter through email or an external wallet. Dismissal is stored only
in local browser storage and can be reopened from the interface.

## Lifecycle Countdowns

Use one shared clock hook so visible countdowns update without refetching chain data. Markets
show time until betting closes or resolution becomes available. Challenges show time until the
participation/evidence deadline and, when indexed, the optimistic dispute deadline. Terminal
entities show a final status rather than a negative timer. Underworld uses stronger warning
styling, but the same timestamps and state rules as Vanilla.

## Challenge Transactions

Direct wallet execution is the reliable default. Gas sponsorship remains optional and is shown
only when the gateway configuration matches the active chain, forwarder, and ChallengeFactory.
The user chooses the execution mode before signing. If relay submission fails, the UI states
that no aUSDT moved and switches the next attempt to direct wallet execution; it never retries
silently.

Challenge creation is presented as four explicit stages: define the challenge, review reward
and creator bond, authorize the exact total, and create/lock escrow. The UI identifies the
connected wallet as creator and explains that a different wallet accepts with its own executor
bond. The same execution-mode rule applies to acceptance, evidence, proposal, confirmation,
dispute, and finalization actions.

## Role-Aware Resolution

Regular users see waiting states after betting/evidence closes. Market resolution controls are
visible only to `RESOLVER_ROLE`; challenge arbitration and expired-challenge cancellation are
visible only to `ARBITER_ROLE`. Mutual participant confirmation and permissionless undisputed
finalization remain available where the contract permits them.

## Bounties

Expose the already deployed BountyFactory without changing it: list indexed bounties, create
with reward plus dynamic bond, authorize exact escrow, submit a hashed evidence reference, and
show resolver-only settlement/cancellation controls. Bounties receive the same live deadline
presentation and explicit role guidance. Emergency recovery remains operator-only and is not a
normal user flow.

## Verification

Add focused tests for countdown boundaries, onboarding persistence, challenge execution-mode
selection and relay failure, role-aware controls, and bounty presentation. Run affected package
tests, typecheck, and production build. Reuse existing Solidity/security evidence because no
contract code changes are permitted. Finish with targeted public checks against the existing
Base Sepolia deployment and Railway services.
