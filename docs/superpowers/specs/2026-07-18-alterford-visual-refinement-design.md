# Alterford Visual Refinement Design

Date: 2026-07-18
Status: Approved direction, pending implementation plan

## Objective

Improve Alterford's public user experience without changing its architecture, contracts, economy, product modes, wallet model, or token authorization behavior. The result must make markets easier to scan, predictions easier to understand, and Underworld more distinctive while preserving mobile performance and PWA reliability.

## Approved Scope

### Vanilla market discovery

- Reduce visual competition in the header and status area.
- Preserve the existing navigation destinations while giving markets the strongest first-screen priority.
- Add a compact search control and horizontally scrollable category filters.
- Present market question, category, state, probability, pool, and closing urgency in a consistent hierarchy.
- Use restrained category artwork or icons only when it improves recognition.
- Display useful badges such as `En vivo`, `Cierra pronto`, `Nuevo`, and `Alto volumen` when supported by real data.
- Keep a selected market visibly distinct from other results.

### Market state correctness

- The active market list must contain only markets whose indexed state is `Open`.
- `Resolved`, `Cancelled`, `Locked`, and unknown states must never initialize or remain selected in the prediction ticket.
- If the previously selected market stops being open, selection must move to the next open market or to an empty state.
- When no open markets exist, the ticket must be replaced by a clear empty state and must not expose prediction actions.

### Prediction ticket

- Keep the ticket beside the market list on desktop and convert it to an ergonomic lower panel on mobile.
- Make the sequence visually explicit: choose outcome, choose amount, inspect net profit and total payout, satisfy required setup, confirm.
- Keep `Ganancia neta` visually dominant and distinguish it from `Retorno total`, which includes the original stake.
- Preserve quick amounts, High Roller mode, real balance checks, current allowance checks, and transaction lifecycle states.
- Do not add additional approval controls or change approval calculations.

### Underworld

- Preserve the same design system and the global `isUnderworldMode` state.
- Use a deeper neutral background with controlled red, acid-green, and cyan accents.
- Add subtle entrance, selection, live-status, and confirmation motion.
- Do not use constant flashing, heavy particle systems, decorative gradient blobs, or motion that impairs readability.
- Emphasize escrow status, live evidence, dispute state, deadlines, and participant roles.
- Use small challenge artwork or category imagery only when it represents the actual challenge or state.
- Preserve the Underworld Gateway and all existing safety, escrow, evidence, and arbitration behavior.

### Responsive behavior

- Desktop: market explorer and sticky ticket use a stable two-column layout.
- Tablet: ticket may become a narrower side panel or an in-flow section without hiding required information.
- Mobile: primary navigation remains reachable; category filters scroll horizontally; the selected ticket opens as a lower panel or dedicated focused section.
- Controls must maintain stable dimensions and text must not overflow at supported widths.

## Visual Reference Principles

- Polymarket: borrow scanning density, category navigation, probability prominence, and compact market metadata.
- Kalshi: borrow financial hierarchy, featured-event clarity, chart-ready information structure, and separation between odds, payout, and context.
- Stake: borrow live-state visibility, compact navigation, and controlled promotional intensity only for Underworld.
- Do not copy branding, layouts pixel-for-pixel, casino mechanics, or platform-specific content.

## Explicitly Out of Scope

- Any change to ERC-20 allowance calculations or approval transaction behavior.
- Custom allowance inputs, allowance presets, unlimited approvals, or permit-based approvals.
- Contract changes, redeployment, fee changes, bond changes, or settlement-token changes.
- New account systems, custody, fiat rails, XMR rails, referral systems, or gamification features.
- New moderation policy or changes to Vanilla/Underworld business rules.
- New animation libraries unless implementation proves native CSS and existing dependencies insufficient.

## Component Boundaries

- `MarketExplorer`: search, category filtering, open-market list, badges, selected state.
- `MarketCard`: compact market information and probability presentation.
- `PredictionTicket`: selected outcome, amount controls, payout breakdown, existing authorization step, confirmation state.
- `MarketEmptyState`: no-open-market and no-filter-result states.
- `UnderworldGateway`: thematic transition and high-signal protocol status.
- `ChallengeCard` and `LiveProofPreview`: challenge identity, escrow, live evidence, dispute, and deadline presentation.

These may remain local components initially if extraction would add churn. Extraction is required only where it materially reduces the current `App.tsx` complexity or enables focused tests.

## Data and State Rules

- Filtering is performed from indexer DTO state, with case-normalized exact matching to `open`.
- Search and category filters are local UI state and do not alter the indexer read model.
- Market selection always references the filtered open-market collection.
- Badges must derive from timestamps, pool values, or indexed state; no random or hardcoded activity badges.
- Payout calculations continue using the existing SDK economic helper and bigint values.

## Motion and Performance

- Prefer CSS transitions and keyframes using opacity and transform.
- Respect `prefers-reduced-motion` and disable nonessential effects when requested by the operating system.
- Avoid layout-animating properties and large continuously animated surfaces.
- Preserve the static Vite build, service worker behavior, and decentralized deployment compatibility.
- No visual asset may block the primary market list from rendering.

## Error and Empty States

- Indexer unavailable: retain the existing explicit degraded-state message without presenting demo data as real.
- No open markets: explain that there are no active markets and offer navigation to market creation without exposing a disabled betting ticket.
- Search with no results: keep filters visible and provide a one-action reset.
- Closed while selected: remove it from the ticket immediately on the next indexer refresh.
- Transaction failures: preserve the wallet-aware messages introduced for embedded and external wallets.

## Testing Strategy

- Unit tests for market-state normalization, search, category filtering, urgency badges, and selected-market fallback.
- Component tests proving resolved markets cannot appear in the active list or ticket.
- Component tests for net-profit versus total-payout labels and unchanged approval behavior.
- Responsive screenshot checks at mobile and desktop widths for Vanilla and Underworld.
- Reduced-motion check confirming nonessential animation is disabled.
- Production build and PWA validation before deployment.

## Acceptance Criteria

- No resolved or otherwise non-open market can be selected or predicted from the active-market screen.
- A user can identify the market question, current probability, closing status, stake, net profit, and total payout without opening explanatory documentation.
- Existing quick amounts, High Roller, balances, allowance logic, wallet connections, and transaction states remain behaviorally unchanged.
- Vanilla is calm, professional, and optimized for scanning.
- Underworld is visibly distinct, intense, and evidence-focused without sacrificing clarity.
- Mobile layouts contain no overlapping controls or clipped text.
- Typecheck, focused tests, web test suite, production build, and browser visual checks pass.

## Implementation Order

1. Lock market-state filtering and selection invariants with failing tests.
2. Correct active-market and empty-ticket behavior.
3. Refine Vanilla market discovery and prediction ticket hierarchy.
4. Refine Underworld visual identity and evidence states.
5. Add responsive and reduced-motion behavior.
6. Run automated verification and desktop/mobile browser checks.
7. Publish the verified static frontend without contract changes.
