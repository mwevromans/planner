import { useEffect, useState } from 'react';
import { useSession } from './session';
import { ProfilePicker } from './screens/ProfilePicker';
import { WeekBoard } from './screens/WeekBoard';
import { DayZoom } from './screens/DayZoom';
import { Shop } from './screens/Shop';
import { ParentPanel } from './screens/ParentPanel';
import { Overview } from './screens/Overview';

function useHash(): string {
  const [hash, setHash] = useState(location.hash);
  useEffect(() => {
    const on = () => setHash(location.hash);
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return hash;
}

export function go(path: string) { location.hash = path; }

export function App() {
  const hash = useHash();
  const session = useSession();
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  const [route, a, b] = parts;

  if (route === 'overzicht') return <Overview />;
  if (!session) return <ProfilePicker />;

  const me = session.profile;
  const kidId = Number(a);
  const mayView = (id: number) => me.role === 'parent' || me.id === id;

  if (route === 'week' && kidId && mayView(kidId)) return <WeekBoard kidId={kidId} />;
  if (route === 'dag' && kidId && mayView(kidId) && b) return <DayZoom kidId={kidId} date={b} />;
  if (route === 'winkel' && kidId && mayView(kidId)) return <Shop kidId={kidId} />;
  if (route === 'ouders' && me.role === 'parent') return <ParentPanel />;

  go(me.role === 'parent' ? '/ouders' : `/week/${me.id}`);
  return null;
}
