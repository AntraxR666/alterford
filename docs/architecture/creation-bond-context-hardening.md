# Creation Bond Context Hardening

Status: approved for implementation

## Problem

The deployed factory interfaces accept a complete `CreationBondPolicy.BondContext` from the
creator. A direct contract caller can claim a premium tier, trusted reputation, zero disputes,
zero fraud, or a lower-risk mode to reduce the creation bond.

## Decision

Add a governed `CreationBondContextResolver` and make it the only source used by factories to
build `BondContext` values.

- A creator supplies only a registered `categoryId`.
- Each category rule fixes its supported entity types, mode, and minimum risk on-chain.
- Creator tier, reputation band, dispute count, and fraud count come from profiles written by an
  authorized protocol module.
- New creators resolve to `Basic` / `New` / zero history.
- Market creation uses zero initial volume because no enforceable liquidity exists at creation.
- Bounty and challenge creation use the actual escrowed reward pool as expected volume.
- Factories persist and emit the resolved category, mode, and risk.
- Unknown or entity-incompatible categories are rejected.

The bond formula, limits, refund/slashing behavior, fees, and no-house-risk model remain
unchanged.

## Deployment Impact

Factories are immutable deployments. Base Sepolia requires a fresh resolver and fresh factory
deployments; the settlement token and `CreationBondPolicy` may be reused. Existing test entities
remain only in the previous factories and no user funds are migrated automatically.

## Acceptance Tests

1. A creator cannot self-assign a discounted tier or trusted reputation.
2. Underworld and high-risk categories cannot be downgraded by calldata.
3. Only authorized modules can attest creator bond profiles.
4. Bounty/challenge volume equals reward escrow, not a caller estimate.
5. Category/entity mismatches and unknown categories revert.
6. Existing bond bounds, escrow, refunds, slashing, fees, and challenge windows still pass.
