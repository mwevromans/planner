import {
  DndContext, DragOverlay, MouseSensor, TouchSensor, useDroppable, useSensor, useSensors, type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { go } from '../App';
import { CardGhost, CardView } from '../components/Card';
import { CardPanel } from '../components/CardPanel';
import { CardForm } from '../components/CardForm';
import { Header } from '../components/Header';
import { Stack } from '../components/Stack';
import { useToast } from '../components/Toast';
import { addDays, DOW, dom, today, weekLabel, weekStart } from '../dates';
import { DAY_PARTS, DAY_PART_LABEL, type Card, type DayPart, type Profile, type WeekView } from '../types';

function Cell({ date, part, cards, onTap, isToday, isPast }: { date: string; part: DayPart; cards: Card[]; onTap: (c: Card) => void; isToday: boolean; isPast: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: `cell:${date}|${part}` });
  return (
    <div ref={setNodeRef} className={`cell ${isToday ? 'today' : ''} ${isPast ? 'past' : ''} ${isOver ? 'over' : ''}`}>
      {cards.map((c) => <CardView key={c.id} card={c} onTap={onTap} />)}
    </div>
  );
}

export function WeekBoard({ kidId }: { kidId: number }) {
  const [start, setStart] = useState(() => weekStart(today()));
  const [week, setWeek] = useState<WeekView | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [open, setOpen] = useState<Card | null>(null);
  const [adding, setAdding] = useState(false);
  const [dragging, setDragging] = useState<Card | null>(null);
  const [toast, showToast] = useToast();
  const t = today();

  const load = useCallback(async () => {
    try { setWeek(await api.week(kidId, start)); } catch (e) { showToast(e instanceof Error ? e.message : 'Laden mislukt'); }
  }, [kidId, start, showToast]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { api.profiles().then((ps) => setProfile(ps.find((p) => p.id === kidId) ?? null)); }, [kidId]);
  useEffect(() => {
    // Als het paneel open staat, hou de kaart vers na herladen.
    if (open && week) {
      const fresh = [...week.cards, ...week.stack].find((c) => c.id === open.id);
      if (fresh && fresh !== open) setOpen(fresh);
    }
  }, [week, open]);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
  );

  const byCell = useMemo(() => {
    const m = new Map<string, Card[]>();
    week?.cards.forEach((c) => {
      const k = `${c.planned_date}|${c.day_part}`;
      m.set(k, [...(m.get(k) ?? []), c]);
    });
    return m;
  }, [week]);

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(start, i)), [start]);

  function onDragStart(e: DragStartEvent) { setDragging((e.active.data.current as { card: Card }).card); }

  async function onDragEnd(e: DragEndEvent) {
    setDragging(null);
    const card = (e.active.data.current as { card: Card }).card;
    const target = e.over?.id as string | undefined;
    if (!target || !week) return;
    let plannedDate: string | null = null;
    let dayPart: DayPart | null = null;
    if (target.startsWith('cell:')) {
      const [d, p] = target.slice(5).split('|');
      plannedDate = d; dayPart = p as DayPart;
    }
    if (card.planned_date === plannedDate && card.day_part === dayPart) return;
    // Optimistisch bijwerken
    const moved = { ...card, planned_date: plannedDate, day_part: dayPart };
    setWeek({
      ...week,
      cards: [...week.cards.filter((c) => c.id !== card.id), ...(plannedDate ? [moved] : [])],
      stack: [...week.stack.filter((c) => c.id !== card.id), ...(plannedDate ? [] : [moved])],
    });
    try { await api.moveCard(card.id, plannedDate, dayPart); } catch (err) { showToast(err instanceof Error ? err.message : 'Verplaatsen mislukt'); }
    load();
  }

  if (!profile) return <div className="center muted">Laden…</div>;

  return (
    <div className={`screen density-${profile.density}`}>
      <Header profile={profile} balance={week?.balance} streak={week?.streak}>
        <div className="weeknav">
          <button className="icon-btn" onClick={() => setStart(addDays(start, -7))} aria-label="Vorige week">‹</button>
          <span className="label">{weekLabel(start)}</span>
          <button className="icon-btn" onClick={() => setStart(addDays(start, 7))} aria-label="Volgende week">›</button>
          {start !== weekStart(t) && <button className="btn btn-small" onClick={() => setStart(weekStart(t))}>Vandaag</button>}
        </div>
      </Header>

      <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setDragging(null)}>
        <div className="board-wrap">
          <div className="board-scroll">
            <div className="board">
              <div className="corner day-head" />
              {days.map((d, i) => (
                <div key={d} className={`day-head ${d === t ? 'today' : ''}`}>
                  <button onClick={() => go(`/dag/${kidId}/${d}`)} title="Dag bekijken">
                    <span className="dow">{DOW[i]}</span>
                    <span className="dom">{dom(d)}</span>
                  </button>
                </div>
              ))}
              {DAY_PARTS.map((part) => (
                <DayPartRow key={part} part={part} days={days} byCell={byCell} today={t} onTap={setOpen} />
              ))}
            </div>
          </div>
          <Stack cards={week?.stack ?? []} onTap={setOpen} onAdd={() => setAdding(true)} />
        </div>
        <DragOverlay dropAnimation={null}>{dragging ? <CardGhost card={dragging} /> : null}</DragOverlay>
      </DndContext>

      {open && <CardPanel card={open} onClose={() => setOpen(null)} onChanged={load} />}
      {adding && (
        <div className="overlay" onClick={() => setAdding(false)}>
          <div className="panel" onClick={(e) => e.stopPropagation()}>
            <CardForm profileId={kidId} onSaved={() => { setAdding(false); load(); }} onCancel={() => setAdding(false)} />
          </div>
        </div>
      )}
      {toast}
    </div>
  );
}

function DayPartRow({ part, days, byCell, today, onTap }: { part: DayPart; days: string[]; byCell: Map<string, Card[]>; today: string; onTap: (c: Card) => void }) {
  return (
    <>
      <div className="part-head">
        <span>{DAY_PART_LABEL[part].icon}</span>
        <span>{DAY_PART_LABEL[part].label}</span>
      </div>
      {days.map((d) => (
        <Cell key={d} date={d} part={part} cards={byCell.get(`${d}|${part}`) ?? []} onTap={onTap} isToday={d === today} isPast={d < today} />
      ))}
    </>
  );
}
