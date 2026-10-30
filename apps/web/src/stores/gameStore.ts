import { create } from 'zustand';
import {
  applyAction,
  createGame,
  getLegalActions,
} from '@ilsboboz/game-engine';
import type { Card, Constraint, GameAction, GameState, Rank } from '@ilsboboz/shared';

const HUMAN_ID = 'p1';

interface GameStore {
  state: GameState | null;
  selectedIds: string[];
  message: string;
  startDemo(): void;
  toggleSelection(cardId: string): void;
  confirmSetup(): void;
  playSelected(options?: PlayOptions): void;
  reveal(cardId: string): void;
  pickupTable(): void;
  resolveEffect(action: Extract<GameAction, { type: 'resolve-effect' }>): void;
  reset(): void;
}

export interface PlayOptions {
  jollyRank?: Rank;
  constraintMode?: Constraint['mode'];
  discardCardId?: string;
  superCardId?: string;
}

function demoState(): GameState {
  return createGame({
    players: [
      { id: HUMAN_ID, name: 'Tu', kind: 'human', avatar: '🥷' },
      { id: 'p2', name: 'Ninja bot', kind: 'bot', avatar: '🤖' },
    ],
  });
}

function perform(state: GameState, playerId: string, action: GameAction): { state: GameState; message: string } {
  const result = applyAction(state, playerId, action);
  return {
    state: result.state,
    message: result.error ?? (result.events.map((event) => event.type).join(', ') || 'Azione eseguita.'),
  };
}

function activeCards(state: GameState, playerId: string): Card[] {
  const player = state.players.find((entry) => entry.id === playerId);
  if (!player) return [];
  if (player.hand.length > 0) return player.hand;
  if (player.faceUp.length > 0) return player.faceUp;
  return player.faceDown;
}

export function canSelectCard(state: GameState, playerId: string, cardId: string, selectedIds: readonly string[]): boolean {
  if (state.phase !== 'play' || state.players[state.turn]?.id !== playerId) return false;
  const card = activeCards(state, playerId).find((entry) => entry.uid === cardId);
  if (!card || card.rank === 'JOLLY' && selectedIds.length > 0) return false;
  const legalIds = new Set(
    getLegalActions(state, playerId)
      .filter((action): action is Extract<GameAction, { type: 'play' }> => action.type === 'play')
      .map((action) => action.cardIds[0]),
  );
  if (!legalIds.has(cardId)) return false;
  if (selectedIds.length === 0) return true;
  const selected = activeCards(state, playerId).filter((entry) => selectedIds.includes(entry.uid));
  const selectedRank = selected.find((entry) => entry.rank !== 'JOLLY')?.rank;
  return card.rank === selectedRank || card.rank === 'JOLLY';
}

function chooseBotAction(state: GameState): GameAction | null {
  const actions = getLegalActions(state, 'p2');
  if (actions.length === 0) return null;
  if (actions[0].type === 'resolve-effect') return actions[0];
  const playable = actions.find((action) => action.type === 'play');
  if (playable?.type === 'play') {
    const card = state.players[1].hand.find((entry) => playable.cardIds.includes(entry.uid))
      ?? state.players[1].faceUp.find((entry) => playable.cardIds.includes(entry.uid));
    if (card?.rank === 'JOLLY') return { ...playable, jollyRank: 'A' };
    if (card?.rank === '8') return { ...playable, constraintMode: 'higher' };
    if (card?.rank === '9') return { ...playable, constraintMode: 'effect' };
  }
  return playable ?? actions.find((action) => action.type === 'reveal') ?? actions[0];
}

function advanceBots(state: GameState): { state: GameState; message: string } {
  let current = state;
  let message = '';
  for (let guard = 0; guard < 20 && current.phase === 'play' && current.players[current.turn]?.kind === 'bot'; guard += 1) {
    const action = chooseBotAction(current);
    if (!action) break;
    const result = perform(current, 'p2', action);
    current = result.state;
    message = `Il bot: ${result.message}`;
  }
  return { state: current, message };
}

export const useGameStore = create<GameStore>((set) => ({
  state: null,
  selectedIds: [],
  message: '',
  startDemo() {
    const initial = demoState();
    const setup = perform(initial, 'p2', {
      type: 'complete-setup',
      cardIds: initial.players[1].hand.slice(0, 5).map((card) => card.uid),
    });
    set({ state: setup.state, selectedIds: [], message: 'Scegli 5 carte da mettere scoperte.' });
  },
  toggleSelection(cardId) {
    set((store) => {
      if (!store.state) return store;
      if (store.state.phase === 'play' && !store.selectedIds.includes(cardId)) {
        const cards = activeCards(store.state, HUMAN_ID);
        const card = cards.find((entry) => entry.uid === cardId);
        const selected = cards.filter((entry) => store.selectedIds.includes(entry.uid));
        const selectedRank = selected.find((entry) => entry.rank !== 'JOLLY')?.rank;
        if (!card) return store;
        if (selectedRank && card.rank !== selectedRank && card.rank !== 'JOLLY') {
          return { selectedIds: [cardId], message: 'Selezione sostituita con il nuovo valore.' };
        }
      }
      if (store.state.phase !== 'setup' && store.state.phase !== 'play') return store;
      const selectedIds = store.selectedIds.includes(cardId)
        ? store.selectedIds.filter((id) => id !== cardId)
        : [...store.selectedIds, cardId];
      return { selectedIds, message: `${selectedIds.length} carte selezionate.` };
    });
  },
  confirmSetup() {
    set((store) => {
      if (!store.state) return store;
      const result = perform(store.state, HUMAN_ID, {
        type: 'complete-setup',
        cardIds: store.selectedIds,
      });
      if (result.message === 'Azione eseguita.') {
        return { state: result.state, selectedIds: [], message: 'Setup completato. Tocca una carta per giocare.' };
      }
      return { state: result.state, selectedIds: [], message: result.message };
    });
  },
  playSelected(options) {
    set((store) => {
      if (!store.state || store.selectedIds.length === 0) return store;
      const result = perform(store.state, HUMAN_ID, { type: 'play', cardIds: store.selectedIds, ...options });
      const advanced = result.state.players[result.state.turn]?.kind === 'bot' ? advanceBots(result.state) : result;
      return { state: advanced.state, selectedIds: [], message: advanced.message };
    });
  },
  reveal(cardId) {
    set((store) => {
      if (!store.state) return store;
      const result = perform(store.state, HUMAN_ID, { type: 'reveal', cardId });
      const advanced = result.state.players[result.state.turn]?.kind === 'bot' ? advanceBots(result.state) : result;
      return { state: advanced.state, selectedIds: [], message: advanced.message };
    });
  },
  pickupTable() {
    set((store) => {
      if (!store.state) return store;
      const result = perform(store.state, HUMAN_ID, { type: 'pickup-table' });
      const advanced = result.state.players[result.state.turn]?.kind === 'bot' ? advanceBots(result.state) : result;
      return { state: advanced.state, selectedIds: [], message: advanced.message };
    });
  },
  resolveEffect(action) {
    set((store) => {
      if (!store.state) return store;
      const result = perform(store.state, HUMAN_ID, action);
      const advanced = result.state.players[result.state.turn]?.kind === 'bot' ? advanceBots(result.state) : result;
      return { state: advanced.state, selectedIds: [], message: advanced.message };
    });
  },
  reset() {
    set({ state: null, selectedIds: [], message: '' });
  },
}));

export function isSelected(selectedIds: readonly string[], card: Card): boolean {
  return selectedIds.includes(card.uid);
}
