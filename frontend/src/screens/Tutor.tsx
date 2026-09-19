import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../api';
import { go } from '../App';
import { Header } from '../components/Header';
import { useSession } from '../session';
import { listen, speak as speakText, speechSupported } from '../speech';
import { ENGINE_ICON, type Profile, type TutorConversation, type TutorMessage, type TutorSettings } from '../types';

interface Props { kidId: number; conversationId?: number; cardId?: number }

/** Chat met de huiswerkhulp. Route: #/hulp/:kidId, #/hulp/:kidId/:conversationId, #/hulp/:kidId/nieuw/:cardId */
export function Tutor({ kidId, conversationId, cardId }: Props) {
  const me = useSession()!.profile;
  const isParent = me.role === 'parent';
  const [profile, setProfile] = useState<Profile | null>(null);
  const [settings, setSettings] = useState<TutorSettings | null>(null);
  const [list, setList] = useState<TutorConversation[]>([]);
  const [conv, setConv] = useState<(TutorConversation & { messages: TutorMessage[] }) | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [speaking, setSpeaking] = useState<number | null>(null);
  const [voice, setVoice] = useState<boolean | null>(null); // null = nog niet bepaald (standaard van ouders)
  const [listening, setListening] = useState(false);
  const [heard, setHeard] = useState('');
  const stopListen = useRef<(() => void) | null>(null);
  const autoSend = useRef(false);
  const lastSpoken = useRef<number | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const voiceKey = `planner.voice.${kidId}`;
  const voiceOn = !!voice;

  useEffect(() => { api.profiles().then((ps) => setProfile(ps.find((p) => p.id === kidId) ?? null)); }, [kidId]);
  const loadSide = useCallback(() => {
    api.tutorSettings(kidId).then((st) => {
      setSettings(st);
      setVoice((v) => { if (v !== null) return v; try { const saved = localStorage.getItem(voiceKey); return saved === null ? !!st.voice : saved === '1'; } catch { return !!st.voice; } });
    }).catch(() => undefined);
    api.tutorConversations(kidId).then(setList).catch(() => undefined);
  }, [kidId]);
  useEffect(() => { loadSide(); }, [loadSide]);

  useEffect(() => {
    if (conversationId) { api.tutorConversation(conversationId).then(setConv).catch((e) => setError(e.message)); return; }
    setConv(null);
  }, [conversationId]);

  // Nieuw gesprek vanaf een kaart: direct starten en doorsturen.
  useEffect(() => {
    if (cardId && !conversationId) {
      api.startTutorConversation(kidId, cardId).then((c) => go(`/hulp/${kidId}/${c.id}`)).catch((e) => setError(e.message));
    }
  }, [cardId, conversationId, kidId]);

  useEffect(() => { bottom.current?.scrollIntoView({ behavior: 'smooth' }); }, [conv?.messages.length, busy]);

  async function start() {
    setError('');
    try { const c = await api.startTutorConversation(kidId); go(`/hulp/${kidId}/${c.id}`); loadSide(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Er ging iets mis'); }
  }

  async function send() {
    if (!conv || !text.trim() || busy) return;
    const t = text.trim();
    setText(''); setBusy(true); setError('');
    setConv({ ...conv, messages: [...conv.messages, { id: -1, conversation_id: conv.id, role: 'kid', text: t, created_at: '' }] });
    try {
      const r = await api.sendTutorMessage(conv.id, t);
      setConv((c) => c ? { ...c, messages: [...c.messages.filter((m) => m.id !== -1), r.kid, r.tutor] } : c);
      setSettings((s) => s ? { ...s, usedToday: r.usedToday } : s);
      if (voiceOn && lastSpoken.current !== r.tutor.id) { lastSpoken.current = r.tutor.id; setSpeaking(r.tutor.id); speakText(r.tutor.text, () => setSpeaking(null)); }
    } catch (e) {
      setConv((c) => c ? { ...c, messages: c.messages.filter((m) => m.id !== -1) } : c);
      setText(t);
      setError(e instanceof ApiError ? e.message : 'De huiswerkhulp kon even niet antwoorden.');
    } finally { setBusy(false); }
  }

  function speak(m: TutorMessage) {
    if (speaking === m.id) { window.speechSynthesis?.cancel(); setSpeaking(null); return; }
    setSpeaking(m.id);
    speakText(m.text, () => setSpeaking(null));
  }

  function toggleVoice() {
    const next = !voiceOn;
    setVoice(next);
    try { localStorage.setItem(voiceKey, next ? '1' : '0'); } catch { /* prive-modus */ }
    if (!next) { window.speechSynthesis?.cancel(); setSpeaking(null); }
  }

  function startListening() {
    if (listening) { stopListen.current?.(); return; }
    window.speechSynthesis?.cancel(); setSpeaking(null);
    setError(''); setHeard(''); setListening(true);
    autoSend.current = voiceOn;
    stopListen.current = listen(
      (t, final) => { setHeard(t); if (final) setText(t); },
      (err) => {
        setListening(false); stopListen.current = null;
        if (err) { setError(err); return; }
        if (autoSend.current) setTimeout(() => { sendRef.current(); }, 400);
      },
    );
  }
  const sendRef = useRef(send); sendRef.current = send;

  if (!profile) return <div className="center muted">Laden…</div>;
  const left = settings ? Math.max(0, settings.daily_cap - (settings.usedToday ?? 0)) : null;
  const off = settings && !settings.enabled;

  return (
    <div className="screen tutor">
      <Header profile={profile}>
        <button className="btn btn-small" onClick={() => go(`/week/${kidId}`)}>📅 Week</button>
      </Header>
      <div className="tutor-body">
        <aside className="tutor-side">
          <button className="btn btn-primary" onClick={start} disabled={!!off || isParent}>💬 Nieuw gesprek</button>
          {!isParent && <button className={`btn btn-small ${voiceOn ? 'btn-good' : ''}`} onClick={toggleVoice} title="Praten en voorlezen aan of uit">{voiceOn ? '🎙️ Praten: aan' : '⌨️ Praten: uit'}</button>}
          {settings && !isParent && <div className="muted tutor-left">{off ? 'De huiswerkhulp staat uit.' : `Nog ${left} vragen vandaag`}</div>}
          <div className="tutor-list">
            {list.map((c) => (
              <button key={c.id} className={`tutor-item ${c.id === conv?.id ? 'on' : ''}`} onClick={() => go(`/hulp/${kidId}/${c.id}`)}>
                <div className="title">{ENGINE_ICON[c.engine]} {c.card_title ? `📌 ${c.card_title}` : c.preview || 'Gesprek'}</div>
                <div className="sub">{new Date(c.last_at.includes('T') ? c.last_at : c.last_at + 'Z').toLocaleString('nl-NL', { dateStyle: 'short', timeStyle: 'short' })} · {c.count} berichten</div>
              </button>
            ))}
            {list.length === 0 && <div className="muted" style={{ fontWeight: 700 }}>Nog geen gesprekken.</div>}
          </div>
        </aside>
        <section className="tutor-chat">
          {!conv && (
            <div className="tutor-welcome">
              <div style={{ fontSize: 56 }}>{ENGINE_ICON[settings?.engine ?? 'claude']}</div>
              <h2>Hoi {profile.name}!</h2>
              <p>Ik help je met je huiswerk. Ik zeg niet het antwoord, maar ik help je het zelf te vinden. Vraag maar!</p>
              {!isParent && <button className="btn btn-primary" onClick={start} disabled={!!off}>Begin een gesprek</button>}
            </div>
          )}
          {conv && (
            <>
              <div className="tutor-messages">
                {conv.card_title && <div className="tutor-context">📌 Je werkt aan: {conv.card_title}</div>}
                {conv.messages.map((m) => (
                  <div key={m.id} className={`bubble ${m.role}`}>
                    {m.role === 'tutor' && <span className="owl" title={conv.engine}>{ENGINE_ICON[conv.engine]}</span>}
                    <div className="bubble-text">{m.text}</div>
                    {m.role === 'tutor' && <button className="speak" onClick={() => speak(m)} title="Lees voor">{speaking === m.id ? '⏹️' : '🔊'}</button>}
                  </div>
                ))}
                {busy && <div className="bubble tutor thinking"><span className="owl">{ENGINE_ICON[conv.engine]}</span><div className="bubble-text">even denken<span className="dots">…</span></div></div>}
                <div ref={bottom} />
              </div>
              {error && <div className="error" style={{ padding: '0 12px 8px' }}>{error}</div>}
              {!isParent && (
                <form className="tutor-input" onSubmit={(e) => { e.preventDefault(); send(); }}>
                  {speechSupported() && (
                    <button type="button" className={`mic ${listening ? 'listening' : ''}`} onClick={startListening} disabled={busy || !!off || left === 0} title={listening ? 'Stop met luisteren' : 'Spreek je vraag in'}>
                      🎙️
                    </button>
                  )}
                  <input type="text" value={listening ? heard : text} onChange={(e) => setText(e.target.value)} placeholder={off ? 'De huiswerkhulp staat uit' : listening ? 'Ik luister…' : voiceOn ? 'Tik op de microfoon en praat' : 'Typ je vraag…'} disabled={busy || !!off || left === 0 || listening} autoFocus={!voiceOn} maxLength={2000} />
                  <button type="submit" className="btn btn-primary" disabled={busy || !text.trim() || !!off || left === 0 || listening}>Stuur</button>
                </form>
              )}
              {isParent && <div className="muted" style={{ padding: 12, fontWeight: 700 }}>Je leest mee; chatten doet {profile.name} zelf.</div>}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
