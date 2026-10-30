# Architecture

## Goals

The rewrite separates the domain game engine from the browser UI, networking,
and persistence while retaining the existing host-authoritative model.

## Workspace boundaries

```text
apps/web                 React/Vite entry point and screens
packages/game-engine     Pure TypeScript rules and state transitions
packages/shared          Public contracts, constants, and event types
packages/networking      PeerJS adapters, rooms, protocol, synchronization
packages/ui              Reusable card and presentation components
tests                    Engine, networking, and integration tests
```

Dependencies point inward:

```text
web -> ui -> shared
web -> networking -> shared
web -> game-engine -> shared
```

The game engine has no imports from React, DOM, PeerJS, storage, timers, or
browser globals.

## Domain API

The first engine API should provide:

```ts
createGame(config, dependencies?): GameState
getLegalActions(state, playerId): GameAction[]
applyAction(state, playerId, action): TransitionResult
getPublicView(state, playerId): PublicGameView
getGameStatus(state): GameStatus
```

`TransitionResult` contains the next immutable state, emitted domain events,
and an explicit error when an action is invalid. Randomness is injected through
a small interface so tests can use a seeded or scripted source.

## State and action design

Use explicit discriminated unions for cards, game phases, player zones,
actions, domain events, network messages, and connection status. Card identities
are opaque strings. Internal state and public views are different types.

The engine owns all legality, turn progression, effects, penalties, scoring,
and completion. Zustand stores only client presentation state, room/session
metadata, and the latest authoritative public view.

## Frontend layers

- Screens compose application-level flows.
- Components render cards, players, piles, prompts, and results.
- Hooks translate UI gestures into application commands.
- A game-session controller calls the engine locally or sends an action to the
  host controller.
- CSS animations observe state changes and never decide game outcomes.

## Migration strategy

1. Add documentation and project foundation without replacing `index.html`.
2. Characterize the existing engine behavior with deterministic tests.
3. Extract shared contracts and pure engine modules.
4. Add a compatibility adapter that can drive the existing UI.
5. Implement networking against the extracted public views.
6. Build React screens in parallel with the legacy page.
7. Switch the entry point only after local and multiplayer parity checks.
8. Remove legacy code after the replacement is the default and rollback is no
   longer needed.

## Risks

- Hidden coupling in special-card effects may be exposed during extraction.
- Local statistics need a versioned migration from `ilsboboz.profile.v1`.
- PeerJS behavior and browser WebRTC support vary by browser/network.
- Service-worker caches can serve an old entry point after deployment.
- Rendering parity is broad; gameplay correctness takes priority over pixel
  parity during the first migration.

