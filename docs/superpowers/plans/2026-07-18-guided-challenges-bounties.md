# Guided Challenges And Bounties Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Separate markets, challenges and bounties into understandable role-aware workflows, strictly partition bounties by on-chain mode, and support reviewable IPFS photo evidence.

**Architecture:** Existing factories remain authoritative for escrow and settlement. `BountyFactory` gains a backward-compatible URI-bearing evidence method; the indexer projects the URI and stored mode; the gateway pins validated images without exposing credentials; React presents separate Explore, Mine and Create views with a deterministic lifecycle action model.

**Tech Stack:** Solidity/Foundry, React/Vite, TypeScript/Vitest, Viem, Node HTTP gateway, IPFS Pinata/Fleek-compatible configuration, existing Alterford SDK/indexer.

## Global Constraints

- Preserve all fee, bond, settlement, role and deadline rules.
- Preserve existing `submit(uint256,bytes32)` compatibility.
- Never expose pinning credentials in browser bundles or API responses.
- Vanilla and Underworld bounties are filtered from indexed on-chain mode.
- JPEG, PNG and WebP only; maximum image size is 10 MiB.
- No event, ranking, prize or 72-hour/10-user beta logic.
- Use tests first for every behavior change.

---

### Task 1: Persist Bounty Evidence References On-Chain

**Files:**
- Modify: `packages/contracts/src/factories/BountyFactory.sol`
- Modify: `packages/contracts/test/AlterfordModules.t.sol`

**Interfaces:**
- Produces: `submitEvidence(uint256 bountyId, bytes32 submissionHash, string evidenceURI)`
- Produces: `SubmissionEvidenceCreated(uint256 indexed bountyId, address indexed submitter, bytes32 submissionHash, string evidenceURI)`
- Produces: `submissionURIByUser(uint256,address) -> string`

- [ ] Write Foundry tests proving an open bounty stores and emits a matching IPFS URI, rejects empty/mismatched evidence, and keeps legacy `submit` working.
- [ ] Run `forge test --match-test testBountySubmissionEvidence -vvv` and confirm failures are caused by the missing method.
- [ ] Implement `submitEvidence`, requiring `bytes(evidenceURI).length > 0` and `submissionHash == keccak256(bytes(evidenceURI))`; share state validation with legacy `submit`.
- [ ] Re-run the focused Foundry tests and confirm they pass.

### Task 2: Publish Evidence Through SDK And Indexer

**Files:**
- Modify: `packages/sdk/src/types.ts`
- Modify: `packages/sdk/src/abis.ts`
- Modify: `packages/sdk/src/abis.test.ts`
- Modify: `packages/indexer/src/events.ts`
- Modify: `packages/indexer/src/listener.ts`
- Modify: `packages/indexer/src/projections.ts`
- Modify: `packages/indexer/src/phase1-projections.test.ts`
- Modify: `packages/indexer/src/listener.test.ts`

**Interfaces:**
- Produces: `BountyDTO.modeAffinity?: ModeAffinity`
- Produces: `BountyDTO.submissions?: readonly { submitter: Address; submissionHash: string; evidenceURI?: string }[]`

- [ ] Add failing SDK and indexer tests for the new ABI, evidence URI projection and bounty mode serialization.
- [ ] Run `pnpm --filter @alterford/sdk test` and `pnpm --filter @alterford/indexer test`; confirm targeted failures.
- [ ] Extend ABI/event decoding/projection without changing existing event handling.
- [ ] Re-run both package suites and confirm they pass.

### Task 3: Add A Credential-Safe IPFS Image Gateway

**Files:**
- Create: `packages/gateway/src/evidencePinning.ts`
- Create: `packages/gateway/src/evidencePinning.test.ts`
- Modify: `packages/gateway/src/server.ts`
- Modify: `packages/gateway/src/server.test.ts`
- Modify: `packages/gateway/src/cli.ts`
- Modify: `.env.example`

**Interfaces:**
- Consumes: `PINNING_PROVIDER`, `PINNING_TOKEN`, optional `PINNING_API_URL`, `EVIDENCE_UPLOAD_MAX_BYTES`
- Produces: `POST /v1/evidence/images` with `{ fileName, mimeType, bytesBase64 }`
- Returns: `{ cid, uri: "ipfs://<cid>", sha256, size, mimeType }`

