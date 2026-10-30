import { useEffect, useState, type CSSProperties } from 'react';
import { canSelectCard, useGameStore, isSelected } from '../stores/gameStore';
import type { Card, GameState, Rank } from '@ilsboboz/shared';

function CardFace({ card, className = '' }: { card: Card; className?: string }) {
  const red = card.suit === '♥' || card.suit === '♦';
  return (
    <span className={`card-face ${red ? 'red' : ''} ${card.rank === 'JOLLY' ? 'jolly' : ''} ${className}`}>
      <span className="card-corner">{card.rank === 'JOLLY' ? '🃏' : card.rank}<br />{card.suit}</span>
      <span className="card-suit-mid">{card.rank === 'JOLLY' ? '★' : card.suit}</span>
      <span className="card-corner bottom">{card.rank === 'JOLLY' ? '🃏' : card.rank}<br />{card.suit}</span>
    </span>
  );
}

function CardButton({ card, selected, disabled, onClick }: {
  card: Card;
  selected: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={`playing-card ${card.rank === 'JOLLY' ? 'jolly' : ''} ${selected ? 'selected' : ''} ${disabled ? 'disabled' : ''}`}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      <CardFace card={card} />
    </button>
  );
}

function FanCard({ rank, suit, red = false, className = '' }: { rank: string; suit: string; red?: boolean; className?: string }) {
  return (
    <div className={`fan-card ${red ? 'red' : ''} ${className}`}>
      <span className="fan-corner">{rank}<br />{suit}</span>
      <span className="fan-mid">{suit}</span>
      <span className="fan-corner bottom">{rank}<br />{suit}</span>
    </div>
  );
}

function effectLabel(card: Card | undefined): string | null {
  if (!card) return null;
  const labels: Record<string, string> = {
    '2': 'Jolly',
    '3': 'Controsboboz',
    '4': 'Scopri la carta coperta',
    '5': 'Scarta una carta',
    '7': 'Prossimo effetto annullato',
    '8': 'Scegli il vincolo',
    '9': 'Scegli il tipo di carta',
    J: 'Pesca dal Super-Sboboz',
    K: 'Sboboz',
  };
  return labels[card.rank] ?? null;
}

function Setup({ state }: { state: GameState }) {
  const selectedIds = useGameStore((store) => store.selectedIds);
  const toggleSelection = useGameStore((store) => store.toggleSelection);
  const confirmSetup = useGameStore((store) => store.confirmSetup);
  const hand = state.players[0].hand;
  return (
    <section className="panel">
      <p className="eyebrow">Setup</p>
      <h2>Scegli le tue carte scoperte</h2>
      <p className="muted">Seleziona 5 carte. Il bot ha già completato il suo setup.</p>
      <div className="card-row">
        {hand.map((card) => (
          <CardButton key={card.uid} card={card} selected={isSelected(selectedIds, card)} onClick={() => toggleSelection(card.uid)} />
        ))}
      </div>
      <button className="primary-button" disabled={selectedIds.length !== 5} onClick={confirmSetup} type="button">
        Conferma setup ({selectedIds.length}/5)
      </button>
    </section>
  );
}

function Pile({ title, cards, hidden = false }: { title: string; cards: readonly Card[]; hidden?: boolean }) {
  const last = cards[cards.length - 1];
  const visibleCards = cards.slice(-3);
  return (
    <div className="pile">
      <span className="pile-title">{title}</span>
      <div className={`pile-card ${last ? `rank-${last.rank.toLowerCase()}` : ''}`}>
        {cards.length === 0 ? <span>—</span> : hidden ? (
          <span className="card-stack">{[0, 1, 2].map((offset) => <span className="card-back" style={{ '--stack-offset': `${offset * 3}px` } as CSSProperties} key={offset} />)}</span>
        ) : (
          <span className="card-stack">{visibleCards.map((card, index) => <CardFace card={card} className={index === visibleCards.length - 1 ? 'stack-top' : 'stack-under'} key={card.uid} />)}</span>
        )}
      </div>
      <small>{cards.length} carte</small>
    </div>
  );
}

