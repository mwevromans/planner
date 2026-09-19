import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api';
import { go } from '../../App';
import { Avatar } from '../../components/Avatar';
import { ENGINE_ICON, ENGINE_NAME, type Profile, type TutorConversation, type TutorSettings, type TutorStatus } from '../../types';

export function TutorTab({ kids }: { kids: Profile[] }) {
  const [status, setStatus] = useState<TutorStatus | null>(null);
  const [kidId, setKidId] = useState(kids[0]?.id);
  const [settings, setSettings] = useState<TutorSettings | null>(null);
  const [extra, setExtra] = useState('');
  const [list, setList] = useState<TutorConversation[]>([]);
  const [msg, setMsg] = useState('');

  const load = useCallback(() => {
    api.tutorStatus().then(setStatus).catch(() => undefined);
    if (kidId) {
      api.tutorSettings(kidId).then((s) => { setSettings(s); setExtra(s.extra_prompt); }).catch(() => undefined);
      api.tutorConversations(kidId).then(setList).catch(() => undefined);
    }
  }, [kidId]);
  useEffect(() => { load(); }, [load]);

  async function patch(p: Parameters<typeof api.updateTutorSettings>[1]) {
    if (!kidId) return;
    const s = await api.updateTutorSettings(kidId, p);
    setSettings({ ...s, usedToday: settings?.usedToday });
    setMsg('Opgeslagen'); setTimeout(() => setMsg(''), 1500);
  }

  if (!kidId) return <div className="section muted">Nog geen kinderen.</div>;
  const kid = kids.find((k) => k.id === kidId)!;
  const when = (s: string) => new Date(s.includes('T') ? s : s + 'Z').toLocaleString('nl-NL', { dateStyle: 'short', timeStyle: 'short' });

  return (
    <div className="section">
      <div className="box" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <h2>🦉 Huiswerkhulp</h2>
        {status && (
          <div className="muted" style={{ fontWeight: 700 }}>
            {status.configured ? (status.reachable ? `Tussenstuk bereikbaar · ${ENGINE_ICON.claude} Claude en ${ENGINE_ICON.codex} Codex beschikbaar` : 'Tussenstuk niet bereikbaar, controleer de tutor-bridge service op de host') : 'Niet geconfigureerd: zet TUTOR_BRIDGE_URL en TUTOR_SECRET in .env'}
            {status.unread > 0 ? ` · ${status.unread} ongelezen` : ''}
          </div>
        )}
      </div>
      <div className="kid-tabs">
        {kids.map((k) => <button key={k.id} className={k.id === kidId ? 'on' : ''} onClick={() => setKidId(k.id)}><Avatar profile={k} size={28} />{k.name}</button>)}
      </div>
      <div className="two-col">
        <div className="box form" style={{ gap: 12 }}>
          <h2>Instellingen voor {kid.name}</h2>
          {settings && (
            <>
              <div className="segmented">
                <button type="button" className={settings.enabled ? 'on' : ''} onClick={() => patch({ enabled: true })}>Aan</button>
                <button type="button" className={!settings.enabled ? 'on' : ''} onClick={() => patch({ enabled: false })}>Uit</button>
              </div>
              <label>Vragen per dag (vandaag gebruikt: {settings.usedToday ?? 0})
                <input type="number" min={0} max={1000} value={settings.daily_cap} onChange={(e) => setSettings({ ...settings, daily_cap: Number(e.target.value) })} onBlur={() => patch({ dailyCap: settings.daily_cap })} />
              </label>
              <label>Motor</label>
              <div className="segmented">
                <button type="button" className={settings.engine === 'claude' ? 'on' : ''} onClick={() => patch({ engine: 'claude' })}>{ENGINE_ICON.claude} Claude</button>
                <button type="button" className={settings.engine === 'codex' ? 'on' : ''} onClick={() => patch({ engine: 'codex' })}>{ENGINE_ICON.codex} Codex</button>
              </div>
              <label>Spraakstand (standaard voor {kid.name}; het kind kan het zelf aan- en uitzetten)</label>
              <div className="segmented">
                <button type="button" className={settings.voice ? 'on' : ''} onClick={() => patch({ voice: true })}>🎙️ Praten en voorlezen</button>
                <button type="button" className={!settings.voice ? 'on' : ''} onClick={() => patch({ voice: false })}>⌨️ Typen</button>
              </div>
              <label>Extra instructies voor {kid.name} (bovenop het basisdocument)
                <textarea value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="Bijv. Deze week oefenen we de tafel van 7." maxLength={4000} />
              </label>
              <button className="btn btn-primary btn-small" onClick={() => patch({ extraPrompt: extra })} style={{ alignSelf: 'flex-start' }}>Opslaan</button>
              {msg && <div className="status good">{msg}</div>}
            </>
          )}
        </div>
        <div className="box" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <h2>Gesprekken van {kid.name}</h2>
          {list.length === 0 && <div className="muted" style={{ fontWeight: 700 }}>Nog geen gesprekken.</div>}
          {list.map((c) => (
            <button key={c.id} className="list-item" style={{ textAlign: 'left', background: c.read_by_parent ? '#fffdf5' : '#fef3c7', boxShadow: 'none' }} onClick={() => go(`/hulp/${kid.id}/${c.id}`)}>
              <span className="icon">{ENGINE_ICON[c.engine]}</span>
              <span className="body">
                <div className="title">{!c.read_by_parent && <span className="pill wacht" style={{ marginRight: 6 }}>nieuw</span>}{c.card_title ? `📌 ${c.card_title}` : c.preview || 'Gesprek'}</div>
                <div className="sub">{when(c.last_at)} · {c.count} berichten · {ENGINE_NAME[c.engine]}</div>
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
