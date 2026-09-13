import type { ReactNode } from 'react';
import { go } from '../App';
import { setSession, useSession } from '../session';
import type { Profile } from '../types';
import { Avatar } from './Avatar';

interface Props {
  profile: Profile;
  balance?: number;
  streak?: number;
  children?: ReactNode;
}

export function Header({ profile, balance, streak, children }: Props) {
  const me = useSession()!.profile;
  const viewingOther = me.id !== profile.id;
  return (
    <div className="header">
      <div className="who">
        <Avatar profile={profile} />
        <span>{profile.name}</span>
      </div>
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
