# Alterford Challenge Guided Workflow

## Objective

Make the challenge lifecycle understandable to a first-time Web3 user without changing contracts, economics, permissions, deadlines, or indexed data.

## Scope

The challenge section is reorganized into three mutually exclusive views:

1. **Explore challenges**: open challenges that another account can accept.
2. **My challenges**: challenges where the connected account is creator or executor, plus challenges requiring arbitration for an authorized arbiter.
3. **Create challenge**: the existing escrow creation form, isolated from challenge management.

The future 72-hour/10-user beta event remains excluded.

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

## Error Handling

- No action is shown when the connected account lacks the required role.
- Expired evidence windows never show evidence submission controls.
- Failed approval or transaction states remain visible next to the active action.
- Wallet and gasless execution retain their current behavior; no silent fallback is introduced.
- Missing indexer data produces an explicit empty or unavailable state, never demonstration entities.

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

## Non-Goals

- No Solidity, ABI, fee, bond, settlement or moderation changes.
- No new account model or backend state.
- No beta contest, ranking, prize or ten-user logic.
- No new router dependency.
