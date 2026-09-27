/** Spraakherkenning van de browser (Safari/Chrome), Nederlands. Geen server nodig. */
type RecognitionCtor = new () => SpeechRecognitionLike;
interface SpeechRecognitionLike {
  lang: string; interimResults: boolean; continuous: boolean; maxAlternatives: number;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null; onerror: ((e: { error: string }) => void) | null;
  start(): void; stop(): void; abort(): void;
}

export function speechSupported(): boolean {
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return !!(w.SpeechRecognition || w.webkitSpeechRecognition);
}

/** Luistert één uiting; roept onText aan met tussen- en eindresultaat. Geeft een stop-functie terug. */
export function listen(onText: (text: string, final: boolean) => void, onDone: (error?: string) => void): () => void {
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
  if (!Ctor) { onDone('Spraak werkt niet in deze browser'); return () => undefined; }
  const rec = new Ctor();
  rec.lang = 'nl-NL'; rec.interimResults = true; rec.continuous = false; rec.maxAlternatives = 1;
  let finalText = '';
  let finished = false;
  rec.onresult = (e) => {
    let text = '';
    let final = false;
    for (let i = 0; i < e.results.length; i++) { text += e.results[i][0].transcript; if (e.results[i].isFinal) final = true; }
    if (final) finalText = text;
    onText(text, final);
  };
  rec.onerror = (e) => { if (!finished) { finished = true; onDone(e.error === 'not-allowed' ? 'Geef de app toegang tot de microfoon' : e.error === 'no-speech' ? 'Ik hoorde niets. Probeer nog eens.' : e.error); } };
  rec.onend = () => { if (!finished) { finished = true; if (finalText) onText(finalText, true); onDone(); } };
  try { rec.start(); } catch { onDone('Kon niet starten'); }
  return () => { try { rec.stop(); } catch { /* al gestopt */ } };
}

export function speak(text: string, onEnd?: () => void): () => void {
  if (!('speechSynthesis' in window)) { onEnd?.(); return () => undefined; }
  window.speechSynthesis.cancel();
  // "2x3" of "2 × 3" als "2 keer 3", anders zegt de stem "2 ix 3".
  const spoken = text.replace(/(\d)\s*[x×*]\s*(?=\d)/gi, '$1 keer ').replace(/[*_#`]/g, '');
  const u = new SpeechSynthesisUtterance(spoken);
  u.lang = 'nl-NL'; u.rate = 0.95;
  const nl = window.speechSynthesis.getVoices().find((v) => v.lang.toLowerCase().startsWith('nl'));
  if (nl) u.voice = nl;
  u.onend = () => onEnd?.();
  u.onerror = () => onEnd?.();
  window.speechSynthesis.speak(u);
  return () => window.speechSynthesis.cancel();
}
