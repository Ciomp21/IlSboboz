import type { LobbyView, NetworkMessage, PublicGameView } from '@ilsboboz/shared';
import { PROTOCOL_VERSION } from './protocol';

export interface GuestSession {
  readonly view: PublicGameView | null;
  readonly lobby: LobbyView | null;
  readonly memberId: string | null;
  readonly lastSequence: number;
  readonly connected: boolean;
  receive(message: NetworkMessage): boolean;
  disconnect(): void;
}

export function createGuestSession(): GuestSession {
  let view: PublicGameView | null = null;
  let lobby: LobbyView | null = null;
  let memberId: string | null = null;
  let lastSequence = -1;
  let connected = true;
  return {
    get view() {
      return view;
    },
    get lobby() {
      return lobby;
    },
    get memberId() {
      return memberId;
    },
    get lastSequence() {
      return lastSequence;
    },
    get connected() {
      return connected;
    },
    receive(message) {
      if (message.type === 'welcome') {
        if (message.protocol !== PROTOCOL_VERSION) return false;
        lobby = message.room;
        memberId = message.memberId;
        connected = true;
        return true;
      }
      if (message.type !== 'state') return false;
      if (message.sequence <= lastSequence) return false;
      view = message.view;
      lastSequence = message.sequence;
      connected = true;
      return true;
    },
    disconnect() {
      connected = false;
    },
  };
}
