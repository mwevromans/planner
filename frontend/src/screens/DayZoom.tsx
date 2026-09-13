import { DndContext } from '@dnd-kit/core';
import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { go } from '../App';
import { CardView } from '../components/Card';
import { CardPanel } from '../components/CardPanel';
import { Header } from '../components/Header';
import { addDays, longDate, today, weekStart } from '../dates';
import { DAY_PARTS, DAY_PART_LABEL, type Card, type Profile, type WeekView } from '../types';

export function DayZoom({ kidId, date }: { kidId: number; date: string }) {
  const [week, setWeek] = useState<WeekView | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [open, setOpen] = useState<Card | null>(null);
  const start = weekStart(date);

  const load = useCallback(() => api.week(kidId, start).then(setWeek), [kidId, start]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { api.profiles().then((ps) => setProfile(ps.find((p) => p.id === kidId) ?? null)); }, [kidId]);
  useEffect(() => {
    if (open && week) { const f = week.cards.find((c) => c.id === open.id); if (f && f !== open) setOpen(f); }
  }, [week, open]);

  if (!profile) return <div className="center muted">Laden…</div>;
  const cards = week?.cards.filter((c) => c.planned_date === date) ?? [];
  const fam = week?.family.filter((c) => c.planned_date === date) ?? [];
  const isToday = date === today();

  return (
    <div className={`screen density-${profile.density}`}>
      <Header profile={profile} balance={week?.balance} streak={week?.streak}>
        <div className="weeknav">
          <button className="icon-btn" onClick={() => go(`/dag/${kidId}/${addDays(date, -1)}`)} aria-label="Vorige dag">‹</button>
          <span className="label" style={{ minWidth: 190 }}>{isToday ? 'Vandaag · ' : ''}{longDate(date)}</span>
          <button className="icon-btn" onClick={() => go(`/dag/${kidId}/${addDays(date, 1)}`)} aria-label="Volgende dag">›</button>
          <button className="btn btn-small" onClick={() => go(`/week/${kidId}`)}>📅 Week</button>
        </div>
      </Header>
      <DndContext>
        <div className="day-parts">
          {DAY_PARTS.map((part) => {
            const items = cards.filter((c) => c.day_part === part);
            const famItems = fam.filter((c) => c.day_part === part);
            return (
              <section key={part} className="day-part">
                <h3><span>{DAY_PART_LABEL[part].icon}</span>{DAY_PART_LABEL[part].label}</h3>
                {items.length === 0 && famItems.length === 0 && <div className="empty">Niets gepland</div>}
                {famItems.map((c) => <CardView key={`f${c.id}`} card={c} draggable={false} big family />)}
                {items.map((c) => <CardView key={c.id} card={c} onTap={setOpen} draggable={false} big />)}
              </section>
            );
          })}
        </div>
      </DndContext>
      {open && <CardPanel card={open} onClose={() => setOpen(null)} onChanged={load} />}
    </div>
  );
}
