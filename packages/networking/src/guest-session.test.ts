import { describe, expect, it } from 'vitest';
import { createGuestSession } from './guest-session';
import { PROTOCOL_VERSION } from './protocol';
import type { PublicGameView } from '@ilsboboz/shared';

const view = (sequence: number): PublicGameView => ({
  me: 'p1',
  phase: 'play',
  turn: 0,
  players: [],
  drawPileCount: 10,
  table: [],
  sbobozPile: [],
  superSbobozCount: 0,
  constraint: null,
  sequence,
  pendingEffect: null,
});

describe('guest session', () => {
  it('applies only newer authoritative snapshots', () => {
    const guest = createGuestSession();
    expect(guest.receive({ type: 'state', sequence: 2, view: view(2) })).toBe(true);
    expect(guest.receive({ type: 'state', sequence: 1, view: view(1) })).toBe(false);
    expect(guest.receive({ type: 'state', sequence: 2, view: view(2) })).toBe(false);
    expect(guest.lastSequence).toBe(2);
    expect(guest.view?.sequence).toBe(2);
  });

  it('tracks temporary transport loss without discarding the last view', () => {
    const guest = createGuestSession();
    guest.receive({ type: 'state', sequence: 1, view: view(1) });
    guest.disconnect();
    expect(guest.connected).toBe(false);
    expect(guest.view?.sequence).toBe(1);
    expect(guest.receive({ type: 'state', sequence: 2, view: view(2) })).toBe(true);
    expect(guest.connected).toBe(true);
  });

  it('stores the welcome lobby and assigned member', () => {
    const guest = createGuestSession();
    expect(guest.receive({
      type: 'welcome',
      protocol: PROTOCOL_VERSION,
      memberId: 'p2',
      room: {
        roomCode: 'ABC123',
        hostId: 'p1',
        phase: 'game',
        members: [],
      },
    })).toBe(true);
    expect(guest.memberId).toBe('p2');
    expect(guest.lobby?.roomCode).toBe('ABC123');
  });
});
