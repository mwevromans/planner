import { useCallback, useEffect, useState } from 'react';
import { api, type RecurrenceInput } from '../../api';
import { go } from '../../App';
import { Avatar } from '../../components/Avatar';
import { CardForm, ColorPicker, IconPicker } from '../../components/CardForm';
import { TimePicker } from '../../components/TimePicker';
import { COLORS } from '../../icons';
import { DOW } from '../../dates';
import { DAY_PARTS, DAY_PART_LABEL, type DayPart, type Profile, type Recurrence } from '../../types';

export function Cards({ kids }: { kids: Profile[] }) {
  const [kidId, setKidId] = useState(kids.find((k) => k.role === 'kid')?.id ?? kids[0]?.id);
  const [adding, setAdding] = useState(false);
  const [recs, setRecs] = useState<Recurrence[]>([]);
  const [editRec, setEditRec] = useState<Recurrence | 'new' | null>(null);
  const [msg, setMsg] = useState('');

  const load = useCallback(() => { if (kidId) api.recurrences(kidId).then(setRecs); }, [kidId]);
  useEffect(() => { load(); }, [load]);

  if (!kidId) return <div className="section muted">Nog geen gezinsleden. Voeg ze toe bij Gezin.</div>;
  const kid = kids.find((k) => k.id === kidId) ?? kids[0];

  return (
    <div className="section">
      <div className="kid-tabs">
        {kids.map((k) => <button key={k.id} className={k.id === kidId ? 'on' : ''} onClick={() => setKidId(k.id)}><Avatar profile={k} size={28} />{k.name}</button>)}
      </div>
      <div className="two-col">
        <div className="box" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <h2>Kaarten voor {kid.name}</h2>
          <p className="muted" style={{ margin: 0, fontWeight: 600 }}>
            {kid.role === 'kid' && <>Nieuwe kaarten komen op de stapel; {kid.name} sleept ze zelf naar een dag. Je kunt ook meteen een dag kiezen.</>}
            {kid.role === 'family' && <>Familie-evenementen: verjaardagen, vakantie, uitjes. Ze staan op ieders bord, alleen te bekijken.</>}
            {kid.role === 'parent' && <>Eigen agenda van {kid.name}, zichtbaar op het gezinsbord.</>}
          </p>
          <button className="btn btn-primary" onClick={() => setAdding(true)}>＋ Nieuwe kaart</button>
          <button className="btn" onClick={() => go(`/week/${kid.id}`)}>📅 Open weekbord van {kid.name}</button>
          <button className="btn" onClick={() => go('/gezin')}>🏠 Gezinsweek (iedereen)</button>
          {msg && <div className="status good">{msg}</div>}
        </div>
        <div className="box" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <h2>🔁 Elke week</h2>
          {recs.length === 0 && <div className="muted" style={{ fontWeight: 600 }}>Nog niets. Denk aan training, zwemles, muziekles.</div>}
          {recs.map((r) => (
            <div key={r.id} className="list-item" style={{ boxShadow: 'none', background: r.color }}>
              <span className="icon">{r.icon}</span>
              <span className="body">
                <div className="title">{r.title}{r.points > 0 ? ` · ⭐ ${r.points}` : ''}</div>
                <div className="sub" style={{ color: 'rgba(0,0,0,.6)' }}>
                  {(JSON.parse(r.weekdays) as number[]).map((d) => DOW[d - 1]).join(' ')} · {DAY_PART_LABEL[r.day_part].label}{r.time ? ` ${r.time}` : ''}
                </div>
              </span>
              {!r.active && <span className="pill off">uit</span>}
              <button className="btn btn-small" onClick={() => setEditRec(r)}>✏️</button>
            </div>
          ))}
          <button className="btn" onClick={() => setEditRec('new')}>＋ Herhaling</button>
        </div>
      </div>

      {adding && (
        <div className="overlay" onClick={() => setAdding(false)}>
          <div className="panel" onClick={(e) => e.stopPropagation()}>
            <CardForm profileId={kid.id} onSaved={(c) => { setAdding(false); setMsg(`"${c.title}" staat ${c.planned_date ? 'op het bord' : 'op de stapel'} van ${kid.name}.`); }} onCancel={() => setAdding(false)} />
          </div>
        </div>
      )}
      {editRec && (
        <div className="overlay" onClick={() => setEditRec(null)}>
          <div className="panel" onClick={(e) => e.stopPropagation()}>
            <RecurrenceForm profileId={kid.id} initial={editRec === 'new' ? undefined : editRec} onDone={() => { setEditRec(null); load(); }} />
          </div>
        </div>
      )}
    </div>
  );
}

