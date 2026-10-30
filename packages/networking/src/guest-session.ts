import type { NetworkMessage, PublicGameView } from '@ilsboboz/shared';

export interface GuestSession {
  readonly view: PublicGameView | null;
  readonly lastSequence: number;
  readonly connected: boolean;
  receive(message: NetworkMessage): boolean;
  disconnect(): void;
}

export function createGuestSession(): GuestSession {
  let view: PublicGameView | null = null;
  let lastSequence = -1;
  let connected = true;
  return {
    get view() {
      return view;
    },
    get lastSequence() {
      return lastSequence;
    },
    get connected() {
      return connected;
    },
    receive(message) {
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
