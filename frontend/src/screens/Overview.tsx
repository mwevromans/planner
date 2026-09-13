import { useEffect, useState } from 'react';
import { api } from '../api';
import { Avatar } from '../components/Avatar';
import { CardInner, cardStatus } from '../components/Card';
import { longDate, today } from '../dates';
import { DAY_PARTS, DAY_PART_LABEL, type Overview as OverviewData } from '../types';

export function Overview() {
  const [data, setData] = useState<OverviewData | null>(null);
  useEffect(() => {
    const load = () => api.overview(today()).then(setData).catch(() => undefined);
    load();
    const id = window.setInterval(load, 60_000);
    return () => window.clearInterval(id);
  }, []);
  if (!data) return <div className="center muted">Laden…</div>;
  return (
    <div className="screen">
      <div className="header">
        <h1 style={{ fontSize: 28 }}>📅 {longDate(data.date)}</h1>
        <span className="spacer" />
        <a className="btn btn-small" href="#/gezin">📺 Hele week</a>
        <a className="btn btn-ghost muted" href="#/">Inloggen</a>
      </div>
      <div className="overview">
        {data.members.map((k) => (
          <div key={k.profile.id} className={`kid ${k.profile.role === 'family' ? 'family-col' : ''}`}>
            <div className="kid-head">
              <Avatar profile={k.profile} size={56} />
              <span>{k.profile.name}</span>
              <span className="chips">
                {k.balance !== null && <span className="chip">⭐ {k.balance}</span>}
                {k.streak !== null && k.streak > 0 && <span className="chip">🔥 {k.streak}</span>}
              </span>
            </div>
            {k.cards.length === 0 && <div className="muted" style={{ fontWeight: 700 }}>Niets gepland vandaag 🎈</div>}
            {DAY_PARTS.map((part) => {
              const items = k.cards.filter((c) => c.day_part === part);
              if (items.length === 0) return null;
              return (
                <div key={part}>
                  <div className="muted" style={{ fontWeight: 800, fontSize: 13, textTransform: 'uppercase', marginBottom: 6 }}>{DAY_PART_LABEL[part].icon} {DAY_PART_LABEL[part].label}</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {items.map((c) => (
                      <div key={c.id} className={`card big ${cardStatus(c) !== 'open' ? 'done' : ''}`} style={{ background: c.color }}>
                        <CardInner card={c} />
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