function RecurrenceForm({ profileId, initial, onDone }: { profileId: number; initial?: Recurrence; onDone: () => void }) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [icon, setIcon] = useState(initial?.icon ?? '⚽');
  const [color, setColor] = useState(initial?.color ?? COLORS[1]);
  const [weekdays, setWeekdays] = useState<number[]>(initial ? JSON.parse(initial.weekdays) : []);
  const [dayPart, setDayPart] = useState<DayPart>(initial?.day_part ?? 'namiddag');
  const [time, setTime] = useState(initial?.time ?? '');
  const [points, setPoints] = useState(initial?.points ?? 0);
  const [active, setActive] = useState(initial ? !!initial.active : true);
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return setError('Geef het een naam');
    if (weekdays.length === 0) return setError('Kies minstens één dag');
    const body: RecurrenceInput = { profileId, title: title.trim(), icon, color, weekdays, dayPart, time: time || null, points, active };
    try {
      if (initial) await api.updateRecurrence(initial.id, body); else await api.createRecurrence(body);
      onDone();
    } catch (err) { setError(err instanceof Error ? err.message : 'Er ging iets mis'); }
  }
  const toggle = (d: number) => setWeekdays((w) => (w.includes(d) ? w.filter((x) => x !== d) : [...w, d].sort()));

  return (
    <form className="form" onSubmit={submit}>
      <div className="panel-head"><span className="icon" style={{ background: color }}>{icon}</span><h2>{initial ? 'Herhaling aanpassen' : 'Nieuwe herhaling'}</h2></div>
      <label>Wat<input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Bijv. voetbaltraining" autoFocus /></label>
      <label>Icoontje</label><IconPicker value={icon} onChange={setIcon} />
      <label>Kleur</label><ColorPicker value={color} onChange={setColor} />
      <label>Welke dagen</label>
      <div className="weekday-picker">{DOW.map((d, i) => <button type="button" key={d} className={weekdays.includes(i + 1) ? 'on' : ''} onClick={() => toggle(i + 1)}>{d}</button>)}</div>
      <label>Dagdeel</label>
      <div className="segmented">{DAY_PARTS.map((p) => <button type="button" key={p} className={dayPart === p ? 'on' : ''} onClick={() => setDayPart(p)}>{DAY_PART_LABEL[p].icon} {DAY_PART_LABEL[p].label}</button>)}</div>
      <label>Hoe laat (optioneel)</label>
      <TimePicker value={time} onChange={setTime} />
      <label>Punten<input type="number" min={0} value={points} onChange={(e) => setPoints(Number(e.target.value))} /></label>
      <label style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Actief</label>
      {error && <div className="error">{error}</div>}
      <div style={{ display: 'flex', gap: 10 }}>
        {initial && <button type="button" className="btn btn-bad" onClick={async () => { if (confirm('Herhaling verwijderen? Toekomstige, nog niet afgevinkte kaarten verdwijnen ook.')) { await api.deleteRecurrence(initial.id); onDone(); } }}>🗑️</button>}
        <button type="button" className="btn" onClick={onDone} style={{ flex: 1 }}>Annuleren</button>
        <button type="submit" className="btn btn-primary" style={{ flex: 2 }}>Opslaan</button>
      </div>
    </form>
  );
}
