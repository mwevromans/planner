import { useState, type ReactNode } from 'react';
import { MePanel } from './MePanel';
import { go } from '../App';
import { setSession, useSession } from '../session';
import type { Profile } from '../types';
import { Avatar } from './Avatar';

interface Props {
  profile: Profile;
  balance?: number;
  streak?: number;
  children?: ReactNode;
  /** Wordt aangeroepen nadat de gebruiker het eigen profiel heeft aangepast. */
  onProfileChanged?: (p: Profile) => void;
}

export function Header({ profile, balance, streak, children, onProfileChanged }: Props) {
  const me = useSession()!.profile;
  const viewingOther = me.id !== profile.id;
  const [editing, setEditing] = useState(false);
  return (
    <div className="header">
      <button className="who" onClick={() => !viewingOther && setEditing(true)} title={viewingOther ? undefined : 'Kies je plaatje en kleur'} style={{ cursor: viewingOther ? 'default' : 'pointer' }}>
        <Avatar profile={profile} />
        <span>{profile.name}</span>
      </button>
      {editing && <MePanel profile={profile} onClose={() => setEditing(false)} onSaved={(p) => { setEditing(false); onProfileChanged?.(p); }} />}
      {balance !== undefined && profile.role === 'kid' && (
        <button className="chip" onClick={() => go(`/winkel/${profile.id}`)} title="Winkeltje">⭐ {balance}</button>
      )}
      {streak !== undefined && streak > 0 && profile.role === 'kid' && <span className="chip" title="Dagen op rij alles klaar">🔥 {streak}</span>}
      <span className="spacer" />
      {children}
      {viewingOther
        ? <button className="icon-btn" title="Terug naar ouderpaneel" onClick={() => go('/ouders')}>🏠</button>
        : <button className="icon-btn" title="Wissel van profiel" onClick={() => { setSession(null); go('/'); }}>👋</button>}
    </div>
  );
}
