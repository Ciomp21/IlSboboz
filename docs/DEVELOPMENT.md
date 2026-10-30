# Development

## Planned commands

The foundation phase will add these commands:

```text
npm run dev
npm run build
npm run test
npm run lint
```

The exact package-manager scripts are part of the project-foundation change.

## Development rules

- Keep the legacy page runnable until migration is complete.
- Make domain changes in `packages/game-engine`, not in React components.
- Add a regression test for every extracted special mechanic.
- Use deterministic random providers in engine tests.
- Keep network tests independent from the DOM.
- Validate public-view filtering whenever state shape changes.
- Update the relevant architecture/rules document when a boundary changes.

## Testing strategy

### Unit tests

Vitest tests cover deck construction, legal actions, card effects, penalties,
turns, hidden cards, stalemate, results, and deterministic bot decisions.

### Networking tests

Use mocked PeerJS connections to cover handshake, invalid messages, snapshots,
sequence handling, disconnect/reconnect, and host termination.

### UI tests

React Testing Library covers screen transitions, accessible card actions,
prompts, lobby controls, error display, and filtered rendering.

### Browser tests

Playwright should cover a local game and at least a two-context host/guest
flow. Multiplayer browser tests must verify that a guest cannot observe
another player's private hand.

## PWA validation

Check manifest loading, service-worker registration, cache version changes,
offline fallback, and fresh-asset delivery after deployment. Development
should avoid reusing production caches accidentally.

## Rollback plan

The original `index.html` remains available during migration. The replacement
is enabled only after build, engine, networking, and browser regression checks
pass. A deployment can temporarily restore the legacy entry point without
losing stored profile data.

