import {
  applyAction,
  createGame,
  getPublicView,
} from '@ilsboboz/game-engine';
import type {
  GameConfig,
  GameState,
  NetworkMessage,
} from '@ilsboboz/shared';

export interface HostSession {
  readonly state: GameState;
  handle(playerId: string, message: NetworkMessage): NetworkMessage[];
}

export function createHostSession(config: GameConfig): HostSession {
  let state = createGame(config);
  return {
    get state() {
      return state;
    },
    handle(playerId, message) {
      if (message.type === 'ping') return [{ type: 'pong', timestamp: message.timestamp }];
      if (message.type !== 'action') return [];
      const result = applyAction(state, playerId, message.action);
      if (result.error) {
        return [{ type: 'reject', requestId: message.requestId, reason: result.error }];
      }
      state = result.state;
      return state.players
        .filter((player) => player.connected)
        .map((player) => ({
          type: 'state' as const,
          sequence: state.sequence,
          view: getPublicView(state, player.id),
        }));
    },
  };
}
