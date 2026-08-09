# Non-Custodial XMR Conversion Rail Specification

## Decision

Alterford accepts XMR as an entry method, not as an on-chain settlement asset. A configured external conversion provider receives XMR and sends the configured Base settlement token directly to the user's EVM wallet. Alterford never receives, stores, wraps, mints, or manually credits XMR.

The previous self-hosted `monero-wallet-rpc` deposit and withdrawal rail remains disabled and is superseded by this specification.

## Invariants

- Existing Base contracts and economics do not change.
- The settlement token remains the allowlisted real token on Base.
- The provider's settlement address is always the user's checksummed EVM address.
- A conversion is complete only after the provider reports settlement and the Base transfer is independently verified on-chain.
- Provider status alone never creates an Alterford balance.
- A quote shows XMR input, settlement output, rate, provider fee, Base network fee, net output, expiry, and provider identity before acceptance.
- Fees are either deducted from output or added to required input, never both.
- Quotes, orders, provider callbacks, polling, and Base verification are idempotent.
- Provider secrets remain server-side; the PWA receives only public capabilities and order data.
- The deprecated native XMR endpoints cannot be enabled together with the conversion rail.

## Modes

### Automatic

Available only when the provider reports a valid pair, amount range, quote, and permission for the end-user request. The initial assisted threshold is `1,500 USDC` equivalent. It is an operational setting, not Solidity state.

### Assisted

Mandatory at or above the threshold, when the provider cannot quote automatically, when risk controls route the order to review, or whenever the user requests assistance. The official in-app case is the source of truth. An operator confirms the destination wallet, provider, costs, expiry, and instructions before the user sends XMR. The provider still settles directly to the user.

## State Machines

Quote: `available -> accepted | expired | rejected`.

Conversion: `awaiting_deposit -> confirming_xmr -> converting -> settling_base -> completed`, with terminal alternatives `expired`, `refunding`, `refunded`, `failed`, and `assistance_required`.

Assistance case: `open -> assigned -> awaiting_user -> quoted -> accepted -> monitoring -> resolved | cancelled`.

## Core Interfaces

`XmrConversionProvider` exposes capabilities, fixed quote creation, order creation, and order lookup. The first adapter is SideShift-compatible, but service logic depends only on this interface.

`BaseSettlementVerifier` verifies chain ID, token contract, destination, amount, transaction success, and confirmation depth from a provider settlement transaction hash.

`XmrConversionLedger` persists quotes, conversions, assistance cases, provider IDs, normalized statuses, immutable destination data, and verification results using atomic bigint-safe JSON.

## HTTP API

- `GET /v1/xmr/capabilities`
- `POST /v1/xmr/quotes`
- `POST /v1/xmr/conversions`
- `GET /v1/xmr/conversions/:id`
- `POST /v1/xmr/assistance`
- `GET /v1/xmr/assistance/:id`
- Operator-authenticated status synchronization remains server-side.

Every mutating public request requires an idempotency key. Wallet ownership is proven with an EIP-712 signature over destination, quote/order identifier, nonce, deadline, chain ID, and gateway domain before an order is created.

## Frontend

The deposit panel is replaced by a three-step flow: destination wallet, transparent quote, then XMR payment instructions. It never says that Alterford owns the XMR address. Completed status displays the independently verified Base transaction and settlement amount. Assisted mode opens an official case before showing payment instructions.

## Operational Configuration

- `XMR_CONVERSION_PROVIDER=sideshift|disabled`
- `XMR_ASSISTED_THRESHOLD_MINOR=1500000000` for six-decimal USDC
- `XMR_SETTLEMENT_CHAIN_ID=8453` in production
- `XMR_SETTLEMENT_TOKEN_ADDRESS`
- `XMR_SETTLEMENT_CONFIRMATIONS`
- `XMR_CONVERSION_LEDGER_PATH`
- `XMR_PROVIDER_BASE_URL`
- `XMR_PROVIDER_ACCOUNT_ID`
- `XMR_PROVIDER_SECRET`
- `XMR_OPERATOR_TOKEN`

The feature stays disabled unless provider credentials, Base RPC, token address, and durable persistence are all valid.
