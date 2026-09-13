import { useState } from 'react';
import { api } from '../api';
import { AVATARS, AVATAR_COLORS } from '../icons';
import { getSession, setSession } from '../session';
import type { Profile } from '../types';
import { Avatar } from './Avatar';

/** Kind (of ouder) kiest eigen avatar en kleur. */
export function MePanel({ profile, onClose, onSaved }: { profile: Profile; onClose: () => void; onSaved: (p: Profile) => void }) {
  const [avatar, setAvatar] = useState(profile.avatar);
  const [color, setColor] = useState(profile.color);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true); setError('');
    try {
      const updated = await api.updateProfile(profile.id, { avatar, color });
      const s = getSession();
      if (s && s.profile.id === updated.id) setSession({ ...s, profile: updated });
      onSaved(updated);
    } catch (e) { setError(e instanceof Error ? e.message : 'Er ging iets mis'); }
    finally { setBusy(false); }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="panel" onClick={(e) => e.stopPropagation()}>
        <div className="panel-head">
          <Avatar profile={{ avatar, color }} size={72} />
          <div>
            <h2>Dit ben ik: {profile.name}</h2>
            <div className="muted">Kies je eigen plaatje en kleur</div>
          </div>
        </div>
        <div className="form">
          <label>Plaatje</label>
          <div className="icon-picker"><div className="grid">
            {AVATARS.map((a) => <button type="button" key={a} className={a === avatar ? 'on' : ''} onClick={() => setAvatar(a)}>{a}</button>)}
          </div></div>
          <label>Kleur</label>
          <div className="color-picker" style={{ flexWrap: 'wrap' }}>
            {AVATAR_COLORS.map((c) => <button type="button" key={c} className={c === color ? 'on' : ''} style={{ background: c }} onClick={() => setColor(c)} aria-label={c} />)}
          </div>
          {error && <div className="error">{error}</div>}
          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" className="btn" onClick={onClose} style={{ flex: 1 }}>Annuleren</button>
            <button type="button" className="btn btn-primary" disabled={busy} onClick={save} style={{ flex: 2 }}>Dit ben ik! 🎉</button>
          </div>
        </div>
      </div>
    </div>
  );
}
