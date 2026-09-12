import { useEffect, useState } from 'react';
import { api, ApiError } from '../api';
import { setSession } from '../session';
import type { Profile } from '../types';
import { PinPad } from '../components/PinPad';
import { Avatar } from '../components/Avatar';
import { go } from '../App';

export function ProfilePicker() {
  const [profiles, setProfiles] = useState<Profile[] | null>(null);
  const [picked, setPicked] = useState<Profile | null>(null);
  const [error, setError] = useState('');

  useEffect(() => { api.profiles().then(setProfiles).catch(() => setError('Kan de planner niet bereiken')); }, []);

  async function login(p: Profile, pin?: string) {
    try {
      const s = await api.login(p.id, pin);
      setSession(s);
      go(s.profile.role === 'parent' ? '/ouders' : `/week/${s.profile.id}`);
    } catch (e) {
      setError(e instanceof ApiError && e.status === 401 ? 'Pincode klopt niet' : 'Er ging iets mis');
    }
  }

  if (picked) {
    return (
      <div className="center">
        <Avatar profile={picked} size={96} />
        <h1>Hoi {picked.name}!</h1>
        <p className="muted">Wat is je pincode?</p>
        <PinPad onSubmit={(pin) => login(picked, pin)} error={error} />
        <button className="btn btn-ghost" onClick={() => { setPicked(null); setError(''); }}>← Iemand anders</button>
      </div>
    );
  }

  return (
    <div className="center">
      <h1 style={{ fontSize: 34 }}>Wie ben jij? 👋</h1>
      {error && <div className="error">{error}</div>}
      {!profiles && !error && <div className="muted">Laden…</div>}
      <div className="profiles">
        {profiles?.map((p) => (
          <button key={p.id} className="profile-tile" onClick={() => (p.hasPin ? setPicked(p) : login(p))}>
            <Avatar profile={p} size={84} />
            <span>{p.name}</span>
          </button>
        ))}
      </div>
      <a className="btn btn-ghost muted" href="#/overzicht">📺 Gezinsoverzicht</a>
    </div>
  );
}
