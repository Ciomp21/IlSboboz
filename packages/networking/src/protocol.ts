import type { GameAction, LobbyView, NetworkMessage, PublicGameView } from '@ilsboboz/shared';

export const PROTOCOL_VERSION = 1;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isAction(value: unknown): value is GameAction {
  if (!isRecord(value) || typeof value.type !== 'string') return false;
  if (value.type === 'pickup-table') return true;
  if (value.type === 'reveal') return typeof value.cardId === 'string';
  if (value.type === 'resolve-effect') {
    return value.mode === undefined || typeof value.mode === 'string';
  }
  if (value.type === 'complete-setup' || value.type === 'play') {
    return Array.isArray(value.cardIds) && value.cardIds.every((id) => typeof id === 'string');
  }
  return false;
}

function isPublicView(value: unknown): value is PublicGameView {
  return isRecord(value)
    && typeof value.me === 'string'
    && typeof value.phase === 'string'
    && typeof value.turn === 'number'
    && Array.isArray(value.players)
    && typeof value.drawPileCount === 'number'
    && Array.isArray(value.table)
    && Array.isArray(value.sbobozPile)
    && typeof value.superSbobozCount === 'number'
    && typeof value.sequence === 'number';
}

function isLobbyView(value: unknown): value is LobbyView {
  return isRecord(value)
    && typeof value.roomCode === 'string'
    && typeof value.hostId === 'string'
    && (value.phase === 'lobby' || value.phase === 'game' || value.phase === 'results')
    && Array.isArray(value.members);
}

export function parseNetworkMessage(value: unknown): NetworkMessage | null {
  if (!isRecord(value) || typeof value.type !== 'string') return null;
  switch (value.type) {
    case 'hello':
      return typeof value.protocol === 'number'
        && typeof value.roomCode === 'string'
        && typeof value.token === 'string'
        ? { type: 'hello', protocol: value.protocol, roomCode: value.roomCode, token: value.token }
        : null;
    case 'welcome':
      return typeof value.protocol === 'number'
        && typeof value.memberId === 'string'
        && isLobbyView(value.room)
        ? { type: 'welcome', protocol: value.protocol, memberId: value.memberId, room: value.room }
        : null;
    case 'action':
      return typeof value.requestId === 'string' && isAction(value.action)
        ? { type: 'action', requestId: value.requestId, action: value.action }
        : null;
    case 'state':
      return typeof value.sequence === 'number' && isPublicView(value.view)
        ? { type: 'state', sequence: value.sequence, view: value.view }
        : null;
    case 'reject':
      return typeof value.requestId === 'string' && typeof value.reason === 'string'
        ? { type: 'reject', requestId: value.requestId, reason: value.reason }
        : null;
    case 'ping':
      return typeof value.timestamp === 'number' ? { type: 'ping', timestamp: value.timestamp } : null;
    case 'pong':
      return typeof value.timestamp === 'number' ? { type: 'pong', timestamp: value.timestamp } : null;
    case 'leave':
      return value.reason === undefined || typeof value.reason === 'string'
        ? { type: 'leave', reason: value.reason }
        : null;
    default:
      return null;
  }
}
