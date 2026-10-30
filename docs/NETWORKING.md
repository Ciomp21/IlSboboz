# Networking

## Transport and authority

PeerJS remains the rendezvous and WebRTC DataChannel adapter. The host owns the
authoritative game state. Guests send intents; they never send accepted state
mutations. The host validates actions through the game engine and broadcasts
filtered views.

Host migration is intentionally out of scope. If the host closes, clients
receive a terminal room error and can return to the menu.

## Responsibilities

### Peer manager

Owns PeerJS lifecycle, connection creation, connection closure, timeout
handling, and transport-level errors. It does not know game rules.

### Room manager

Owns room code, membership, lobby state, ready state, room settings, and
rejoin tokens. It does not render UI.

### Host controller

Owns the authoritative engine instance, validates guest commands, creates
player-specific public views, sends prompts, and broadcasts domain events.

### Guest controller

Owns the local connection, sends commands, validates message shape, receives
public views, and exposes connection status to the application layer.

### UI

Displays connection state and prompts, but cannot accept a card or advance a
turn without going through the controller.

## Protocol

All messages use a versioned discriminated union:

```ts
type NetworkMessage =
  | { type: 'hello'; protocol: number; roomCode: string; token: string }
  | { type: 'welcome'; protocol: number; memberId: string; view: LobbyView }
  | { type: 'action'; requestId: string; action: GameAction }
  | { type: 'state'; sequence: number; view: PublicGameView }
  | { type: 'event'; sequence: number; event: PublicGameEvent }
  | { type: 'reject'; requestId: string; reason: string }
  | { type: 'ping'; timestamp: number }
  | { type: 'pong'; timestamp: number }
  | { type: 'leave'; reason?: string };
```

Runtime validation is required at the transport boundary. Unknown message
types, oversized payloads, stale sequence numbers, and invalid request IDs are
rejected explicitly.

## Synchronization

- Every authoritative state has a monotonically increasing sequence.
- Guests apply only newer snapshots/events.
- A reconnect receives a complete player-filtered snapshot before incremental
  events resume.
- The host sends each guest a separate view so private hands remain private.
- A rejected action does not advance the sequence.

The current networking package implements these boundaries without a transport
dependency:

- `protocol.ts` validates inbound message shapes.
- `host-controller.ts` owns engine actions and filtered broadcasts.
- `guest-session.ts` applies only newer snapshots and retains the last view
  during temporary transport loss.
- `room-manager.ts` owns lobby membership, readiness, bounded capacity, stable
  reconnect tokens, and grace-period expiration.

PeerJS remains the next adapter layer; it must only translate connections and
data messages into these interfaces.

## Reconnection

- A guest keeps its stable member token in session storage.
- Temporary connection loss starts a grace timer.
- The host keeps the seat during the grace period.
- During a game, the disconnected player may be controlled by the existing bot
  fallback behavior.
- A returning guest reclaims the same seat and receives a fresh filtered
  snapshot.
- Lobby and game grace periods remain configurable.
- A host disconnect is terminal for the current room in this phase.

## Security and robustness

Peer connections are not trusted input. The host validates every action and
never accepts a guest-provided hand, score, turn, or result. Protocol versions
and build compatibility are checked during the handshake. Error messages are
safe for display and contain no private state.
