# Alterford v1.2 Phase 2 Conversion and Abstraction Plan

> **For agentic workers:** Execute each task test-first and do not expand scope beyond this document.

**Goal:** Add non-custodial social onboarding, EIP-2771 gasless challenge actions, enforceable gas sponsorship policies, and a hosted fiat on-ramp without changing Alterford economics or custody boundaries.

**Architecture:** MetaMask Embedded Wallets v11 adds an optional MPC social wallet while existing injected and WalletConnect wallets remain available. Users sign OpenZeppelin `ERC2771Forwarder` requests; a separate gateway validates an allowlisted challenge action and submits `forwarder.execute` through the current Gelato Turbo Relayer SDK. The same gateway creates short-lived Transak hosted-widget sessions, keeping provider credentials outside the static frontend.

**Tech Stack:** Solidity 0.8.28, OpenZeppelin 5.6, Foundry, React 19, Vite 7, Wagmi/Viem, MetaMask Embedded Wallets, Gelato Turbo Relayer, Node HTTP, Transak hosted widget, Vitest.

## Global Constraints

- Base Sepolia remains the initial target; Base Mainnet is configuration only.
- No-house-risk, escrow-first, dynamic bonds, and all existing fee rules remain unchanged.
- Gas sponsorship covers gas only; it never funds rewards, bets, bonds, allowances, or withdrawals.
- The indexer remains read-only and does not store provider secrets.
- The static PWA contains no Gelato or Transak secret.
- Existing MetaMask, Trust Wallet, Binance Web3 Wallet, and WalletConnect flows remain available.
- No full ERC-4337 migration is introduced. This phase implements the approved EIP-2771 meta-transaction path.

## Task 1: EIP-2771 contracts and deployment

**Files:**
- Create `packages/contracts/src/metatx/AlterfordForwarder.sol`
- Create `packages/contracts/test/Phase2MetaTransactions.t.sol`
- Modify `packages/contracts/src/security/Governed.sol`
- Modify `packages/contracts/src/factories/ChallengeFactory.sol`
- Modify `packages/contracts/script/DeployAlterford.s.sol`
- Modify deployment/export scripts and ABI registry

**Behavior:**
- `AlterfordForwarder` extends OpenZeppelin `ERC2771Forwarder` with domain name `AlterfordForwarder`.
- `ChallengeFactory` receives an immutable non-zero trusted forwarder.
- Direct calls preserve current behavior.
- Forwarded create, accept, evidence, proposal, confirmation, dispute, and finalize operations attribute state, token pulls, and events to the signer.
- OpenZeppelin nonce, deadline, EIP-712 domain, target trust, and signature validation prevent replay and cross-chain reuse.
- Local and Base Sepolia deployment records include `AlterfordForwarder` and pass its address to `ChallengeFactory`.

**Tests:** direct-call compatibility, valid forwarded action, invalid signer, replay, expired request, untrusted target, role check with forwarded signer, and unchanged challenge accounting.

## Task 2: Gateway and sponsorship policy

**Files:**
- Create `packages/gateway/package.json`, TypeScript config, source, and tests
- Modify root workspace scripts, Docker configuration, and `.env.example`

**Endpoints:**
- `GET /health`
- `GET /v1/config`
- `POST /v1/relay/prepare`
- `POST /v1/relay/submit`
- `GET /v1/relay/tasks/:taskId`
- `POST /v1/fiat/sessions`

**Policy:**
- Chain must equal configured Base chain.
- Target must equal configured `ChallengeFactory`.
- Selector must be explicitly allowlisted.
- `value` is always zero and calldata has bounded size.
- Request deadline and forward gas are capped.
- Per-wallet, per-IP, per-action, and global daily limits are enforced.
- Idempotency keys prevent duplicate sponsorship.
- Before submission, signature, nonce, target trust, and simulation must succeed.
- `GELATO_API_KEY` exists only in the gateway. The gateway calls current `@gelatocloud/gasless`, targeting `AlterfordForwarder.execute`.

**Tests:** valid request, disallowed selector/target/chain/value, malformed address/calldata, expired request, invalid signature response, duplicate idempotency key, rate/budget limit, provider failure, and redacted logs.

## Task 3: MetaMask Embedded Wallets

**Files:**
- Create focused Embedded Wallets configuration/provider/connect UI modules
- Modify `apps/web/src/AppProviders.tsx`, wallet controls, environment types, and tests

**Behavior:**
- When `VITE_WEB3AUTH_CLIENT_ID` is present, offer email/Google social login through MetaMask Embedded Wallets Sapphire Devnet or Mainnet as configured.
- The resulting EIP-1193 wallet is usable by the existing transaction layer.
- Injected and WalletConnect choices remain visible and unchanged.
- When configuration is absent, social login is cleanly disabled with no runtime failure.
- Logout clears only the selected embedded-wallet session.

**Tests:** disabled configuration, provider initialization, social connect success/failure, account presentation, logout, and preservation of external connectors.

## Task 4: Gasless challenge frontend

**Files:**
- Create relay API client, EIP-712 request builder, and challenge sponsorship hook
- Modify challenge action UI and transaction lifecycle tests

**Behavior:**
- Eligible challenge actions show `Gas patrocinado` before signing.
- The browser requests a policy-approved typed payload, signs it, submits it to the gateway, and tracks the Gelato task through confirmed/failed states.
- Non-eligible actions and unavailable gateway fall back to the existing direct wallet transaction after explicit user disclosure.
- Token allowance remains a separate explicit approval because the settlement mock does not implement permit.

**Tests:** typed-data consistency, sponsored lifecycle, rejection message, timeout, provider outage fallback, and no secret in built assets.

## Task 5: Fiat on-ramp sessions

**Files:**
- Add Transak adapter and tests to gateway
- Add on-ramp client/dialog and tests to web

**Behavior:**
- Gateway creates one short-lived hosted-widget URL per idempotent session request.
- Wallet address, network, configured asset, amount, locale, and partner order ID are validated server-side.
- Testnet uses Transak staging and must clearly state that provider funds are not the Alterford mock settlement token.
- Production configuration can target a provider-supported Base asset; Alterford never receives fiat or stores payment data.
- Absence of credentials disables the option without affecting Web3 flows.

**Tests:** session validation, secret isolation, provider timeout/error mapping, idempotency, supported return URL, and frontend open/close/error states.

## Task 6: Directed verification

- Run focused tests after every red/green cycle.
- Run complete `forge test`, workspace tests, typecheck, static build, and secret preflight once at the end.
- Run a local Anvil EIP-2771 challenge flow and gateway mock-provider integration.
- Do not attempt live Gelato, Web3Auth, or Transak calls without their dedicated credentials.
- A new Base Sepolia deployment is required because `ChallengeFactory` gains an immutable trusted forwarder.

## External configuration after implementation

- `VITE_WEB3AUTH_CLIENT_ID`
- `VITE_WEB3AUTH_NETWORK`
- `GELATO_API_KEY`
- `TRANSAK_API_KEY`
- `TRANSAK_API_SECRET` or provider access token configuration
- Gateway public URL and allowed frontend origins

