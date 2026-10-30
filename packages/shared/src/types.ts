export const SUITS = ['♠', '♥', '♦', '♣'] as const;
export const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'] as const;

export type Suit = (typeof SUITS)[number];
export type Rank = (typeof RANKS)[number] | 'JOLLY';
export type PlayerKind = 'human' | 'bot';
export type GamePhase = 'setup' | 'play' | 'finished' | 'stalemate';
export type CardZone = 'hand' | 'faceup' | 'facedown';

export interface Card {
  readonly uid: string;
  readonly rank: Rank;
  readonly suit: Suit | '🃏';
  readonly wasJolly?: boolean;
  readonly restored?: boolean;
}

export interface PlayerStats {
  played: number;
  pickups: number;
  taken: number;
  sboboz: number;
  sbobozCards: number;
  sbobozKings: number;
  kings: number;
  jollies: number;
  turns: number;
  reveals: number;
  discards: number;
  jdraws: number;
  maxHand: number;
  queens: number;
  counters: number;
  badReveals: number;
}

export interface PlayerState {
  id: string;
  name: string;
  kind: PlayerKind;
  avatar: string;
  hand: Card[];
  faceUp: Card[];
  faceDown: Card[];
  coveredBy: Record<string, Card>;
  finished: boolean;
  connected: boolean;
  ready: boolean;
  stats: PlayerStats;
}

export interface Constraint {
  readonly type: '8' | '9';
  readonly mode: 'higher' | 'lower' | 'effect' | 'noeffect';
}

export interface GameConfig {
  readonly players: readonly {
    id: string;
    name: string;
    kind: PlayerKind;
    avatar?: string;
  }[];
  readonly twoDecks?: boolean;
  readonly random?: RandomSource;
}

export interface RandomSource {
  next(): number;
}

export interface GameState {
  readonly phase: GamePhase;
  readonly players: readonly PlayerState[];
  readonly turn: number;
  readonly drawPile: readonly Card[];
  readonly table: readonly Card[];
  readonly sbobozPile: readonly Card[];
  readonly superSbobozPile: readonly Card[];
  readonly constraint: Constraint | null;
  readonly suppressNext: boolean;
  readonly sbobozThreshold: number;
  readonly numDecks: number;
  readonly hasJolly: boolean;
  readonly finishOrder: readonly string[];
  readonly turns: number;
  readonly sequence: number;
  readonly repetitions: Readonly<Record<string, number>>;
}

export interface PublicPlayerView {
  readonly id: string;
  readonly name: string;
  readonly kind: PlayerKind;
  readonly avatar: string;
  readonly hand: readonly Card[] | { readonly length: number };
  readonly faceUp: readonly Card[];
  readonly faceDownCount: number;
  readonly finished: boolean;
  readonly connected: boolean;
  readonly ready: boolean;
}

export interface PublicGameView {
  readonly me: string;
  readonly phase: GamePhase;
  readonly turn: number;
  readonly players: readonly PublicPlayerView[];
  readonly drawPileCount: number;
  readonly table: readonly Card[];
  readonly sbobozPile: readonly Card[];
  readonly superSbobozCount: number;
  readonly constraint: Constraint | null;
  readonly sequence: number;
}

export interface LobbyMember {
  readonly id: string;
  readonly name: string;
  readonly kind: PlayerKind;
  readonly avatar: string;
  readonly ready: boolean;
  readonly connected: boolean;
}

export interface LobbyView {
  readonly roomCode: string;
  readonly hostId: string;
  readonly members: readonly LobbyMember[];
  readonly phase: 'lobby' | 'game' | 'results';
}

export type NetworkMessage =
  | { readonly type: 'hello'; readonly protocol: number; readonly roomCode: string; readonly token: string }
  | { readonly type: 'action'; readonly requestId: string; readonly action: GameAction }
  | { readonly type: 'state'; readonly sequence: number; readonly view: PublicGameView }
  | { readonly type: 'reject'; readonly requestId: string; readonly reason: string }
  | { readonly type: 'ping'; readonly timestamp: number }
  | { readonly type: 'pong'; readonly timestamp: number }
  | { readonly type: 'leave'; readonly reason?: string };

export type GameAction =
  | { readonly type: 'complete-setup'; readonly cardIds: readonly string[] }
  | {
      readonly type: 'play';
      readonly cardIds: readonly string[];
      readonly jollyRank?: Rank;
      readonly constraintMode?: Constraint['mode'];
      readonly discardCardId?: string;
      readonly superCardId?: string;
    }
  | { readonly type: 'pickup-table' }
  | { readonly type: 'reveal'; readonly cardId: string };

export interface DomainEvent {
  readonly type: 'card-played' | 'card-drawn' | 'table-picked-up' | 'sboboz' | 'card-revealed' | 'game-finished' | 'stalemate';
  readonly playerId: string;
  readonly cardIds?: readonly string[];
}

export interface TransitionResult {
  readonly state: GameState;
  readonly events: readonly DomainEvent[];
  readonly error?: string;
}
