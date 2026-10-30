import { describe, expect, it, vi } from 'vitest';
import { RoomManager, type RoomMember } from './room-manager';

function room(onExpired?: (member: RoomMember) => void): RoomManager {
  return new RoomManager({
    roomCode: 'ABC123',
    graceMs: 1_000,
    onExpired,
    host: {
      id: 'host',
      name: 'Host',
      avatar: '🥷',
      kind: 'human',
      ready: true,
      connected: true,
    },
  });
}

describe('room manager', () => {
  it('creates a bounded lobby and keeps reconnect tokens private', () => {
    const manager = room();
    const guest = manager.join({ token: 'guest-token', name: '  Guest  ', avatar: '🔥' });
    expect(guest.id).toBe('m2');
    expect(guest.name).toBe('Guest');
    expect(manager.lobby.members).toHaveLength(2);
    expect(manager.lobby.members[1]).not.toHaveProperty('token');
  });

  it('requires connected guests to be ready before starting', () => {
    const manager = room();
    const guest = manager.join({ token: 'guest-token', name: 'Guest', avatar: '🔥' });
    expect(() => manager.startGame()).toThrow('All connected players must be ready.');
    manager.setReady(guest.id, true);
    manager.startGame();
    expect(manager.phase).toBe('game');
  });

  it('reclaims a disconnected seat before its grace period expires', () => {
    vi.useFakeTimers();
    const manager = room();
    const guest = manager.join({ token: 'guest-token', name: 'Guest', avatar: '🔥' });
    manager.disconnect(guest.id);
    expect(manager.lobby.members.find((member) => member.id === guest.id)?.connected).toBe(false);
    const reconnected = manager.reconnect('guest-token');
    expect(reconnected.id).toBe(guest.id);
    expect(reconnected.connected).toBe(true);
    vi.advanceTimersByTime(1_001);
    expect(manager.lobby.members).toHaveLength(2);
    manager.close();
    vi.useRealTimers();
  });

  it('expires a disconnected seat after the grace period', () => {
    vi.useFakeTimers();
    const expired: string[] = [];
    const manager = room((member) => expired.push(member.id));
    const guest = manager.join({ token: 'guest-token', name: 'Guest', avatar: '🔥' });
    manager.disconnect(guest.id);
    vi.advanceTimersByTime(1_001);
    expect(expired).toEqual([guest.id]);
    expect(manager.lobby.members).toHaveLength(1);
    vi.useRealTimers();
  });

  it('does not allow host disconnect because host migration is out of scope', () => {
    const manager = room();
    expect(() => manager.disconnect('host')).toThrow('Host migration is not supported.');
  });
});
