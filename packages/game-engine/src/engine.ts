import {
  type Card,
  type CardZone,
  type DomainEvent,
  type GameAction,
  type GameConfig,
  type GameState,
  type PlayerState,
  type PlayerStats,
  type PublicGameView,
  type TransitionResult,
  RANKS,
  SUITS,
  type Rank,
} from '@ilsboboz/shared';

const VALUES: Record<Rank, number> = {
  JOLLY: 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7,
  '8': 8, '9': 9, '10': 10, J: 11, Q: 12, K: 13, A: 14,
};
const EFFECT_RANKS = new Set<Rank>(['2', '3', '4', '5', '7', '8', '9', 'J', 'K']);

const defaultRandom = { next: () => Math.random() };

function stats(): PlayerStats {
  return {
    played: 0, pickups: 0, taken: 0, sboboz: 0, sbobozCards: 0,
    sbobozKings: 0, kings: 0, jollies: 0, turns: 0, reveals: 0,
    discards: 0, jdraws: 0, maxHand: 0, queens: 0, counters: 0, badReveals: 0,
  };
}

function shuffle(cards: Card[], random: GameConfig['random']): Card[] {
  const rng = random ?? defaultRandom;
  for (let i = cards.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng.next() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards;
}

function buildDeck(numDecks: number, hasJolly: boolean, random: GameConfig['random']): Card[] {
  const cards: Card[] = [];
  for (let deck = 0; deck < numDecks; deck += 1) {
    for (const suit of SUITS) {
      for (const rank of RANKS) cards.push({ uid: '', rank, suit });
    }
  }
  if (hasJolly) cards.push({ uid: '', rank: 'JOLLY', suit: '🃏' });
  shuffle(cards, random);
  return cards.map((card, index) => ({ ...card, uid: `c${index}` }));
}

function cloneStats(value: PlayerStats): PlayerStats {
  return { ...value };
}

function clonePlayer(player: PlayerState): PlayerState {
  return {
    ...player,
    hand: [...player.hand],
    faceUp: [...player.faceUp],
    faceDown: [...player.faceDown],
    coveredBy: { ...player.coveredBy },
    stats: cloneStats(player.stats),
  };
}

function cloneState(state: GameState): {
  players: PlayerState[];
  drawPile: Card[];
  table: Card[];
  sbobozPile: Card[];
  superSbobozPile: Card[];
  finishOrder: string[];
} {
  return {
    players: state.players.map(clonePlayer),
    drawPile: [...state.drawPile],
    table: [...state.table],
    sbobozPile: [...state.sbobozPile],
    superSbobozPile: [...state.superSbobozPile],
    finishOrder: [...state.finishOrder],
  };
}

function top(state: GameState): Card | undefined {
  return state.table[state.table.length - 1];
}

function requiredValue(state: GameState): number {
  const card = top(state);
  return !card || card.rank === '2' ? 0 : VALUES[card.rank];
}

function streak(state: GameState): number {
  const card = top(state);
  if (!card) return 0;
  let count = 0;
  for (let i = state.table.length - 1; i >= 0; i -= 1) {
    const current = state.table[i];
    if (current.rank !== card.rank || current.restored) break;
    count += 1;
  }
  return count;
}

function zoneEffect(state: GameState, rank: Rank, zone: CardZone): boolean {
  if (rank === '2' || rank === 'K') return true;
  if (rank === 'Q') return zone === 'facedown';
  if (!EFFECT_RANKS.has(rank)) return false;
  if (rank === '3') return state.sbobozPile.length > 0;
  if (rank === '4') return zone === 'faceup';
  if (rank === '5') return zone === 'hand';
  if (rank === 'J') return state.superSbobozPile.length > 0;
  return true;
}

function satisfiesConstraint(state: GameState, rank: Rank, zone: CardZone): boolean {
  const constraint = state.constraint;
  if (!constraint || rank === '2' || rank === 'JOLLY') return true;
  if (constraint.type === '8') {
    return constraint.mode === 'higher' ? VALUES[rank] > 8 : VALUES[rank] < 8;
  }
  const effect = zoneEffect(state, rank, zone);
  return constraint.mode === 'effect' ? effect : !effect;
}

export function isLegalRank(state: GameState, rank: Rank, zone: CardZone): boolean {
  if (rank === '2' || rank === 'JOLLY') return true;
  if (state.constraint) return satisfiesConstraint(state, rank, zone);
  return VALUES[rank] >= requiredValue(state);
}

function playerFor(state: GameState, playerId: string): PlayerState | undefined {
  return state.players.find((player) => player.id === playerId);
}

function activePlayer(state: GameState): PlayerState {
  return state.players[state.turn];
}

function zoneFor(player: PlayerState): CardZone {
  if (player.hand.length > 0) return 'hand';
  if (player.faceUp.length > 0) return 'faceup';
  return 'facedown';
}

function stateSignature(state: GameState): string {
  const constraint = state.constraint ? `${state.constraint.type}:${state.constraint.mode}` : '-';
  const players = state.players.map((player) => [
    player.id,
    player.hand.map((card) => card.rank).sort().join(','),
    player.faceUp.map((card) => card.rank).join(','),
    player.faceDown.length,
    player.finished ? '1' : '0',
  ].join(':')).join('|');
  return `${state.turn}|${constraint}|${state.suppressNext ? '1' : '0'}|${state.table.map((card) => card.rank).join(',')}|${players}`;
}

export function createGame(config: GameConfig): GameState {
  if (config.players.length < 2 || config.players.length > 7) {
    throw new Error('A game requires between 2 and 7 players.');
  }
  const numDecks = config.players.length <= 3 && !config.twoDecks ? 1 : 2;
  const hasJolly = config.players.length >= 7;
  const deck = buildDeck(numDecks, hasJolly, config.random);
  const players = config.players.map((member) => {
    const faceDown = deck.splice(0, 5);
    const hand = deck.splice(0, 10);
    const player: PlayerState = {
      id: member.id, name: member.name, kind: member.kind, avatar: member.avatar ?? '🥷',
      hand, faceUp: [], faceDown, coveredBy: {}, finished: false, connected: true, ready: false, stats: stats(),
    };
    player.stats.maxHand = hand.length;
    return player;
  });
  return {
    phase: 'setup', players, turn: 0, drawPile: deck, table: [],
    sbobozPile: [], superSbobozPile: [], constraint: null, suppressNext: false,
    sbobozThreshold: numDecks === 1 ? 4 : 6, numDecks, hasJolly,
    finishOrder: [], turns: 0, sequence: 0, repetitions: {},
  };
}

function fail(state: GameState, error: string): TransitionResult {
  return { state, events: [], error };
}

function finishSetup(state: GameState, playerId: string, ids: readonly string[]): TransitionResult {
  const data = cloneState(state);
  const index = data.players.findIndex((player) => player.id === playerId);
  if (index < 0) return fail(state, 'Unknown player.');
  const player = data.players[index];
  if (state.phase !== 'setup' || player.ready) return fail(state, 'Setup is not available.');
  const expected = player.hand.some((card) => card.rank === 'JOLLY') ? 4 : 5;
  if (ids.length !== expected || new Set(ids).size !== ids.length) {
    return fail(state, `Select exactly ${expected} cards.`);
  }
  const selected = ids.map((id) => player.hand.find((card) => card.uid === id));
  if (selected.some((card) => !card)) return fail(state, 'Selected card is not in your hand.');
  player.hand = player.hand.filter((card) => !ids.includes(card.uid));
  player.faceUp = selected.filter((card): card is Card => Boolean(card))
    .sort((a, b) => (a.rank === '2' ? -999 : a.rank === 'JOLLY' ? 1000 : VALUES[a.rank])
      - (b.rank === '2' ? -999 : b.rank === 'JOLLY' ? 1000 : VALUES[b.rank]));
  player.coveredBy = {};
  player.faceUp.forEach((card, slot) => {
    const covered = player.faceDown[slot];
    if (covered) player.coveredBy[card.uid] = covered;
  });
  player.ready = true;
  const phase = data.players.every((entry) => entry.ready) ? 'play' : 'setup';
  return { state: { ...state, ...data, phase, sequence: state.sequence + 1 }, events: [] };
}

function cardsFromPlayer(player: PlayerState, ids: readonly string[], zone: CardZone): Card[] {
  const source = zone === 'hand' ? player.hand : zone === 'faceup' ? player.faceUp : player.faceDown;
  return ids.map((id) => source.find((card) => card.uid === id)).filter((card): card is Card => Boolean(card));
}

export function getLegalActions(state: GameState, playerId: string): GameAction[] {
  if (state.phase === 'setup') {
    const player = playerFor(state, playerId);
    if (!player || player.ready) return [];
    const count = player.hand.some((card) => card.rank === 'JOLLY') ? 4 : 5;
    return [{ type: 'complete-setup', cardIds: player.hand.slice(0, count).map((card) => card.uid) }];
  }
  if (state.phase !== 'play' || activePlayer(state).id !== playerId) return [];
  const player = activePlayer(state);
  const zone = zoneFor(player);
  const actions: GameAction[] = [];
  const source = zone === 'hand' ? player.hand : zone === 'faceup' ? player.faceUp : player.faceDown;
  for (const card of source) {
    if (zone === 'facedown') actions.push({ type: 'reveal', cardId: card.uid });
    else if (isLegalRank(state, card.rank, zone)) actions.push({ type: 'play', cardIds: [card.uid] });
  }
  if (state.table.length > 0) actions.push({ type: 'pickup-table' });
  return actions;
}

export function applyAction(state: GameState, playerId: string, action: GameAction): TransitionResult {
  if (action.type === 'complete-setup') return finishSetup(state, playerId, action.cardIds);
  if (state.phase !== 'play' || activePlayer(state).id !== playerId) return fail(state, 'It is not your turn.');
  if (action.type === 'pickup-table') {
    const data = cloneState(state);
    const player = data.players[state.turn];
    player.hand = [...player.hand, ...data.table];
    player.stats.pickups += 1;
    player.stats.taken += data.table.length;
    data.table = [];
    return { state: { ...state, ...data, sequence: state.sequence + 1 }, events: [{ type: 'table-picked-up', playerId }] };
  }
  if (action.type === 'reveal') {
    const player = activePlayer(state);
    const card = player.faceDown.find((entry) => entry.uid === action.cardId);
    if (!card) return fail(state, 'Hidden card not found.');
    const data = cloneState(state);
    const target = data.players[state.turn];
    target.faceDown = target.faceDown.filter((entry) => entry.uid !== card.uid);
    target.stats.reveals += 1;
    const revealedIsQueen = card.rank === 'Q';
    const revealedIsLegal = isLegalRank(state, card.rank, 'facedown');
    let revealConstraint = state.constraint;
    if (revealedIsQueen || !revealedIsLegal) {
      target.hand = [...target.hand, card];
      if (!revealedIsQueen) target.stats.badReveals += 1;
      target.stats.maxHand = Math.max(target.stats.maxHand, target.hand.length);
      if (!revealedIsQueen || !revealedIsLegal) {
        target.stats.pickups += 1;
        target.stats.taken += data.table.length;
        target.hand = [...target.hand, ...data.table];
        data.table = [];
        revealConstraint = null;
      }
    } else {
      data.table.push(card);
    }
    const nextTurn = data.players.length > 1 ? (state.turn + 1) % data.players.length : state.turn;
    return {
      state: {
        ...state, ...data, constraint: revealConstraint,
        turn: nextTurn, suppressNext: revealedIsQueen ? false : state.suppressNext,
        sequence: state.sequence + 1,
      },
      events: [{ type: 'card-revealed', playerId, cardIds: [card.uid] }],
    };
  }
  if (action.type === 'play') {
    const player = activePlayer(state);
    const zone = zoneFor(player);
    const cards = cardsFromPlayer(player, action.cardIds, zone);
    if (!cards.length || cards.length !== action.cardIds.length) return fail(state, 'Card not found.');
    const nonJollyRank = cards.find((card) => card.rank !== 'JOLLY')?.rank;
    if (!nonJollyRank && !action.jollyRank) return fail(state, 'A Jolly play requires a selected rank.');
    if (action.jollyRank === 'JOLLY') return fail(state, 'A Jolly must select an ordinary rank.');
    const rank = action.jollyRank ?? nonJollyRank!;
    if (!isLegalRank(state, rank, zone) || cards.some((card) => card.rank !== 'JOLLY' && card.rank !== rank)) {
      return fail(state, 'This play is not legal.');
    }
    const data = cloneState(state);
    const target = data.players[state.turn];
    const played = cards.map((card) => card.rank === 'JOLLY' ? { ...card, rank, wasJolly: true } : card);
    if (zone === 'hand') target.hand = target.hand.filter((card) => !action.cardIds.includes(card.uid));
    else target.faceUp = target.faceUp.filter((card) => !action.cardIds.includes(card.uid));
    data.table.push(...played);
    target.stats.played += played.length;
    if (played.some((card) => card.wasJolly)) target.stats.jollies += 1;
    const playedRank = played[0].rank;
    const sbobozState = { ...state, table: data.table };
    const sboboz = streak(sbobozState) >= state.sbobozThreshold;
    let nextTurn = state.turn;
    let table = data.table;
    let sbobozPile = data.sbobozPile;
    let superSbobozPile = data.superSbobozPile;
    let constraint: GameState['constraint'] = null;
    let suppressNext = false;
    let phase: GameState['phase'] = 'play';
    const effectsAllowed = !state.suppressNext && !sboboz;
    if (effectsAllowed && playedRank === '3' && sbobozPile.length > 0) {
      let trailingThrees = 0;
      for (let i = sbobozPile.length - 1; i >= 0 && sbobozPile[i].rank === '3'; i -= 1) trailingThrees += 1;
      const restored = sbobozPile.map((card, index) => ({
        ...card,
        restored: index < sbobozPile.length - trailingThrees,
      }));
      table = [...table.slice(0, -played.length), ...restored, ...table.slice(-played.length)];
      sbobozPile = [];
      target.stats.counters += 1;
    }
    if (effectsAllowed && playedRank === '5' && target.hand.length > 0) {
      const discard = target.hand.find((card) => card.uid === action.discardCardId) ?? target.hand[0];
      target.hand = target.hand.filter((card) => card.uid !== discard.uid);
      superSbobozPile = [...superSbobozPile, discard];
      target.stats.discards += 1;
    }
    if (effectsAllowed && playedRank === '7') suppressNext = true;
    if (effectsAllowed && (playedRank === '8' || playedRank === '9')) {
      const mode = action.constraintMode;
      if (playedRank === '8' && (mode === 'higher' || mode === 'lower')) {
        constraint = { type: '8', mode };
      } else if (playedRank === '9' && (mode === 'effect' || mode === 'noeffect')) {
        constraint = { type: '9', mode };
      }
    }
    if (effectsAllowed && playedRank === 'J' && superSbobozPile.length > 0) {
      const picked = superSbobozPile.find((card) => card.uid === action.superCardId) ?? superSbobozPile[superSbobozPile.length - 1];
      superSbobozPile = superSbobozPile.filter((card) => card.uid !== picked.uid);
      target.hand = [...target.hand, { ...picked, rank: picked.wasJolly ? '2' : picked.rank }];
      target.stats.jdraws += 1;
      target.stats.maxHand = Math.max(target.stats.maxHand, target.hand.length);
    }
    if (effectsAllowed && playedRank === 'K') {
      sbobozPile = [...sbobozPile, ...table];
      table = [];
      target.stats.sboboz += 1;
      target.stats.sbobozKings += 1;
    }
    if (effectsAllowed && playedRank === '4' && zone === 'faceup') {
      const covered = target.coveredBy[played[0].uid];
      if (covered) {
        target.faceDown = target.faceDown.filter((card) => card.uid !== covered.uid);
        target.faceUp = [...target.faceUp, covered];
        delete target.coveredBy[played[0].uid];
      }
    }
    if (sboboz) {
      sbobozPile = [...sbobozPile, ...table];
      table = [];
      target.stats.sboboz += 1;
      target.stats.sbobozCards += sbobozPile.length;
    }
    while (target.hand.length < 5 && data.drawPile.length > 0) {
      target.hand = [...target.hand, data.drawPile.pop()!];
    }
    target.stats.maxHand = Math.max(target.stats.maxHand, target.hand.length);
    if (target.hand.length === 0 && target.faceUp.length === 0 && target.faceDown.length === 0) {
      target.finished = true;
      if (!data.finishOrder.includes(target.id)) data.finishOrder.push(target.id);
    }
    const remaining = data.players.filter((entry) => !entry.finished);
    if (remaining.length <= 1) phase = 'finished';
    else {
      do { nextTurn = (nextTurn + 1) % data.players.length; } while (data.players[nextTurn].finished);
    }
    const events: DomainEvent[] = [{ type: 'card-played', playerId, cardIds: played.map((card) => card.uid) }];
    if (sboboz) events.push({ type: 'sboboz', playerId });
    if (phase === 'finished') events.push({ type: 'game-finished', playerId });
    const nextState = {
      ...state, ...data, table, sbobozPile, superSbobozPile, constraint, suppressNext,
      turn: nextTurn, phase: phase as GameState['phase'], turns: state.turns + 1, sequence: state.sequence + 1,
      repetitions: state.repetitions,
    };
    if (phase === 'play') {
      const signature = stateSignature(nextState);
      const count = (state.repetitions[signature] ?? 0) + 1;
      const repetitions = { ...state.repetitions, [signature]: count };
      if (count >= 3) {
        nextState.phase = 'stalemate';
        events.push({ type: 'stalemate', playerId });
      }
      nextState.repetitions = repetitions;
    }
    return {
      state: nextState,
      events,
    };
  }
  return fail(state, 'Unsupported action.');
}

export function getGameStatus(state: GameState): GameState['phase'] {
  return state.phase;
}

export function getPublicView(state: GameState, playerId: string): PublicGameView {
  if (!state.players.some((player) => player.id === playerId)) {
    throw new Error('Unknown player.');
  }
  return {
    me: playerId,
    phase: state.phase,
    turn: state.turn,
    players: state.players.map((player) => ({
      id: player.id,
      name: player.name,
      kind: player.kind,
      avatar: player.avatar,
      hand: player.id === playerId ? [...player.hand] : { length: player.hand.length },
      faceUp: [...player.faceUp],
      faceDownCount: player.faceDown.length,
      finished: player.finished,
      connected: player.connected,
      ready: player.ready,
    })),
    drawPileCount: state.drawPile.length,
    table: [...state.table],
    sbobozPile: [...state.sbobozPile],
    superSbobozCount: state.superSbobozPile.length,
    constraint: state.constraint,
    sequence: state.sequence,
  };
}
