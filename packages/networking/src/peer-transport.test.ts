import { describe, expect, it } from 'vitest';
import type { NetworkMessage } from '@ilsboboz/shared';
import {
  createGuestPeerClient,
  createHostPeerServer,
  type PeerAdapter,
  type PeerConnection,
  type PeerFactory,
} from './peer-transport';

class FakeConnection implements PeerConnection {
  private dataHandler: ((value: unknown) => void) | null = null;
  private closeHandler: (() => void) | null = null;
  private errorHandler: ((error: Error) => void) | null = null;
  private peerConnection: FakeConnection | null = null;

  constructor(readonly peer: string) {}

  pair(connection: FakeConnection): void {
    this.peerConnection = connection;
  }

  send(message: NetworkMessage): void {
    this.peerConnection?.dataHandler?.(message);
  }

  close(): void {
    this.closeHandler?.();
  }

  onData(callback: (value: unknown) => void): void {
    this.dataHandler = callback;
  }

  onClose(callback: () => void): void {
    this.closeHandler = callback;
  }

  onError(callback: (error: Error) => void): void {
    this.errorHandler = callback;
    void this.errorHandler;
  }
}

class FakeAdapter implements PeerAdapter {
  private connectionHandler: ((connection: PeerConnection) => void) | null = null;

  constructor(readonly id: string, private readonly adapters: Map<string, FakeAdapter>) {
    adapters.set(id, this);
  }

  async connect(peerId: string): Promise<PeerConnection> {
    const target = this.adapters.get(peerId);
    if (!target) throw new Error('Peer not found.');
    const local = new FakeConnection(peerId);
    const remote = new FakeConnection(this.id);
    local.pair(remote);
    remote.pair(local);
    target.connectionHandler?.(remote);
    return local;
  }

  onConnection(callback: (connection: PeerConnection) => void): void {
    this.connectionHandler = callback;
  }

  close(): void {}
}

function factoryFor(ids: string[], adapters: Map<string, FakeAdapter>): PeerFactory {
  const remaining = [...ids];
  return {
    async create(id) {
      return new FakeAdapter(id ?? remaining.shift()!, adapters);
    },
  };
}

describe('PeerJS transport adapter', () => {
  it('connects a guest, validates the handshake, and sends filtered host snapshots', async () => {
    const adapters = new Map<string, FakeAdapter>();
    const hostFactory = factoryFor(['host-peer'], adapters);
    const guestFactory = factoryFor(['guest-peer'], adapters);
    const host = await createHostPeerServer({
      random: { next: () => 0.5 },
      players: [
        { id: 'p1', name: 'Uno', kind: 'human' },
        { id: 'p2', name: 'Due', kind: 'human' },
      ],
    }, hostFactory, 'ABC123', () => 'p1');
    const guest = await createGuestPeerClient(guestFactory);
    const received: NetworkMessage[] = [];
    guest.onMessage((message) => received.push(message));
    await guest.connect(host.peerId, 'ABC123', 'token');
    guest.send({
      type: 'action',
      requestId: 'setup',
      action: { type: 'complete-setup', cardIds: [] },
    });
    expect(received.find((message) => message.type === 'reject')).toEqual({
      type: 'reject',
      requestId: 'setup',
      reason: 'Select exactly 5 cards.',
    });
    guest.disconnect();
    host.close();
  });
});
