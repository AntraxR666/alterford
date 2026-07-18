# Alterford Challenge And Bounty Guided Workflows

## Objective

Make challenge and bounty lifecycles understandable to a first-time Web3 user without changing economics, permissions, deadlines, or settlement behavior.

## Scope

The challenge section is reorganized into three mutually exclusive views:

1. **Explore challenges**: open challenges that another account can accept.
2. **My challenges**: challenges where the connected account is creator or executor, plus challenges requiring arbitration for an authorized arbiter.
3. **Create challenge**: the existing escrow creation form, isolated from challenge management.

The future 72-hour/10-user beta event remains excluded.

Markets remain a separate product. Yes/No pooled betting, variable odds and parimutuel payouts must never appear inside challenge or bounty task flows.

## Challenge Detail

Selecting a challenge opens a dedicated detail surface. It contains:

- challenge title, reward, escrow state and countdown;
- the connected account's role;
- a five-step lifecycle: Created, Accepted, Evidence, Decision, Payment;
- the current step and completed steps;
- a plain-language statement of what happens next and who must act;
- live-stream and submitted-evidence links when present;
- exactly one primary next action whenever possible;
- secondary or exceptional actions, such as dispute, in a visually separate area.

On mobile, the detail follows the selected card in document order. On desktop, it uses the existing responsive content area and does not introduce routing.

## Role And State Rules

| State | Creator | Executor | Other user | Arbiter |
| --- | --- | --- | --- | --- |
| Open | Wait for participant | Not assigned | Authorize bond, then accept | Cancel only if expired |
| Accepted | Follow live/evidence | Publish live and submit evidence | Observe | Resolve early only with reason |
| EvidenceSubmitted | Propose result | Propose result | Observe | Resolve early only with reason |
| Review | Confirm, dispute or finalize when eligible | Confirm, dispute or finalize when eligible | Observe | Observe unless disputed |
| Disputed | Wait | Wait | Observe | Resolve on-chain |
| Final state | View outcome | View outcome | View outcome | View outcome |

Acceptance remains a two-transaction process because ERC-20 approval and challenge acceptance are separate on-chain operations. The UI presents them as one guided action with explicit progress: first authorize the exact executor bond, then accept and lock it.

## Creation Flow

The creation form retains its current four stages and exact transaction semantics. It moves into the **Create challenge** view so it is never mixed with evidence or resolution controls.

After a successful creation, the interface refreshes indexed data, switches to **My challenges**, selects the created challenge when identifiable, and explains that another wallet must accept it.

## Bounty Views

The bounty section follows the same interaction model with three mutually exclusive views:

1. **Explore bounties**: open tasks accepting submissions.
2. **My submissions**: bounties where the connected account submitted evidence, plus bounties created by that account.
3. **Create bounty**: title, required delivery, reward, deadline, escrow and creation transaction.

Selecting a bounty opens a dedicated five-step lifecycle: Published, Submissions, Review, Winner, Payment. The detail identifies the current step, the connected account's role and the single next action.

Submitting a bounty does not lock a participant bond and does not mean accepting an exclusive challenge. Multiple users may submit while the bounty is open. An authorized resolver selects one or more valid submitters and distributes exactly the escrowed reward.

## Mode Partition

Bounties exist in both product modes and are strictly partitioned by the mode stored on-chain:

- a Vanilla bounty appears only in Vanilla;
- an Underworld bounty appears only in Underworld;
- switching modes refreshes the visible bounty cohort;
- direct URLs or stale frontend state cannot make an entity appear in the wrong cohort;
- historical entries remain partitioned by their original immutable mode.

The SDK DTO and indexer response expose the stored mode. Filtering is performed from indexed on-chain data rather than from the current creation form state.

## Photo And File Evidence

Bounty submissions accept a URL or a direct image upload. Direct uploads use a server-side IPFS pinning endpoint so Pinata or Fleek credentials are never exposed in the browser. The flow is:

1. select a supported image;
2. validate type and size before upload;
3. preview locally;
4. upload and receive a content-addressed IPFS URI;
5. show the immutable reference before confirmation;
6. hash and submit that reference on-chain;
7. retain the URI in the indexed evidence read model for later review.

Supported first-release formats are JPEG, PNG and WebP with a configurable 10 MiB maximum. An upload failure never triggers an on-chain transaction. URL evidence remains available for video, documents and externally pinned content.

`BountyFactory` adds a URI-bearing submission entrypoint and event while retaining the existing hash-only `submit` entrypoint for compatibility. The contract verifies that the URI is non-empty and that its hash matches the submitted digest. The indexer derives the reviewable URI from the event, so the gateway cannot replace evidence without breaking the on-chain commitment. This requires a new testnet deployment and ABI publication but does not alter reward or bond economics.

## Error Handling

- No action is shown when the connected account lacks the required role.
- Expired evidence windows never show evidence submission controls.
- Failed approval or transaction states remain visible next to the active action.
- Wallet and gasless execution retain their current behavior; no silent fallback is introduced.
- Missing indexer data produces an explicit empty or unavailable state, never demonstration entities.
- Bounty evidence cannot be submitted until its IPFS upload has completed.
- A bounty from the opposite visual mode is never displayed or actionable.

## Accessibility And Clarity

- View selection uses a segmented tab control with accessible labels and pressed state.
- Current lifecycle step uses text and visual state, not color alone.
- Buttons use outcome-oriented labels such as **Enviar prueba final** rather than contract method names.
- Financial consequences appear immediately above every transaction button.
- The interface states whether an action only authorizes funds or actually locks/moves them.

## Testing

Automated tests must prove:

- creation controls are isolated from Explore and My challenges;
- selecting an open challenge exposes the correct acceptance guidance;
- creator and executor receive different next-step instructions;
- only the executor can submit evidence before the deadline;
- review and dispute actions appear only for participants;
- arbitration appears only to the arbiter;
- final and expired challenges do not expose invalid actions;
- mobile layout has no horizontal overflow;
- existing contract-call hooks and economic values remain unchanged.
- Vanilla and Underworld bounties are strictly partitioned from indexed mode data;
- bounty creation is isolated from browsing and submission;
- image validation and upload failures occur before any wallet request;
- a successful image upload produces the same on-chain submission path as a supplied evidence URL;
- bounty creator, submitter, resolver and observer see role-appropriate instructions.

## Non-Goals

- No fee, bond, settlement or moderation changes. The Solidity change is limited to evidence reference persistence and backward compatibility.
- No new account model or backend state.
- No beta contest, ranking, prize or ten-user logic.
- No new router dependency.
