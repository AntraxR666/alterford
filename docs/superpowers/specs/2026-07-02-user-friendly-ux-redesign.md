# Alterford User-Friendly UX Redesign Spec

## Goal

Convert the current technical Web3 control panel into a user-friendly product interface for normal users, while preserving the existing contracts, economics, Base Sepolia deployment, Vanilla/Underworld modes, and no-house-risk philosophy.

## Product Direction

The app should feel like a clear prediction-market product, not a developer console. Users should understand when money or tokens move:

- Wallet connection does not cost funds.
- Adding test funds mints/transfers test aUSDT only on testnet.
- Approving aUSDT only grants permission; it is not a charge.
- Creating a market locks the creation bond.
- Betting spends the selected bet amount.
- Claiming pays winnings or refunds.

## Navigation

Primary tabs:

- `Markets`: browse indexed and sample markets.
- `Create`: guided market creation wizard.
- `Portfolio`: balances, allowance, active position, claim/refund actions.
- `Creator Center`: bond estimate, creator mode, risk summary, operational actions.

## UX Requirements

- Replace raw "Approve token" language with "Autorizar uso de aUSDT".
- Replace "Mint test USDT" with "Agregar fondos de prueba".
- Show a wallet/saldo panel explaining spend vs authorization.
- Show clear "Costo ahora" before create/bet.
- Create flow must expose question, category, mode, close/resolution timing, estimated volume, and bond reason.
- Market cards must have clear YES/NO action buttons.
- Keep Underworld visually different but equally usable.
- Use the existing hooks and contracts; do not change Solidity economics.

## Acceptance Criteria

- User can identify what each tab is for without reading protocol language.
- User sees that connection is free.
- User sees that approval is not a charge.
- User sees that creation locks bond and betting spends stake.
- Existing web3 actions remain available and connected.
- Base Sepolia env continues to work.
- Typecheck, relevant tests, and build pass.

