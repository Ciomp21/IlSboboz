# Sboboz Audit

## Scope

This audit describes the repository as found before the rewrite. The current
implementation remains untouched.

## Repository inventory

| Path | Responsibility |
|---|---|
| `index.html` | Complete application: markup, styles, configuration, libraries, game engine, bot logic, networking, rendering, statistics, and event wiring |
| `manifest.json` | PWA metadata and icon declaration |
| `sw.js` | Network-first navigation cache and stale-while-revalidate asset cache |
| `icona.png` | Application icon |
| `completamente-sboboz.mp3` | Optional home-screen music |
| `IlSboboz.zip` | Untracked archive supplied in the workspace; not used as a source of truth |

No package manifest, build configuration, TypeScript source, test suite, or
lint configuration is present.

## Current architecture

The application is a vanilla single-page application in one HTML file
(approximately 7,045 lines). Its major regions are:

- Inline CSS and responsive layout rules.
- Screen markup for home, join, lobby, setup, game, statistics, results, and
  overlays.
- Inline QR generation and PeerJS/WebRTC support.
- Global game state (`G`) and game rules.
- Local profile/statistics persistence (`Store`).
- Room and multiplayer state (`R`, `Room`, `Host`, `Guest`, `Client`).
- Party/series scoring (`Party`).
- Direct DOM rendering and animation helpers (`UI` and render functions).

The game rules are not duplicated in a separate UI rule system, which is a
useful property to preserve during extraction. The main risk is that all
boundaries are implicit and enforced only by convention.

## Feature inventory

### Gameplay

- Solo games against configurable ninja bots.
- Host-authoritative online rooms with up to seven players.
- One deck for small games and two decks for larger games.
- Jolly cards when the player count reaches seven.
- Initial selection of face-up cards.
- Hand, face-up, and hidden-card phases.
- Draw pile, table/discard pile, Sboboz pile, and super-Sboboz pile.
- Rank constraints and contextual special-card effects.
- Sboboz detection, penalties, table pickup, and counter effects.
- Stalemate detection and AI fast-forward.
- Finish order, ties, results, and per-player statistics.
- Multi-game parties with crowns and bonus categories.

### Online play

- Room creation and six-character room codes.
- QR code generation and camera/gallery QR scanning.
- Lobby membership, host controls, bot management, and ready state.
- Direct PeerJS/WebRTC data connections after broker rendezvous.
- Host-authoritative action validation and state broadcast.
- Private hand filtering through `viewFor`.
- Ping/RTT display.
- Reconnection grace periods and temporary bot takeover.
- Draw and rematch voting.
- Host termination is not migrated; the room can terminate with the host.

### User experience

- Italian interface.
- Responsive portrait/landscape layouts.
- Fullscreen controls.
- Reduced UI layers for mobile.
- Card selection and drag/drop-style interactions.
- Notifications, action log, reactions, and celebration overlays.
- Home-screen music with persisted user profile.
- Rules, information, settings, statistics, and import/export views.

### PWA and persistence

- Standalone manifest configuration.
- Cache versioning and service-worker activation cleanup.
- Network-first navigation so online players receive the latest page.
- Offline fallback for the cached page.
- Local profile, game history, party history, and preferences.
- Session storage for room rejoin and browser-tab identity.

## Dependencies and external services

- PeerJS is embedded in `index.html` and uses the public PeerJS broker for
  initial rendezvous.
- WebRTC ICE configuration is provided by the existing PeerJS setup.
- A QR decoder/generator is embedded in the page.
- Optional anonymous analytics is configured for Umami.
- No application game server is required.

The rewrite should move these dependencies into explicit package manifests and
adapters. The domain package must not depend on any of them.

## Technical debt and risks

1. The single file makes ownership, review, and isolated testing difficult.
2. Global mutable state makes accidental cross-action mutation possible.
3. Network messages are plain objects with runtime checks rather than a
   versioned protocol type.
4. The host and guest controllers know about rendering and game prompts.
5. Hidden-information guarantees depend on each view-building call being used
   correctly.
6. There are no automated regression tests for special-card interactions,
   reconnection, or private information.
7. Embedded third-party code makes dependency updates and source-map debugging
   difficult.
8. The service worker caches the current monolithic entry point, so deployment
   updates must keep cache invalidation deliberate.
9. The analytics identifier is active in the current configuration and should
   be made an explicit deployment setting during migration.

## Migration constraints

- Preserve the current HTML app as a working fallback until the replacement
  reaches parity.
- Extract behavior before changing rules.
- Use deterministic random sources in engine tests.
- Keep PeerJS as the transport and keep the host authoritative.
- Preserve local storage compatibility or provide a one-time migration.
- Do not add accounts, matchmaking, host migration, or a centralized game
  server in the initial rewrite.

