import confetti from 'canvas-confetti';
import { useState } from 'react';
import { api } from '../api';
import { deadlineLabel, longDate } from '../dates';
import { useSession } from '../session';
import { DAY_PART_LABEL, type Card } from '../types';
import { cardStatus } from './Card';
import { CardForm } from './CardForm';

interface Props {
  card: Card;
  onClose: () => void;
  onChanged: () => void;
  /** Alleen kijken (bijv. familie-evenement op het bord van een kind). */
  readOnly?: boolean;
}

export function celebrate() {
  confetti({ particleCount: 140, spread: 80, origin: { y: 0.7 }, scalar: 1.1 });
}

export function CardPanel({ card, onClose, onChanged, readOnly = false }: Props) {
  const me = useSession()!.profile;
  const isParent = me.role === 'parent';
  const canEdit = isParent || card.created_by === me.id;
  const status = cardStatus(card);
  const [editing, setEditing] = useState(false);
  const [copying, setCopying] = useState(false);
  const [error, setError] = useState('');

  async function run(fn: () => Promise<unknown>, after?: () => void) {
    try { await fn(); after?.(); onChanged(); } catch (e) { setError(e instanceof Error ? e.message : 'Er ging iets mis'); }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="panel" onClick={(e) => e.stopPropagation()}>
        {editing ? (
          <CardForm profileId={card.profile_id} initial={card} onSaved={() => { onChanged(); onClose(); }} onCancel={() => setEditing(false)} />
        ) : copying ? (
          <CardForm profileId={card.profile_id} template={card} onSaved={() => { onChanged(); onClose(); }} onCancel={() => setCopying(false)} />
        ) : (
          <>
            <div className="panel-head">
              <span className="icon" style={{ background: card.color }}>{card.icon}</span>
              <div>
                <h2>{card.title}</h2>
                {card.planned_date && card.day_part && <div className="muted">{longDate(card.planned_date)} · {DAY_PART_LABEL[card.day_part].label}{card.time ? ` · ${card.time}` : ''}</div>}
                {!card.planned_date && <div className="muted">Ligt nog op de stapel</div>}
              </div>
            </div>
            {status === 'done' && <div className="status good">✓ Klaar{card.points > 0 ? ` · ${card.points} punten verdiend` : ''}</div>}
            {status === 'wait' && <div className="status wait">⏳ Klaar! Papa of mama kijkt nog even na voor de {card.points} punten.</div>}
            <div className="facts">
              {card.deadline && <span className="chip" style={{ color: deadlineLabel(card.deadline).late && status === 'open' ? 'var(--bad)' : undefined }}>📅 Moet af vóór {longDate(card.deadline)}</span>}
              {card.points > 0 && <span className="chip">⭐ {card.points} punten</span>}
              {card.recurrence_id && <span className="chip">🔁 Elke week</span>}
            </div>
            {card.notes && <p style={{ whiteSpace: 'pre-wrap', fontWeight: 600 }}>{card.notes}</p>}
            {error && <div className="error" style={{ marginBottom: 10 }}>{error}</div>}
            <div className="actions">
              {readOnly && <div className="status wait" style={{ flex: '1 1 100%' }}>🏠 Dit is iets van het hele gezin. Papa of mama beheert het.</div>}
              {!readOnly && status === 'open' && <button className="btn btn-good" onClick={() => run(() => api.done(card.id), celebrate)}>🎉 Klaar!</button>}
              {!readOnly && status === 'wait' && <button className="btn" onClick={() => run(() => api.undone(card.id))}>Toch niet klaar</button>}
              {!readOnly && status === 'done' && isParent && <button className="btn" onClick={() => run(() => api.undone(card.id))}>Ongedaan maken</button>}
              {!readOnly && status === 'done' && !isParent && card.points === 0 && <button className="btn" onClick={() => run(() => api.undone(card.id))}>Toch niet klaar</button>}
              {!readOnly && status === 'wait' && isParent && <button className="btn btn-good" onClick={() => run(() => api.approveCard(card.id))}>✓ Goedkeuren</button>}
              {!readOnly && card.planned_date && <button className="btn" onClick={() => run(() => api.moveCard(card.id, null, null))}>🧲 Terug op de stapel</button>}
              {!readOnly && canEdit && <button className="btn" onClick={() => setEditing(true)}>✏️ Aanpassen</button>}
              {!readOnly && <button className="btn" onClick={() => setCopying(true)}>📋 Kopie</button>}
              {!readOnly && canEdit && <button className="btn btn-bad" onClick={() => { if (confirm(`"${card.title}" weggooien?`)) run(() => api.deleteCard(card.id), onClose); }}>🗑️ Weg</button>}
              <button className="btn btn-ghost" onClick={onClose} style={{ flex: '1 1 100%' }}>Sluiten</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
