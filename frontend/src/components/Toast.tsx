import { useCallback, useRef, useState } from 'react';

export function useToast(): [JSX.Element | null, (msg: string) => void] {
  const [msg, setMsg] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const show = useCallback((m: string) => {
    setMsg(m);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setMsg(null), 2200);
  }, []);
  return [msg ? <div className="toast">{msg}</div> : null, show];
}
