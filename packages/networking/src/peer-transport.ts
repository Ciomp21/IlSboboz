import Peer, { DataConnection, PeerOptions } from 'peerjs';
import type { GameConfig, NetworkMessage } from '@ilsboboz/shared';
import { createHostSession, type HostSession } from './host-controller';
import { parseNetworkMessage, PROTOCOL_VERSION } from './protocol';

export interface PeerConnection {
  readonly peer: string;
  send(message: NetworkMessage): void;
  close(): void;
  onData(callback: (value: unknown) => void): void;
  onClose(callback: () => void): void;
  onError(callback: (error: Error) => void): void;
}

export interface PeerAdapter {
  readonly id: string;
  connect(peerId: string): Promise<PeerConnection>;
  onConnection(callback: (connection: PeerConnection) => void): void;
  close(): void;
}

export interface PeerFactory {
  create(id?: string): Promise<PeerAdapter>;
}

function createPeerFactory(options: PeerOptions = new PeerOptions()): PeerFactory {
  return {
    async create(id?: string) {
      const peer = id ? new Peer(id, options) : new Peer(options);
      await new Promise<void>((resolve, reject) => {
        peer.once('open', () => resolve());
        peer.once('error', reject);
      });
      return new PeerJsAdapter(peer);
    },
  };
}

class PeerJsConnection implements PeerConnection {
  constructor(private readonly connection: DataConnection) {}

  get peer(): string {
    return this.connection.peer;
  }

  send(message: NetworkMessage): void {
    this.connection.send(message);
  }

  close(): void {
    this.connection.close();
  }

  onData(callback: (value: unknown) => void): void {
    this.connection.on('data', callback);
  }

  onClose(callback: () => void): void {
    this.connection.on('close', callback);
  }

  onError(callback: (error: Error) => void): void {
    this.connection.on('error', callback);
  }
}

class PeerJsAdapter implements PeerAdapter {
  constructor(private readonly peer: Peer) {}

  get id(): string {
    return this.peer.id;
  }

  connect(peerId: string): Promise<PeerConnection> {
    return new Promise((resolve, reject) => {
      const connection = this.peer.connect(peerId, { reliable: true });
      connection.once('open', () => resolve(new PeerJsConnection(connection)));
      connection.once('error', reject);
    });
  }

  onConnection(callback: (connection: PeerConnection) => void): void {
    this.peer.on('connection', (connection) => callback(new PeerJsConnection(connection)));
  }

  close(): void {
    this.peer.destroy();
  }
}

export interface HostPeerServer {
  readonly peerId: string;
  close(): void;
}

export async function createHostPeerServer(
  config: GameConfig,
  factory: PeerFactory = createPeerFactory(),
  roomCode = '',
  tokenForPeer: (peerId: string) => string = (peerId) => peerId,
): Promise<HostPeerServer> {
  const adapter = await factory.create();
  const session: HostSession = createHostSession(config);
  const connections = new Set<PeerConnection>();
  adapter.onConnection((connection) => {
    connections.add(connection);
    connection.onData((raw) => {
      const message = parseNetworkMessage(raw);
      if (!message) return;
      if (message.type === 'hello') {
        if (message.protocol !== PROTOCOL_VERSION || message.roomCode !== roomCode) {
          connection.send({ type: 'reject', requestId: 'handshake', reason: 'Incompatible room or protocol.' });
          connection.close();
          return;
        }
        return;
      }
      const responses = session.handle(tokenForPeer(connection.peer), message);
      responses.forEach((response) => connection.send(response));
    });
    connection.onClose(() => connections.delete(connection));
    connection.onError(() => connections.delete(connection));
  });
  return {
    peerId: adapter.id,
    close() {
      connections.forEach((connection) => connection.close());
      adapter.close();
    },
  };
}

export interface GuestPeerClient {
  readonly peerId: string;
  connect(hostPeerId: string, roomCode: string, token: string): Promise<void>;
  send(message: NetworkMessage): void;
  onMessage(callback: (message: NetworkMessage) => void): void;
  disconnect(): void;
}

export async function createGuestPeerClient(
  factory: PeerFactory = createPeerFactory(),
): Promise<GuestPeerClient> {
  const adapter = await factory.create();
  let connection: PeerConnection | null = null;
  let receiver: ((message: NetworkMessage) => void) | null = null;
  return {
    peerId: adapter.id,
    async connect(hostPeerId, roomCode, token) {
      connection = await adapter.connect(hostPeerId);
      connection.onData((raw) => {
        const message = parseNetworkMessage(raw);
        if (message) receiver?.(message);
      });
      connection.send({ type: 'hello', protocol: PROTOCOL_VERSION, roomCode, token });
    },
    send(message) {
      if (!connection) throw new Error('Guest is not connected.');
      connection.send(message);
    },
    onMessage(callback) {
      receiver = callback;
    },
    disconnect() {
      connection?.close();
      adapter.close();
      connection = null;
    },
  };
}
