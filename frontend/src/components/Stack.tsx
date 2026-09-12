import { useDroppable } from '@dnd-kit/core';
import type { Card } from '../types';
import { CardView } from './Card';

export function Stack({ cards, onTap, onAdd }: { cards: Card[]; onTap: (c: Card) => void; onAdd: () => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: 'stack' });
  return (
    <div ref={setNodeRef} className={`stack ${isOver ? 'over' : ''}`}>
      <div className="stack-head">
        <span>🧲 Nog te plannen</span>
        <span className="count">{cards.length}</span>
        <span className="spacer" style={{ flex: 1 }} />
        <button className="btn btn-primary btn-small" onClick={onAdd}>＋ Nieuw</button>
      </div>
      <div className="items">
        {cards.length === 0 && <div className="empty">Alles staat op het bord. Lekker bezig! 🎉</div>}
        {cards.map((c) => <CardView key={c.id} card={c} onTap={onTap} />)}
      </div>
    </div>
  );
}
