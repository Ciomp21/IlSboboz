# Sboboz Game Rules

This document records rules inferred from the current implementation. It is
the behavioral contract for the extracted engine; any uncertainty must be
resolved by comparing the implementation and regression tests before changing
behavior.

## Deck and cards

- Suits are spades, hearts, diamonds, and clubs.
- Standard ranks are `2` through `10`, `J`, `Q`, `K`, and `A`.
- A game with up to three players uses one deck unless the two-deck option is
  explicitly enabled.
- A game with four or more players uses two decks.
- Jolly cards are included when there are at least seven players.
- Every card has a unique runtime identifier, even when rank and suit match.
- Jolly cards can acquire a selected rank while being played and retain
  metadata indicating that they were originally Jolly cards.

## Setup

- Players receive ten cards.
- Players normally select five cards to become face-up table cards; the
  remaining cards stay in hand.
- A hand containing a Jolly changes the setup slot count according to the
  existing setup implementation and must be preserved exactly by the engine
  tests.
- Face-up cards are ordered using the existing face-up ordering rules.
- Bots choose their face-up cards automatically.
- The game enters play only after all players have completed setup.

## Zones and turn order

Each player can have:

- A private hand.
- Face-up cards visible to everyone.
- Face-down cards whose identities are private until revealed.

The table contains the played sequence. Additional piles are used for Sboboz
cards and the super-Sboboz mechanic. Turns skip finished players and continue
around the player list.

When the hand and draw resources are exhausted, a player progresses through
face-up cards and then hidden cards. Hidden-card reveals are validated when
revealed; an invalid reveal follows the existing penalty path rather than
being accepted optimistically.

## Legal play

- A play consists of one or more cards from the currently active zone.
- Cards played together must satisfy the same-rank grouping rule, except for
  Jolly substitution.
- The selected rank must satisfy the current table requirement and active
  constraint.
- Jolly-only plays require an explicitly selected legal rank.
- The legal-action checks are contextual: hand, face-up, and hidden-card plays
  can have different available effects.
- Invalid actions must be rejected without mutating game state.

The extracted engine must expose legal actions rather than requiring React to
reimplement these checks.

## Special mechanics

The current engine defines contextual effects for the special ranks in
`EFFECT_RANKS` (`2`, `3`, `4`, `5`, `7`, `8`, `9`, `J`, and `K`). Their exact
effects are implemented in the existing `applyEffect`, `playHasEffect`, and
Sboboz resolution paths and must be migrated with characterization tests.

Important behavior to preserve:

- The number 5 has discard-related behavior and is tracked in statistics.
- The number 3 can provide a counter/controsboboz interaction.
- The number J interacts with the Sboboz/super-Sboboz piles and can cause
  special draws.
- The number K participates in Sboboz-related behavior and extra-turn
  resolution.
- The number 8 and 9 have mode/choice behavior selected from visible game
  information.
- The number 2, 4, 7, and other effect ranks alter turn or constraint
  resolution according to the existing contextual implementation.
- Jolly effects must be resolved against the same legal-rank constraints as
  their selected rank.

No new interpretation of these effects should be introduced during extraction.
Each effect should become a named domain rule with tests derived from the
current behavior.

## Sboboz

- A repeated rank at the top of the table can trigger Sboboz when its streak
  reaches the configured threshold.
- The threshold and the resulting table/pile split are part of game state.
- The triggering player and relevant statistics are recorded.
- Depending on the effect and rank, the active player can receive an extra
  turn, a penalty, or a counter opportunity.
- The Sboboz pile can later be restored or consumed by special effects.
- If no legal continuation remains, the player can pick up the table through
  the dedicated action.

## Draws, stalemates, and completion

- Players draw from the draw pile when required by the active rule.
- Draw and table counts are public; private card identities are not.
- A player is finished when the current implementation's hand/face-up/hidden
  progression is exhausted.
- Finish order determines ranking.
- Repeated state signatures are tracked. A repeated signature reaching the
  configured threshold ends the game as a stalemate.
- If only AI-controlled players remain, the host fast-forwards the game using
  the same rule engine with a safety limit.
- Results preserve finish order, ties, stalemate/draw status, turn count,
  rounds, elapsed time, and per-player statistics.

## Information visibility

- A player sees their own full hand.
- Other players see only hand length.
- Face-up cards are public.
- Face-down cards expose only a hidden-card marker until revealed.
- Host broadcasts must use a player-specific filtered view; a full internal
  state must never be sent to guests.

## Rule extraction checklist

Before declaring the engine complete, tests must cover deck counts, setup,
grouped plays, Jolly selection, every special rank, Sboboz threshold and
counter paths, table pickup, hidden-card failures, finish order, stalemate,
and private-state filtering.