function GameBoard({ state, onLeave }: { state: GameState; onLeave: () => void }) {
  const [jollyRank, setJollyRank] = useState<Rank>('A');
  const [constraintMode, setConstraintMode] = useState<'higher' | 'lower' | 'effect' | 'noeffect'>('higher');
  const [discardCardId, setDiscardCardId] = useState('');
  const [superCardId, setSuperCardId] = useState('');
  const [utilityOpen, setUtilityOpen] = useState(false);
  const [inspectedPlayerId, setInspectedPlayerId] = useState<string | null>(null);
  const [chatText, setChatText] = useState('');
  const [chatMessages, setChatMessages] = useState<string[]>([]);
  const selectedIds = useGameStore((store) => store.selectedIds);
  const toggleSelection = useGameStore((store) => store.toggleSelection);
  const playSelected = useGameStore((store) => store.playSelected);
  const resolveEffect = useGameStore((store) => store.resolveEffect);
  const reveal = useGameStore((store) => store.reveal);
  const pickupTable = useGameStore((store) => store.pickupTable);
  const human = state.players[0];
  const isTurn = state.players[state.turn]?.id === 'p1';
  const zone = human.hand.length > 0 ? 'hand' : human.faceUp.length > 0 ? 'faceup' : 'facedown';
  const cards = zone === 'hand' ? human.hand : zone === 'faceup' ? human.faceUp : human.faceDown;
  const selectedCards = cards.filter((card) => selectedIds.includes(card.uid));
  const needsJollyRank = selectedCards.some((card) => card.rank === 'JOLLY');
  const pending = state.pendingEffect;
  const needsConstraint = pending?.type === 'constraint';
  const needsDiscard = pending?.type === 'discard';
  const needsSuperCard = pending?.type === 'super-card';
  const canPlay = selectedIds.length > 0 && (zone === 'hand' || zone === 'faceup') && isTurn && !pending;
  const tableTop = state.table[state.table.length - 1];
  const renderZone = (zoneName: 'hand' | 'faceup' | 'facedown', zoneCards: readonly Card[]) => (
    <div className={`card-zone zone-${zoneName} ${zone === zoneName ? 'active-zone' : ''}`} key={zoneName}>
      <div className="zone-heading">
        <h3>{zoneName === 'hand' ? 'Mano' : zoneName === 'faceup' ? 'Carte scoperte' : 'Carte coperte'}</h3>
        <span>{zoneCards.length}</span>
      </div>
      <div className="card-row">
        {zoneCards.length === 0 && <span className="empty-zone">Nessuna carta</span>}
        {zoneCards.map((card) => zoneName === 'facedown'
          ? <button aria-label={`Rivela carta coperta ${card.uid}`} className="playing-card facedown" disabled={zone !== 'facedown' || !isTurn} key={card.uid} onClick={() => reveal(card.uid)} type="button"><span className="card-back" /></button>
          : <CardButton
            key={card.uid}
            card={card}
            selected={isSelected(selectedIds, card)}
            disabled={zone !== zoneName || !isTurn || Boolean(pending) || !canSelectCard(state, 'p1', card.uid, [])}
            onClick={() => toggleSelection(card.uid)}
          />)}
      </div>
    </div>
  );
  return (
    <section className="game-layout">
      <div className="status-line">
        <span className={isTurn ? 'turn active' : 'turn'}><span className="turn-dot" />{isTurn ? 'Il tuo turno' : `Turno di ${state.players[state.turn]?.name}`}</span>
        <span className="status-chip">Fase: {state.phase}</span>
        {state.constraint && <span className="status-chip effect-chip">Vincolo: {state.constraint.type} / {state.constraint.mode}</span>}
        {pending && <span className="status-chip pending-chip">Scegli l’effetto della carta</span>}
      </div>
      <div className="opponent-seats">
        {state.players.slice(1).map((player) => (
          <button className={`opponent panel ${state.players[state.turn]?.id === player.id ? 'active-opponent' : ''}`} key={player.id} onClick={() => setInspectedPlayerId(player.id)} type="button">
            <div className="opponent-heading"><strong>{player.avatar} {player.name}</strong><span className="opponent-count">{player.hand.length} carte</span></div>
            <div className="opponent-hand" aria-label={`${player.hand.length} carte in mano`}>
              {Array.from({ length: Math.min(player.hand.length, 5) }, (_, index) => <span className="mini-card-back" key={index} />)}
            </div>
            <div className="opponent-faceup" aria-label={`${player.faceUp.length} carte scoperte`}>
              {player.faceUp.map((card) => <CardFace card={card} className="opponent-card-face" key={card.uid} />)}
            </div>
            <span className="opponent-detail">{player.faceUp.length} scoperte · {player.faceDown.length} coperte</span>
          </button>
        ))}
      </div>
      <div
        aria-label={canPlay ? 'Gioca le carte selezionate sul tavolo' : 'Tavolo di gioco'}
        className={`table panel ${canPlay ? 'table-playable' : ''}`}
        onClick={() => { if (canPlay) playSelected({ jollyRank: needsJollyRank ? jollyRank : undefined }); }}
        role={canPlay ? 'button' : undefined}
        tabIndex={canPlay ? 0 : undefined}
        onKeyDown={(event) => {
          if (canPlay && (event.key === 'Enter' || event.key === ' ')) {
            event.preventDefault();
            playSelected({ jollyRank: needsJollyRank ? jollyRank : undefined });
          }
        }}
      >
        <div className="table-heading"><span className="eyebrow">Tavolo di gioco</span>{tableTop && effectLabel(tableTop) && <span className="table-effect">{effectLabel(tableTop)}</span>}</div>
        <Pile title="Mazzo" cards={state.drawPile} hidden />
        <Pile title="Tavolo" cards={state.table} />
        <Pile title="Sboboz" cards={state.sbobozPile} hidden />
        <Pile title="Iper-Sboboz" cards={state.superSbobozPile} hidden />
      </div>
      <div className={`panel player-area ${human.hand.length === 0 ? 'hand-empty' : ''}`}>
        <div className="zone-heading player-heading"><h2>Le tue carte</h2><span>{human.hand.length + human.faceUp.length + human.faceDown.length} totali</span></div>
        <div className="player-zones">
          {renderZone('faceup', human.faceUp)}
          {renderZone('facedown', human.faceDown)}
          {renderZone('hand', human.hand)}
        </div>
        <div className="actions">
          <button className="secondary-button" disabled={!isTurn || state.table.length === 0} onClick={pickupTable} type="button">Prendi il tavolo</button>
        </div>
      </div>
      {pending && (
        <div className="effect-overlay" role="presentation">
          <section aria-labelledby="effect-title" aria-modal="true" className="effect-modal" role="dialog">
            <p className="eyebrow">Effetto della carta</p>
            <h2 id="effect-title">{tableTop ? effectLabel(tableTop) : 'Scegli una possibilità'}</h2>
            <p className="muted">Devi completare questa scelta prima di poter continuare la partita.</p>
            {needsJollyRank && (
              <label className="choice">Jolly come
                <select value={jollyRank} onChange={(event) => setJollyRank(event.target.value as Rank)}>
                  {['A', 'K', 'Q', 'J', '10', '9', '8', '7', '6', '5', '4', '3'].map((rank) => <option key={rank} value={rank}>{rank}</option>)}
                </select>
              </label>
            )}
            {needsConstraint && (
              <label className="choice">Vincolo
                <select value={constraintMode} onChange={(event) => setConstraintMode(event.target.value as typeof constraintMode)}>
                  {pending.rank === '8'
                    ? <><option value="higher">superiore a 8</option><option value="lower">inferiore a 8</option></>
                    : <><option value="effect">solo effetti</option><option value="noeffect">senza effetti</option></>}
                </select>
              </label>
            )}
            {needsDiscard && (
              <label className="choice">Scarta nel Super-Sboboz
                <select value={discardCardId} onChange={(event) => setDiscardCardId(event.target.value)}>
                  <option value="">Scegli una carta</option>
                  {human.hand.filter((card) => !selectedIds.includes(card.uid)).map((card) => <option key={card.uid} value={card.uid}>{card.rank} {card.suit}</option>)}
                </select>
              </label>
            )}
            {needsSuperCard && (
              <label className="choice">Pesca dal Super-Sboboz
                <select value={superCardId} onChange={(event) => setSuperCardId(event.target.value)}>
                  <option value="">Ultima carta</option>
                  {state.superSbobozPile.map((card) => <option key={card.uid} value={card.uid}>{card.rank} {card.suit}</option>)}
                </select>
              </label>
            )}
            <button
              className="primary-button effect-confirm"
              disabled={(needsDiscard && !discardCardId) || (needsSuperCard && !superCardId)}
              onClick={() => resolveEffect({
                type: 'resolve-effect',
                mode: needsConstraint ? constraintMode : undefined,
                discardCardId: needsDiscard ? discardCardId : undefined,
                superCardId: needsSuperCard ? superCardId : undefined,
              })}
              type="button"
            >Conferma scelta</button>
          </section>
        </div>
      )}
      <div className="game-quick-actions" aria-label="Azioni rapide">
        <button className="quick-button" onClick={() => setUtilityOpen(true)} type="button">💬 Chat</button>
        <button className="quick-button" onClick={() => setUtilityOpen(true)} type="button">🙂 Reazioni</button>
      </div>
      {utilityOpen && (
        <aside className="utility-drawer" aria-label="Menu partita">
          <div className="drawer-heading"><h2>Menu partita</h2><button className="icon-button" aria-label="Chiudi menu partita" onClick={() => setUtilityOpen(false)} type="button">×</button></div>
          <div className="reaction-row" aria-label="Reazioni">
            {['👏', '🔥', '😮', '😂', '😡'].map((reaction) => <button className="reaction-button" key={reaction} onClick={() => setChatMessages((messages) => [...messages, `Tu: ${reaction}`])} type="button">{reaction}</button>)}
          </div>
          <form className="chat-form" onSubmit={(event) => { event.preventDefault(); if (chatText.trim()) { setChatMessages((messages) => [...messages, `Tu: ${chatText.trim()}`]); setChatText(''); } }}>
            <label htmlFor="game-chat">Chat</label>
            <div><input id="game-chat" value={chatText} onChange={(event) => setChatText(event.target.value)} placeholder="Scrivi un messaggio" /><button className="primary-button" type="submit">Invia</button></div>
          </form>
          <div className="chat-messages">{chatMessages.map((chatMessage, index) => <span key={`${chatMessage}-${index}`}>{chatMessage}</span>)}</div>
          <button className="drawer-action" onClick={() => setChatMessages((messages) => [...messages, 'Partita terminata dal giocatore.'])} type="button">Termina partita</button>
          <button className="drawer-action" onClick={() => setChatMessages((messages) => [...messages, 'Hai proposto una patta.'])} type="button">Proponi patta</button>
          <button className="drawer-action danger" onClick={onLeave} type="button">Lascia partita</button>
        </aside>
      )}
      {inspectedPlayerId && (() => {
        const player = state.players.find((entry) => entry.id === inspectedPlayerId);
        if (!player) return null;
        return (
          <aside className="player-inspector" aria-label={`Informazioni su ${player.name}`}>
            <div className="drawer-heading"><h2>{player.avatar} {player.name}</h2><button className="icon-button" aria-label="Chiudi informazioni giocatore" onClick={() => setInspectedPlayerId(null)} type="button">×</button></div>
            <p className="muted">{player.kind === 'bot' ? 'Ninja controllato dal bot' : 'Giocatore online'}</p>
            <div className="inspector-stats"><span><strong>{player.hand.length}</strong> in mano</span><span><strong>{player.faceUp.length}</strong> scoperte</span><span><strong>{player.faceDown.length}</strong> coperte</span></div>
            <div className="inspector-cards">{player.faceUp.map((card) => <CardFace card={card} key={card.uid} />)}</div>
          </aside>
        );
      })()}
    </section>
  );
}

