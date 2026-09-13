import { useEffect, useState } from 'react';
import { api, type SyncStatus } from '../../api';
import { Avatar } from '../../components/Avatar';
import { ColorPicker } from '../../components/CardForm';
import { AVATARS } from '../../icons';
import type { Profile } from '../../types';

export function Family({ profiles, onChanged }: { profiles: Profile[]; onChanged: () => void }) {
  const [edit, setEdit] = useState<Profile | 'new' | null>(null);
  return (
    <div className="section">
      <SyncBox />
      <div className="box" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <h2>👨‍👩‍👧‍👦 Gezin</h2>
        {profiles.map((p) => (
          <div key={p.id} className="list-item" style={{ boxShadow: 'none', background: '#fffdf5' }}>
            <Avatar profile={p} size={40} />
            <span className="body">
              <div className="title">{p.name}</div>
              <div className="sub">{p.role === 'parent' ? 'Ouder' : p.role === 'family' ? 'Het hele gezin' : 'Kind'}{p.role === 'kid' ? ` · weergave ${p.density === 'simple' ? 'simpel' : 'normaal'}` : ''}{p.hasPin ? ' · 🔒 pincode' : ''}</div>
            </span>
            <button className="btn btn-small" onClick={() => setEdit(p)}>✏️</button>
          </div>
        ))}
        <button className="btn btn-primary" onClick={() => setEdit('new')}>＋ Gezinslid</button>
      </div>
      {edit && (
        <div className="overlay" onClick={() => setEdit(null)}>
          <div className="panel" onClick={(e) => e.stopPropagation()}>
            <ProfileForm initial={edit === 'new' ? undefined : edit} onDone={() => { setEdit(null); onChanged(); }} />
          </div>
        </div>
      )}
    </div>
  );
}

function ProfileForm({ initial, onDone }: { initial?: Profile; onDone: () => void }) {
  const [name, setName] = useState(initial?.name ?? '');
  const [avatar, setAvatar] = useState(initial?.avatar ?? AVATARS[2]);
  const [color, setColor] = useState(initial?.color ?? '#bae6fd');
  const [role, setRole] = useState<'kid' | 'parent' | 'family'>(initial?.role ?? 'kid');
  const [density, setDensity] = useState<'simple' | 'normal'>(initial?.density ?? 'normal');
  const [pin, setPin] = useState('');
  const [clearPin, setClearPin] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setError('Geef een naam');
    if (pin && !/^\d{4,6}$/.test(pin)) return setError('Pincode is 4 tot 6 cijfers');
    const body: Partial<Profile> & { pin?: string | null } = { name: name.trim(), avatar, color, density };
    if (role !== 'family') { body.role = role; if (pin) body.pin = pin; else if (clearPin) body.pin = null; }
    try {
      if (initial) await api.updateProfile(initial.id, body); else await api.createProfile(body);
      onDone();
    } catch (err) { setError(err instanceof Error ? err.message : 'Er ging iets mis'); }
  }

  return (
    <form className="form" onSubmit={submit}>
      <div className="panel-head"><Avatar profile={{ avatar, color }} size={64} /><h2>{initial ? initial.name : 'Nieuw gezinslid'}</h2></div>
      <label>Naam<input type="text" value={name} onChange={(e) => setName(e.target.value)} autoFocus /></label>
      <label>Avatar</label>
      <div className="icon-picker"><div className="grid">{AVATARS.map((a) => <button type="button" key={a} className={a === avatar ? 'on' : ''} onClick={() => setAvatar(a)}>{a}</button>)}</div></div>
      <label>Kleur</label>
      <ColorPicker value={color} onChange={setColor} />
      {initial?.role !== 'family' && <><label>Rol</label>
      <div className="segmented">
        <button type="button" className={role === 'kid' ? 'on' : ''} onClick={() => setRole('kid')}>Kind</button>
        <button type="button" className={role === 'parent' ? 'on' : ''} onClick={() => setRole('parent')}>Ouder</button>
      </div></>}
      {role === 'kid' && (
        <>
          <label>Weergave</label>
          <div className="segmented">
            <button type="button" className={density === 'normal' ? 'on' : ''} onClick={() => setDensity('normal')}>Normaal</button>
            <button type="button" className={density === 'simple' ? 'on' : ''} onClick={() => setDensity('simple')}>Simpel (grote icoontjes)</button>
          </div>
        </>
      )}
      {role !== 'family' && <label>{initial?.hasPin ? 'Nieuwe pincode (leeg = laten staan)' : 'Pincode (optioneel voor kind, verplicht voor ouder)'}
        <input type="text" inputMode="numeric" pattern="\d*" value={pin} onChange={(e) => setPin(e.target.value)} maxLength={6} />
      </label>}
      {initial?.hasPin && role === 'kid' && (
        <label style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}><input type="checkbox" checked={clearPin} onChange={(e) => setClearPin(e.target.checked)} /> Pincode verwijderen</label>
      )}
      {error && <div className="error">{error}</div>}
      <div style={{ display: 'flex', gap: 10 }}>
        {initial && initial.role !== 'family' && <button type="button" className="btn btn-bad" onClick={async () => { if (confirm(`${initial.name} verwijderen? Alle kaarten gaan mee.`)) { try { await api.deleteProfile(initial.id); onDone(); } catch (err) { setError(err instanceof Error ? err.message : 'Lukt niet'); } } }}>🗑️</button>}
        <button type="button" className="btn" onClick={onDone} style={{ flex: 1 }}>Annuleren</button>
        <button type="submit" className="btn btn-primary" style={{ flex: 2 }}>Opslaan</button>
      </div>
    </form>
  );
}

function SyncBox() {
  const [st, setSt] = useState<SyncStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const load = () => api.syncStatus().then(setSt).catch(() => undefined);
  useEffect(() => { load(); }, []);
  if (!st) return null;
  const when = st.lastSync ? new Date(st.lastSync).toLocaleString('nl-NL', { dateStyle: 'short', timeStyle: 'short' }) : 'nog niet';
  return (
    <div className="box" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <h2> Apple-agenda</h2>
      {!st.configured && (
        <p className="muted" style={{ margin: 0, fontWeight: 600 }}>
          Niet gekoppeld. Zet CALDAV_USER, CALDAV_PASSWORD en CALDAV_CALENDAR in het .env-bestand naast docker-compose.yml en herstart de container. Zie README.
        </p>
      )}
      {st.configured && (
        <>
          <p className="muted" style={{ margin: 0, fontWeight: 600 }}>
            Agenda "{st.calendar}" · {st.count} afspraakdagen · laatste sync {when}
            {st.running ? ' · bezig…' : ''}
          </p>
          {st.lastError && <div className="error">Laatste fout: {st.lastError}</div>}
          <p className="muted" style={{ margin: 0, fontWeight: 600 }}>Tip: zet (s) of (l) achter een titel in Apple om de afspraak op het bord van Sepp of Liz te zetten. Zonder tag komt hij op Gezin.</p>
          <button className="btn btn-small" disabled={busy} onClick={async () => { setBusy(true); try { setSt(await api.syncNow()); } finally { setBusy(false); } }}>🔄 Nu synchroniseren</button>
        </>
      )}
    </div>
  );
}
