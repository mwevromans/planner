import { useEffect, useState } from 'react';

export function PinPad({ length = 4, onSubmit, error }: { length?: number; onSubmit: (pin: string) => void; error?: string }) {
  const [pin, setPin] = useState('');
  useEffect(() => { if (error) setPin(''); }, [error]);
  const press = (d: string) => {
    const next = pin + d;
    setPin(next);
    if (next.length >= length) onSubmit(next);
  };
  return (
    <div className="center" style={{ gap: 16, padding: 0 }}>
      <div className="pin-dots">{Array.from({ length }, (_, i) => <span key={i} className={i < pin.length ? 'on' : ''} />)}</div>
      {error && <div className="error">{error}</div>}
      <div className="pinpad">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => <button key={d} onClick={() => press(d)}>{d}</button>)}
        <button onClick={() => setPin('')} aria-label="Leeg">↺</button>
        <button onClick={() => press('0')}>0</button>
        <button onClick={() => setPin((p) => p.slice(0, -1))} aria-label="Wis">⌫</button>
      </div>
    </div>
  );
}