export function App() {
  const state = useGameStore((store) => store.state);
  const message = useGameStore((store) => store.message);
  const startDemo = useGameStore((store) => store.startDemo);
  const reset = useGameStore((store) => store.reset);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [motionEnabled, setMotionEnabled] = useState(true);
  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch((error: unknown) => console.error('Impossibile uscire dalla modalità schermo intero.', error));
    } else {
      void document.documentElement.requestFullscreen().catch((error: unknown) => console.error('Impossibile attivare la modalità schermo intero.', error));
    }
  };
  useEffect(() => {
    if (!state || !soundEnabled) return;
    const AudioContextClass = window.AudioContext;
    if (!AudioContextClass) return;
    const context = new AudioContextClass();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.value = state.pendingEffect ? 520 : 280;
    gain.gain.setValueAtTime(0.035, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.12);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.12);
    return () => { void context.close(); };
  }, [state?.sequence, state?.pendingEffect, soundEnabled]);
  return (
    <main className={`app-shell ${motionEnabled ? '' : 'reduced-motion'}`}>
      <header className="app-header">
        {state
          ? <div className="game-brand">IlSboboz</div>
          : <div className="profile-chip"><span>🥷</span><strong>Ciomp</strong></div>}
        <div className="header-actions">
          {!state && <button className="icon-button fullscreen-button" aria-label="Schermo intero" onClick={toggleFullscreen} type="button">⛶</button>}
          <button className="icon-button" aria-label="Apri impostazioni" onClick={() => setSettingsOpen(true)} type="button">⚙</button>
          {state && <button className="link-button" onClick={reset} type="button">Esci</button>}
        </div>
      </header>
      {!state ? (
        <section className="home-screen">
          <div className="home-hero">
            <div className="fan" aria-hidden="true">
              <FanCard rank="3" suit="♦" red className="c1" />
              <FanCard rank="K" suit="♠" className="c2" />
              <FanCard rank="5" suit="♥" red className="c3" />
              <FanCard rank="J" suit="♣" className="c4" />
              <FanCard rank="2" suit="♠" className="c5" />
            </div>
            <h2 className="home-logo">IlSboboz</h2>
            <p className="tagline">Gioca le tue carte. Sbobozza gli avversari.</p>
            <div className="ninja-row" aria-hidden="true"><span>🥷</span><span>🔥</span><span>💧</span><span>⚡</span><span>🪨</span><span>❄️</span></div>
          </div>
          <div className="home-menu">
            <button className="menu-btn primary" onClick={startDemo} type="button"><b>Gioca contro i bot</b><small>Sfida i ninja</small></button>
            <button className="menu-btn" disabled type="button"><b>Crea una stanza</b><small>Networking in arrivo</small></button>
            <button className="menu-btn" disabled type="button"><b>Entra in una stanza</b><small>Tramite codice o QR Code</small></button>
            <div className="menu-row"><button className="menu-mini" disabled type="button">📊 Statistiche</button><button className="menu-mini" disabled type="button">📖 Regole</button><button className="menu-mini" onClick={() => setSettingsOpen(true)} type="button">⚙ Impostazioni</button></div>
            <footer className="home-foot"><span>Completamente Sboboz</span><audio controls preload="none" src="/completamente-sboboz.mp3" /></footer>
          </div>
        </section>
      ) : state.phase === 'setup' ? <Setup state={state} /> : <GameBoard onLeave={reset} state={state} />}
      {message && <p className="toast" role="status">{message}</p>}
      {settingsOpen && (
        <aside className="settings-drawer" aria-label="Impostazioni partita">
          <div className="drawer-heading"><h2>Impostazioni</h2><button className="icon-button" aria-label="Chiudi impostazioni" onClick={() => setSettingsOpen(false)} type="button">×</button></div>
          <label className="setting-row"><span>Suoni di gioco</span><input checked={soundEnabled} onChange={(event) => setSoundEnabled(event.target.checked)} type="checkbox" /></label>
          <label className="setting-row"><span>Animazioni</span><input checked={motionEnabled} onChange={(event) => setMotionEnabled(event.target.checked)} type="checkbox" /></label>
          <p className="muted">Le regole restano gestite dal game engine. Queste opzioni modificano solo la presentazione.</p>
        </aside>
      )}
    </main>
  );
}
