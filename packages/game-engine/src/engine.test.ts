import { describe, expect, it } from 'vitest';
import { applyAction, createGame, getLegalActions, getPublicView, isLegalRank } from './engine';
import type { GameState, RandomSource } from '@ilsboboz/shared';

const fixedRandom: RandomSource = { next: () => 0.5 };

function game(): GameState {
  return createGame({
    random: fixedRandom,
    players: [
      { id: 'p1', name: 'Uno', kind: 'human' },
      { id: 'p2', name: 'Due', kind: 'bot' },
    ],
  });
}

function playState(overrides: Partial<GameState> = {}): GameState {
  const state = game();
  return {
    ...state,
    phase: 'play',
    players: state.players.map((player, index) => ({
      ...player,
      hand: index === 0 ? [] : player.hand,
      faceUp: [],
      faceDown: [],
      coveredBy: {},
      ready: true,
    })),
    ...overrides,
  };
}

describe('game engine foundation', () => {
  it('creates a single deck and deals ten hand cards plus five hidden cards', () => {
    const state = game();
    expect(state.numDecks).toBe(1);
    expect(state.players[0].hand).toHaveLength(10);
    expect(state.players[0].faceDown).toHaveLength(5);
    expect(state.players[0].faceUp).toHaveLength(0);
    expect(state.drawPile).toHaveLength(22);
  });

  it('uses two decks for four players and includes one Jolly at seven players', () => {
    const four = createGame({
      random: fixedRandom,
      players: [
        { id: 'p1', name: 'Uno', kind: 'human' },
        { id: 'p2', name: 'Due', kind: 'bot' },
        { id: 'p3', name: 'Tre', kind: 'bot' },
        { id: 'p4', name: 'Quattro', kind: 'bot' },
      ],
    });
    expect(four.numDecks).toBe(2);
    expect(four.hasJolly).toBe(false);
    const seven = createGame({
      random: fixedRandom,
      players: Array.from({ length: 7 }, (_, index) => ({
        id: `p${index}`,
        name: `Player ${index}`,
        kind: 'bot' as const,
      })),
    });
    expect(seven.hasJolly).toBe(true);
    expect(seven.players.flatMap((player) => [...player.hand, ...player.faceDown])
      .filter((card) => card.rank === 'JOLLY')).toHaveLength(1);
  });

  it('requires setup cards before play begins', () => {
    const state = game();
    const ids = state.players[0].hand.slice(0, 5).map((card) => card.uid);
    const first = applyAction(state, 'p1', { type: 'complete-setup', cardIds: ids });
    expect(first.error).toBeUndefined();
    expect(first.state.phase).toBe('setup');
    const secondIds = first.state.players[1].hand.slice(0, 5).map((card) => card.uid);
    const second = applyAction(first.state, 'p2', { type: 'complete-setup', cardIds: secondIds });
    expect(second.state.phase).toBe('play');
  });

  it('does not mutate state when an action is invalid', () => {
    const state = game();
    const result = applyAction(state, 'p2', { type: 'pickup-table' });
    expect(result.error).toBe('It is not your turn.');
    expect(result.state).toEqual(state);
  });

  it('treats two as a wild and applies the eight constraint', () => {
    const state = {
      ...game(),
      phase: 'play' as const,
      constraint: { type: '8' as const, mode: 'higher' as const },
    };
    expect(isLegalRank(state, '2', 'hand')).toBe(true);
    expect(isLegalRank(state, '9', 'hand')).toBe(true);
    expect(isLegalRank(state, '7', 'hand')).toBe(false);
  });

  it('exposes actions only for the active player', () => {
    const state = game();
    expect(getLegalActions(state, 'unknown')).toEqual([]);
    expect(getLegalActions(state, 'p1')).toHaveLength(1);
  });

  it('filters private hands from another player public view', () => {
    const state = game();
    const view = getPublicView(state, 'p1');
    expect(view.players.find((player) => player.id === 'p1')?.hand).toHaveLength(10);
    expect(view.players.find((player) => player.id === 'p2')?.hand).toEqual({ length: 10 });
    expect(view.players.find((player) => player.id === 'p2')?.faceDownCount).toBe(5);
  });

  it('discards with five and refills the hand to five cards', () => {
    const five = { uid: 'five', rank: '5' as const, suit: '♠' as const };
    const discard = { uid: 'discard', rank: '4' as const, suit: '♥' as const };
    const state = playState({
      players: [
        { ...game().players[0], hand: [five, discard], faceUp: [], faceDown: [], coveredBy: {}, ready: true },
        { ...game().players[1], hand: [], faceUp: [], faceDown: [], coveredBy: {}, ready: true },
      ],
      drawPile: [
        { uid: 'refill-1', rank: 'A', suit: '♠' },
        { uid: 'refill-2', rank: 'K', suit: '♠' },
        { uid: 'refill-3', rank: 'Q', suit: '♠' },
        { uid: 'refill-4', rank: 'J', suit: '♠' },
      ],
    });
    const result = applyAction(state, 'p1', {
      type: 'play',
      cardIds: ['five'],
      discardCardId: 'discard',
    });
    expect(result.error).toBeUndefined();
    expect(result.state.superSbobozPile.map((card) => card.uid)).toEqual(['discard']);
    expect(result.state.players[0].hand).toHaveLength(4);
    expect(result.state.players[0].stats.discards).toBe(1);
  });

  it('sets the eight constraint from the selected mode', () => {
    const eight = { uid: 'eight', rank: '8' as const, suit: '♠' as const };
    const state = playState({
      players: [
        { ...game().players[0], hand: [eight], faceUp: [], faceDown: [], coveredBy: {}, ready: true },
        { ...game().players[1], hand: [], faceUp: [], faceDown: [], coveredBy: {}, ready: true },
      ],
    });

    const result = applyAction(state, 'p1', {
      type: 'play',
      cardIds: ['eight'],
      constraintMode: 'higher',
    });
    expect(result.state.constraint).toEqual({ type: '8', mode: 'higher' });
    expect(isLegalRank(result.state, '9', 'hand')).toBe(true);
    expect(isLegalRank(result.state, '7', 'hand')).toBe(false);
  });

  it('waits for the eight effect choice after placing the card', () => {
    const eight = { uid: 'eight-pending', rank: '8' as const, suit: '♠' as const };
    const state = playState({
      players: [
        { ...game().players[0], hand: [eight], faceUp: [], faceDown: [], coveredBy: {}, ready: true },
        { ...game().players[1], hand: [], faceUp: [], faceDown: [], coveredBy: {}, ready: true },
      ],
    });
    const played = applyAction(state, 'p1', { type: 'play', cardIds: [eight.uid] });
    expect(played.state.table.map((card) => card.uid)).toEqual([eight.uid]);
    expect(played.state.pendingEffect).toEqual({
      type: 'constraint',
      playerId: 'p1',
      cardIds: [eight.uid],
      rank: '8',
    });
    expect(played.state.turn).toBe(0);
    const resolved = applyAction(played.state, 'p1', { type: 'resolve-effect', mode: 'higher' });
    expect(resolved.state.constraint).toEqual({ type: '8', mode: 'higher' });
    expect(resolved.state.pendingEffect).toBeNull();
    expect(resolved.state.turn).toBe(1);
  });

  it('sets the nine effect constraint from the selected mode', () => {
    const nine = { uid: 'nine', rank: '9' as const, suit: '♠' as const };
    const state = playState({
      players: [
        { ...game().players[0], hand: [nine], faceUp: [], faceDown: [], coveredBy: {}, ready: true },
        { ...game().players[1], hand: [], faceUp: [], faceDown: [], coveredBy: {}, ready: true },
      ],
    });
    const result = applyAction(state, 'p1', {
      type: 'play',
      cardIds: ['nine'],
      constraintMode: 'effect',
    });
    expect(result.state.constraint).toEqual({ type: '9', mode: 'effect' });
    expect(isLegalRank(result.state, '7', 'hand')).toBe(true);
    expect(isLegalRank(result.state, '6', 'hand')).toBe(false);
  });

  it('clears a constraint after the next card is played', () => {
    const ace = { uid: 'ace-after-nine', rank: 'A' as const, suit: '♥' as const };
    const state = playState({
      constraint: { type: '8', mode: 'higher' },
      players: [
        { ...game().players[0], hand: [ace], faceUp: [], faceDown: [], coveredBy: {}, ready: true },
        { ...game().players[1], hand: [ace], faceUp: [], faceDown: [], coveredBy: {}, ready: true },
      ],
    });
    const result = applyAction(state, 'p1', {
      type: 'play',
      cardIds: [ace.uid],
    });
    expect(result.state.constraint).toBeNull();
  });

  it('uses a jack to take a card from the super-Sboboz pile', () => {
    const jack = { uid: 'jack', rank: 'J' as const, suit: '♠' as const };
    const target = { uid: 'target', rank: 'A' as const, suit: '♦' as const };
    const state = playState({
      players: [
        { ...game().players[0], hand: [jack], faceUp: [], faceDown: [], coveredBy: {}, ready: true },
        { ...game().players[1], hand: [], faceUp: [], faceDown: [], coveredBy: {}, ready: true },
      ],
      superSbobozPile: [target],
    });
    const result = applyAction(state, 'p1', { type: 'play', cardIds: ['jack'], superCardId: 'target' });
    expect(result.state.superSbobozPile).toHaveLength(0);
    expect(result.state.players[0].hand.some((card) => card.uid === 'target')).toBe(true);
    expect(result.state.players[0].stats.jdraws).toBe(1);
  });

  it('moves the table into Sboboz when a king is played', () => {
    const king = { uid: 'king', rank: 'K' as const, suit: '♠' as const };
    const tableCard = { uid: 'table', rank: '6' as const, suit: '♦' as const };
    const state = playState({
      table: [tableCard],
      players: [
        { ...game().players[0], hand: [king], faceUp: [], faceDown: [], coveredBy: {}, ready: true },
        { ...game().players[1], hand: [], faceUp: [], faceDown: [], coveredBy: {}, ready: true },
      ],
    });
    const result = applyAction(state, 'p1', { type: 'play', cardIds: ['king'] });
    expect(result.state.table).toHaveLength(0);
    expect(result.state.sbobozPile.map((card) => card.uid)).toEqual(['table', 'king']);
    expect(result.state.players[0].stats.sbobozKings).toBe(1);
    expect(result.state.turn).toBe(0);
  });

  it('allows same-rank groups and rejects mixed-rank groups without mutating state', () => {
    const threeA = { uid: 'three-a', rank: '3' as const, suit: '♠' as const };
    const threeB = { uid: 'three-b', rank: '3' as const, suit: '♥' as const };
    const four = { uid: 'four', rank: '4' as const, suit: '♦' as const };
    const state = playState({
      players: [
        { ...game().players[0], hand: [threeA, threeB, four], faceUp: [], faceDown: [], coveredBy: {}, ready: true },
        { ...game().players[1], hand: [], faceUp: [], faceDown: [], coveredBy: {}, ready: true },
      ],
    });
    const invalid = applyAction(state, 'p1', { type: 'play', cardIds: [threeA.uid, four.uid] });
    expect(invalid.error).toBe('This play is not legal.');
    expect(invalid.state).toEqual(state);
    const valid = applyAction(state, 'p1', { type: 'play', cardIds: [threeA.uid, threeB.uid] });
    expect(valid.error).toBeUndefined();
    expect(valid.state.table.map((card) => card.uid)).toEqual([threeA.uid, threeB.uid]);
  });

  it('moves an exact repeated-rank threshold into Sboboz', () => {
    const played = { uid: 'three-played', rank: '3' as const, suit: '♠' as const };
    const table = [
      { uid: 'three-1', rank: '3' as const, suit: '♥' as const },
      { uid: 'three-2', rank: '3' as const, suit: '♦' as const },
      { uid: 'three-3', rank: '3' as const, suit: '♣' as const },
    ];
    const state = playState({
      table,
      players: [
        { ...game().players[0], hand: [played], faceUp: [], faceDown: [], coveredBy: {}, ready: true },
        { ...game().players[1], hand: [], faceUp: [], faceDown: [], coveredBy: {}, ready: true },
      ],
    });
    const result = applyAction(state, 'p1', { type: 'play', cardIds: [played.uid] });
    expect(result.events.some((event) => event.type === 'sboboz')).toBe(true);
    expect(result.state.table).toHaveLength(0);
    expect(result.state.sbobozPile).toHaveLength(4);
    expect(result.state.players[0].stats.sboboz).toBe(1);
    expect(result.state.turn).toBe(0);
  });

  it('finishes immediately when the player has no cards left', () => {
    const ace = { uid: 'winning-ace', rank: 'A' as const, suit: '♠' as const };
    const state = playState({
      drawPile: [],
      players: [
        { ...game().players[0], hand: [ace], faceUp: [], faceDown: [], coveredBy: {}, ready: true },
        { ...game().players[1], hand: [ace], faceUp: [], faceDown: [], coveredBy: {}, ready: true },
      ],
    });
    const result = applyAction(state, 'p1', { type: 'play', cardIds: [ace.uid] });
    expect(result.state.phase).toBe('finished');
    expect(result.state.finishOrder).toEqual(['p1']);
    expect(result.state.table).toHaveLength(1);
  });

  it('continues after the first player finishes in a three-player game', () => {
    const winner = { uid: 'first-winner', rank: 'A' as const, suit: '♠' as const };
    const state = createGame({
      random: fixedRandom,
      players: [
        { id: 'p1', name: 'Uno', kind: 'human' },
        { id: 'p2', name: 'Due', kind: 'bot' },
        { id: 'p3', name: 'Tre', kind: 'bot' },
      ],
    });
    const playable: GameState = {
      ...state,
      phase: 'play',
      drawPile: [],
      turn: 0,
      players: state.players.map((player, index) => ({
        ...player,
        hand: index === 0 ? [winner] : [winner],
        faceUp: [],
        faceDown: [],
        coveredBy: {},
        ready: true,
      })),
    };
    const result = applyAction(playable, 'p1', { type: 'play', cardIds: [winner.uid] });
    expect(result.state.phase).toBe('play');
    expect(result.state.finishOrder).toEqual(['p1']);
    expect(result.state.turn).toBe(1);
  });

  it('returns an invalid hidden reveal to hand and picks up the table', () => {
    const hidden = { uid: 'hidden', rank: '3' as const, suit: '♠' as const };
    const tableCard = { uid: 'table', rank: 'A' as const, suit: '♦' as const };
    const state = playState({
      table: [tableCard],
      players: [
        { ...game().players[0], hand: [], faceUp: [], faceDown: [hidden], coveredBy: {}, ready: true },
        { ...game().players[1], hand: [], faceUp: [], faceDown: [], coveredBy: {}, ready: true },
      ],
    });
    const result = applyAction(state, 'p1', { type: 'reveal', cardId: 'hidden' });
    expect(result.state.table).toHaveLength(0);
    expect(result.state.players[0].hand.map((card) => card.uid)).toEqual(['hidden', 'table']);
    expect(result.state.players[0].stats.badReveals).toBe(1);
    expect(result.state.players[0].stats.pickups).toBe(1);
    expect(result.state.turn).toBe(1);
  });

  it('returns a queen reveal to hand without treating it as a normal play', () => {
    const queen = { uid: 'queen', rank: 'Q' as const, suit: '♠' as const };
    const tableCard = { uid: 'table', rank: '2' as const, suit: '♦' as const };
    const state = playState({
      table: [tableCard],
      players: [
        { ...game().players[0], hand: [], faceUp: [], faceDown: [queen], coveredBy: {}, ready: true },
        { ...game().players[1], hand: [], faceUp: [], faceDown: [], coveredBy: {}, ready: true },
      ],
    });
    const result = applyAction(state, 'p1', { type: 'reveal', cardId: 'queen' });
    expect(result.state.players[0].hand.map((card) => card.uid)).toEqual(['queen']);
    expect(result.state.table.map((card) => card.uid)).toEqual(['table']);
    expect(result.state.players[0].stats.badReveals).toBe(0);
    expect(result.state.turn).toBe(1);
  });

  it('rejects a Jolly play without an explicit ordinary rank', () => {
    const jolly = { uid: 'jolly', rank: 'JOLLY' as const, suit: '🃏' as const };
    const state = playState({
      players: [
        { ...game().players[0], hand: [jolly], faceUp: [], faceDown: [], coveredBy: {}, ready: true },
        { ...game().players[1], hand: [], faceUp: [], faceDown: [], coveredBy: {}, ready: true },
      ],
    });
    const result = applyAction(state, 'p1', { type: 'play', cardIds: ['jolly'] });
    expect(result.error).toBe('A Jolly play requires a selected rank.');
    expect(result.state).toEqual(state);
  });

  it('uses a four to reveal the covered card under a face-up card', () => {
    const four = { uid: 'four', rank: '4' as const, suit: '♠' as const };
    const covered = { uid: 'covered', rank: 'A' as const, suit: '♦' as const };
    const state = playState({
      players: [
        {
          ...game().players[0],
          hand: [],
          faceUp: [four],
          faceDown: [covered],
          coveredBy: { four: covered },
          ready: true,
        },
        { ...game().players[1], hand: [], faceUp: [], faceDown: [], coveredBy: {}, ready: true },
      ],
    });
    const result = applyAction(state, 'p1', { type: 'play', cardIds: ['four'] });
    expect(result.state.players[0].faceUp.map((card) => card.uid)).toEqual(['covered']);
    expect(result.state.players[0].faceDown).toHaveLength(0);
    expect(result.state.players[0].coveredBy).toEqual({});
  });
});
