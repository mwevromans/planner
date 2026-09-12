import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api';
import { IconPicker } from '../../components/CardForm';
import type { Reward } from '../../types';

export function Rewards() {
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [edit, setEdit] = useState<Reward | 'new' | null>(null);
  const load = useCallback(() => api.rewards().then(setRewards), []);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="section">
      <div className="box" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <h2>🛍️ Beloningen</h2>
        <p className="muted" style={{ margin: 0, fontWeight: 600 }}>De kinderen zien alleen actieve beloningen. Inwisselen keur jij goed bij "Keuren".</p>
        {rewards.map((r) => (
          <div key={r.id} className="list-item" style={{ boxShadow: 'none', background: '#fffdf5' }}>
            <span className="icon">{r.icon}</span>
            <span className="body"><div className="title">{r.title}</div><div className="sub">⭐ {r.cost}</div></span>
            {!r.active && <span className="pill off">uit</span>}
            <button className="btn btn-small" onClick={() => setEdit(r)}>✏️</button>
          </div>
        ))}
        <button className="btn btn-primary" onClick={() => setEdit('new')}>＋ Beloning</button>
      </div>
      {edit && (
        <div className="overlay" onClick={() => setEdit(null)}>
          <div className="panel" onClick={(e) => e.stopPropagation()}>
            <RewardForm initial={edit === 'new' ? undefined : edit} onDone={() => { setEdit(null); load(); }} />
          </div>
        </div>
      )}
    </div>
  );
}

function RewardForm({ initial, onDone }: { initial?: Reward; onDone: () => void }) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [icon, setIcon] = useState(initial?.icon ?? '🎁');
  const [cost, setCost] = useState(initial?.cost ?? 20);
  const [active, setActive] = useState(initial ? !!initial.active : true);
  const [error, setError] = useState('');
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return setError('Geef het een naam');
    try {
      if (initial) await api.updateReward(initial.id, { title: title.trim(), icon, cost, active }); else await api.createReward({ title: title.trim(), icon, cost, active });
      onDone();
    } catch (err) { setError(err instanceof Error ? err.message : 'Er ging iets mis'); }
  }
  return (
    <form className="form" onSubmit={submit}>
      <div className="panel-head"><span className="icon" style={{ background: '#fde68a' }}>{icon}</span><h2>{initial ? 'Beloning aanpassen' : 'Nieuwe beloning'}</h2></div>
      <label>Wat<input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Bijv. samen pannenkoeken bakken" autoFocus /></label>
      <label>Icoontje</label><IconPicker value={icon} onChange={setIcon} />
      <label>Prijs in punten<input type="number" min={1} value={cost} onChange={(e) => setCost(Number(e.target.value))} /></label>
      <label style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Actief</label>
      {error && <div className="error">{error}</div>}
      <div style={{ display: 'flex', gap: 10 }}>
        {initial && <button type="button" className="btn btn-bad" onClick={async () => { if (confirm('Beloning verwijderen?')) { await api.deleteReward(initial.id); onDone(); } }}>🗑️</button>}
        <button type="button" className="btn" onClick={onDone} style={{ flex: 1 }}>Annuleren</button>
        <button type="submit" className="btn btn-primary" style={{ flex: 2 }}>Opslaan</button>
      </div>
    </form>
  );
}
