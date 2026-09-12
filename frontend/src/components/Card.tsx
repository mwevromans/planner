import { useDraggable } from '@dnd-kit/core';
import { deadlineLabel } from '../dates';
import type { Card } from '../types';

export function cardStatus(card: Card): 'open' | 'wait' | 'done' {
  if (!card.done_at) return 'open';
  if (card.points > 0 && !card.approved_at) return 'wait';
  return 'done';
}

interface Props {
  card: Card;
  onTap?: (card: Card) => void;
  draggable?: boolean;
  big?: boolean;
  showDeadline?: boolean;
}

export function CardView({ card, onTap, draggable = true, big = false, showDeadline = true }: Props) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `card:${card.id}`, data: { card }, disabled: !draggable });
  return (
    <div ref={setNodeRef} {...listeners} {...attributes} role="button" tabIndex={0}
      className={`card ${cardStatus(card) !== 'open' ? 'done' : ''} ${isDragging ? 'dragging' : ''} ${big ? 'big' : ''}`}
      style={{ background: card.color }}
      onClick={() => onTap?.(card)}
      onKeyDown={(e) => { if (e.key === 'Enter') onTap?.(card); }}
    >
      <CardInner card={card} showDeadline={showDeadline} />
    </div>
  );
}

export function CardInner({ card, showDeadline = true }: { card: Card; showDeadline?: boolean }) {
  const status = cardStatus(card);
  const dl = card.deadline && status === 'open' && showDeadline ? deadlineLabel(card.deadline) : null;
  return (
    <>
      <span className="icon">{card.icon}</span>
      <span className="body">
        <span className="title">{card.title}</span>
        <span className="meta">
          {card.time && <span>🕒 {card.time}</span>}
          {dl && <span className={dl.late ? 'late' : ''}>{dl.late ? '⚠️ ' : '📅 '}{dl.text}</span>}
          {card.points > 0 && <span>⭐ {card.points}</span>}
        </span>
      </span>
      {status === 'done' && <span className="badge done">✓</span>}
      {status === 'wait' && <span className="badge wait">⏳</span>}
    </>
  );
}

/** Statische weergave voor de sleep-overlay. */
export function CardGhost({ card }: { card: Card }) {
  return (
    <div className="card card-ghost" style={{ background: card.color, width: 170 }}>
      <CardInner card={card} />
    </div>
  );
}
