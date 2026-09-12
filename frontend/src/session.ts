import { useEffect, useState } from 'react';
import type { Profile } from './types';

export interface Session { token: string; profile: Profile }
const KEY = 'planner.session';
let current: Session | null = load();
const listeners = new Set<() => void>();

function load(): Session | null {
  try { return JSON.parse(localStorage.getItem(KEY) ?? 'null'); } catch { return null; }
}

export function getSession() { return current; }

export function setSession(s: Session | null) {
  current = s;
  try { s ? localStorage.setItem(KEY, JSON.stringify(s)) : localStorage.removeItem(KEY); } catch { /* prive-modus */ }
  listeners.forEach((l) => l());
}

export function useSession(): Session | null {
  const [, tick] = useState(0);
  useEffect(() => {
    const l = () => tick((n) => n + 1);
    listeners.add(l);
    return () => { listeners.delete(l); };
  }, []);
  return current;
}
