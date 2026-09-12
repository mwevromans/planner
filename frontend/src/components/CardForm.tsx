import { useState } from 'react';
import { api, type CardInput } from '../api';
import { COLORS, ICON_GROUPS } from '../icons';
import { today } from '../dates';
import { useSession } from '../session';
import { DAY_PARTS, DAY_PART_LABEL, type Card, type DayPart } from '../types';

interface Props {
  profileId: number;
  initial?: Card;
  onSaved: (card: Card) => void;
  onCancel: () => void;
}

export function IconPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [group, setGroup] = useState(() => ICON_GROUPS.findIndex((g) => g.icons.includes(value)) || 0);
  const g = ICON_GROUPS[Math.max(0, group)];
  return (
    <div className="icon-picker">
      <div className="tabs">
        {ICON_GROUPS.map((x, i) => <button key={x.name} type="button" className={i === group ? 'on' : ''} onClick={() => setGroup(i)}>{x.name}</button>)}
      </div>
      <div className="grid">
        {g.icons.map((ic) => <button key={ic} type="button" className={ic === value ? 'on' : ''} onClick={() => onChange(ic)}>{ic}</button>)}
      </div>
    </div>
  );
}

export function ColorPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="color-picker">
      {COLORS.map((c) => <button key={c} type="button" className={c === value ? 'on' : ''} style={{ background: c }} onClick={() => onChange(c)} aria-label={c} />)}
    </div>
  );
}

export function CardForm({ profileId, initial, onSaved, onCancel }: Props) {
  const me = useSession()!.profile;
  const isParent = me.role === 'parent';
  const [title, setTitle] = useState(initial?.title ?? '');
  const [icon, setIcon] = useState(initial?.icon ?? '📚');
  const [color, setColor] = useState(initial?.color ?? COLORS[0]);
  const [deadline, setDeadline] = useState(initial?.deadline ?? '');
  const [time, setTime] = useState(initial?.time ?? '');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [points, setPoints] = useState(initial?.points ?? 0);
  const [onBoard, setOnBoard] = useState(!!initial?.planned_date);
  const [plannedDate, setPlannedDate] = useState(initial?.planned_date ?? '');
  const [dayPart, setDayPart] = useState<DayPart>(initial?.day_part ?? 'namiddag');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return setError('Geef de kaart een naam');
    if (onBoard && !plannedDate) return setError('Kies op welke dag de kaart komt');
    setBusy(true); setError('');
    const body: Partial<CardInput> = {
      title: title.trim(), icon, color, deadline: deadline || null, time: time || null, notes,
      plannedDate: onBoard ? plannedDate : null, dayPart: onBoard ? dayPart : null,
      ...(isParent ? { points } : {}),
    };
    try {
      const saved = initial
        ? await api.updateCard(initial.id, body)
        : await api.createCard({ ...(body as CardInput), profileId });
      onSaved(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Er ging iets mis');
    } finally { setBusy(false); }
  }

  return (
    <form className="form" onSubmit={submit}>
      <div className="panel-head">
        <span className="icon" style={{ background: color }}>{icon}</span>
        <h2>{initial ? 'Kaart aanpassen' : 'Nieuwe kaart'}</h2>
      </div>
      <label>Wat ga je doen?
        <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Bijv. huiswerk rekenen" autoFocus maxLength={80} />
      </label>
      <label>Icoontje</label>
      <IconPicker value={icon} onChange={setIcon} />
      <label>Kleur</label>
      <ColorPicker value={color} onChange={setColor} />
      <div className="row">
        <label>Deadline: moet af vóór (optioneel)
          <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
        </label>
        <label>Tijd (optioneel)
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </label>
      </div>
      <label>Waar komt de kaart?</label>
      <div className="segmented">
        <button type="button" className={!onBoard ? 'on' : ''} onClick={() => setOnBoard(false)}>🧲 Op de stapel (zelf plannen)</button>
        <button type="button" className={onBoard ? 'on' : ''} onClick={() => { setOnBoard(true); if (!plannedDate) setPlannedDate(deadline || today()); }}>📅 Meteen op een dag</button>
      </div>
      {onBoard && (
        <>
          <div className="row">
            <label>Welke dag
              <input type="date" value={plannedDate} onChange={(e) => setPlannedDate(e.target.value)} />
            </label>
          </div>
          <div className="segmented">
            {DAY_PARTS.map((p) => (
              <button type="button" key={p} className={dayPart === p ? 'on' : ''} onClick={() => setDayPart(p)}>{DAY_PART_LABEL[p].icon} {DAY_PART_LABEL[p].label}</button>
            ))}
          </div>
        </>
      )}
      {isParent && (
        <label>Punten (0 = geen)
          <input type="number" min={0} max={1000} value={points} onChange={(e) => setPoints(Number(e.target.value))} />
        </label>
      )}
      <label>Notitie
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Bijv. blz. 12 t/m 14" maxLength={500} />
      </label>
      {error && <div className="error">{error}</div>}
      <div className="actions" style={{ display: 'flex', gap: 10 }}>
        <button type="button" className="btn" onClick={onCancel} style={{ flex: 1 }}>Annuleren</button>
        <button type="submit" className="btn btn-primary" disabled={busy} style={{ flex: 2 }}>{initial ? 'Opslaan' : 'Toevoegen'}</button>
      </div>
    </form>
  );
}