- [ ] Write failing unit/server tests for valid JPEG/PNG/WebP, unsupported type, malformed base64, 10 MiB limit, provider failure redaction and missing configuration.
- [ ] Run the gateway tests and confirm the endpoint/service is absent.
- [ ] Implement validation before network access, a dedicated request-size limit, Pinata-compatible multipart upload and secret-redacted failures.
- [ ] Wire the service only when pinning variables exist; expose capability as a boolean without returning secrets.
- [ ] Re-run gateway tests and confirm they pass.

### Task 4: Model Deterministic Challenge And Bounty Actions

**Files:**
- Create: `apps/web/src/features/challenges/challengeWorkflow.ts`
- Create: `apps/web/src/features/challenges/challengeWorkflow.test.ts`
- Create: `apps/web/src/features/bounties/bountyWorkflow.ts`
- Create: `apps/web/src/features/bounties/bountyWorkflow.test.ts`

**Interfaces:**
- Produces: `challengeWorkflow(challenge, account, isArbiter, now): ChallengeWorkflowModel`
- Produces: `bountyWorkflow(bounty, account, isResolver, isArbiter, now): BountyWorkflowModel`
- Each model exposes `role`, `currentStep`, `steps`, `headline`, `instruction`, `primaryAction`, `secondaryActions`.

- [ ] Write failing table-driven tests for creator, executor, observer, resolver/arbiter, expired and final states.
- [ ] Run the two focused test files and confirm missing-module failures.
- [ ] Implement pure exhaustive state mapping with no contract calls.
- [ ] Re-run focused tests and confirm every role/state case passes.

### Task 5: Build Guided Challenge Views

**Files:**
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/App.test.tsx`
- Modify: `apps/web/src/styles.css`

**Interfaces:**
- Consumes: `challengeWorkflow(...)`
- Produces: tabs `Explorar retos`, `Mis retos`, `Crear reto`; lifecycle detail with one primary action.

- [ ] Add failing React tests proving creation is isolated, Open challenges show two-step acceptance, only executors see evidence submission, and participants/arbiter see correct resolution actions.
- [ ] Run `pnpm --filter @alterford/web test -- App.test.tsx` and confirm the new labels are absent.
- [ ] Reorganize the existing controls into three views and a dedicated selected-challenge detail; reuse all current Web3 callbacks unchanged.
- [ ] Add responsive styles and explicit financial consequence copy immediately above transaction actions.
- [ ] Re-run the web tests and confirm they pass.

### Task 6: Build Mode-Partitioned Bounty Views And Photo Upload

**Files:**
- Create: `apps/web/src/features/bounties/evidenceUpload.ts`
- Create: `apps/web/src/features/bounties/evidenceUpload.test.ts`
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/App.test.tsx`
- Modify: `apps/web/src/hooks/useWeb3Flow.ts`
- Modify: `apps/web/src/web3/gatewayClient.ts`
- Modify: `apps/web/src/web3/gatewayClient.test.ts`
- Modify: `apps/web/src/styles.css`

**Interfaces:**
- Consumes: gateway `POST /v1/evidence/images`
- Produces: tabs `Explorar bounties`, `Mis entregas`, `Crear bounty`
- Produces: direct image picker, preview, upload state and `ipfs://` evidence submission through `submitEvidence`.

- [ ] Add failing tests for strict mode filtering, role-specific lifecycle guidance, local image validation, upload preview and on-chain submission only after upload success.
- [ ] Run focused web tests and confirm the new workflow is absent.
- [ ] Filter bounties by `modeAffinity` before all active/history/mine partitions.
- [ ] Implement the image picker and gateway upload while retaining manual URL evidence.
- [ ] Switch `submitBounty` to `submitEvidence` when a URI is supplied; preserve legacy fallback only for old deployments.
- [ ] Re-run focused tests and confirm they pass.

### Task 7: Verification, ABI Publication And Testnet Release Preparation

**Files:**
- Modify generated ABI/address artifacts only through existing scripts.
- Modify deployment environment outputs only if a new BountyFactory is deployed.

**Interfaces:**
- Produces: reproducible build and a deployable Base Sepolia release using the existing Foundry keystore flow.

- [ ] Run `forge test`, `pnpm typecheck`, `pnpm test`, `pnpm build` and `git diff --check`.
- [ ] Run browser validation at desktop and 390px mobile: mode partition, three-view navigation, image validation, role detail and no horizontal overflow.
- [ ] Export ABIs with the existing script and verify generated SDK/deployment artifacts.
- [ ] Run Base Sepolia deployment preflight. Deploy only after all local checks pass and the configured keystore can sign.
- [ ] Publish web/gateway/indexer with existing Railway scripts, verify `/health`, and confirm the public bundle points to non-localhost services.
