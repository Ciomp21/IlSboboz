import { describe, expect, it } from 'vitest';
import { createHostSession } from './host-controller';
import { parseNetworkMessage, PROTOCOL_VERSION } from './protocol';

const config = {
  random: { next: () => 0.5 },
  players: [
    { id: 'p1', name: 'Uno', kind: 'human' as const },
    { id: 'p2', name: 'Due', kind: 'human' as const },
  ],
};

describe('networking foundation', () => {
  it('rejects malformed or unsupported messages at the protocol boundary', () => {
    expect(parseNetworkMessage(null)).toBeNull();
    expect(parseNetworkMessage({ type: 'action', requestId: '1', action: { type: 'unknown' } })).toBeNull();
    expect(parseNetworkMessage({
      type: 'hello',
      protocol: PROTOCOL_VERSION,
      roomCode: 'ABC123',
      token: 'token',
    })).toEqual({
      type: 'hello',
      protocol: PROTOCOL_VERSION,
      roomCode: 'ABC123',
      token: 'token',
    });
  });

  it('keeps action validation on the host and filters each broadcast view', () => {
    const session = createHostSession(config);
    const rejected = session.handle('p2', {
      type: 'action',
      requestId: 'bad-turn',
      action: { type: 'pickup-table' },
    });
    expect(rejected).toEqual([{
      type: 'reject',
      requestId: 'bad-turn',
      reason: 'It is not your turn.',
    }]);

    const setupIds = session.state.players[0].hand.slice(0, 5).map((card) => card.uid);
    const first = session.handle('p1', {
      type: 'action',
      requestId: 'setup-1',
      action: { type: 'complete-setup', cardIds: setupIds },
    });
    expect(first).toHaveLength(2);
    const p2View = first.find((message) => message.type === 'state' && message.view.me === 'p2');
    expect(p2View?.type).toBe('state');
    if (p2View?.type === 'state') {
      expect(p2View.view.players.find((player) => player.id === 'p1')?.hand).toEqual({ length: 5 });
    }
  });
});
