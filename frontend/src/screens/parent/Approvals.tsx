import { api } from '../../api';
import { celebrate } from '../../components/CardPanel';
import { shortDate } from '../../dates';
import type { Approvals as ApprovalsData } from '../../types';

export function Approvals({ data, onChanged }: { data: ApprovalsData; onChanged: () => void }) {
  const run = async (fn: () => Promise<unknown>, party = false) => { await fn(); if (party) celebrate(); onChanged(); };
  const empty = data.cards.length === 0 && data.redemptions.length === 0;
  return (
    <div className="section">
      {empty && <div className="box muted" style={{ fontWeight: 700 }}>Niets te keuren. Alles is bij 🎈</div>}
      {data.cards.length > 0 && <h2>Afgevinkt, wacht op jouw ✓</h2>}
      <div className="list" style={{ padding: 0 }}>
        {data.cards.map((c) => (
          <div key={c.id} className="list-item">
            <span className="icon">{c.icon}</span>
            <span className="body">
              <div className="title">{c.title} <span className="muted">· ⭐ {c.points}</span></div>
              <div className="sub">{c.profile.avatar} {c.profile.name}{c.planned_date ? ` · ${shortDate(c.planned_date)}` : ''}</div>
            </span>
            <button className="btn btn-good btn-small" onClick={() => run(() => api.approveCard(c.id), true)}>✓</button>
            <button className="btn btn-bad btn-small" onClick={() => run(() => api.rejectCard(c.id))}>✗</button>
          </div>
        ))}
      </div>
      {data.redemptions.length > 0 && <h2>Wil inwisselen</h2>}
      <div className="list" style={{ padding: 0 }}>
        {data.redemptions.map((r) => (
          <div key={r.id} className="list-item">
            <span className="icon">{r.icon}</span>
            <span className="body">
              <div className="title">{r.title} <span className="muted">· ⭐ {r.cost}</span></div>
              <div className="sub">{r.profile.avatar} {r.profile.name}</div>
            </span>
            <button className="btn btn-good btn-small" onClick={() => run(() => api.approveRedemption(r.id), true)}>✓</button>
            <button className="btn btn-bad btn-small" onClick={() => run(() => api.denyRedemption(r.id))}>✗</button>
          </div>
        ))}
      </div>
    </div>
  );
}
