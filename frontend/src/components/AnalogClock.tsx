/** Analoge klok voor een tijd 'HH:MM'. Zonder tijd: lege wijzerplaat. */
export function AnalogClock({ time, size = 120 }: { time: string | null | undefined; size?: number }) {
  const [h, m] = time ? time.split(':').map(Number) : [null, null];
  const r = 50;
  const minAngle = m !== null ? m * 6 : 0;
  const hourAngle = h !== null && m !== null ? (h % 12) * 30 + m * 0.5 : 0;
  const hand = (angle: number, len: number, w: number, color: string) => {
    const a = ((angle - 90) * Math.PI) / 180;
    return <line x1={r} y1={r} x2={r + Math.cos(a) * len} y2={r + Math.sin(a) * len} stroke={color} strokeWidth={w} strokeLinecap="round" />;
  };
  const big = size >= 80;
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} aria-label={time ? `klok ${time}` : 'klok'} style={{ display: 'block' }}>
      <circle cx={r} cy={r} r={47} fill="#fff" stroke="#1f2937" strokeWidth={big ? 3 : 5} />
      {Array.from({ length: 12 }, (_, i) => {
        const a = ((i * 30 - 90) * Math.PI) / 180;
        const inner = big ? 38 : 34;
        return <line key={i} x1={r + Math.cos(a) * inner} y1={r + Math.sin(a) * inner} x2={r + Math.cos(a) * 43} y2={r + Math.sin(a) * 43} stroke="#1f2937" strokeWidth={i % 3 === 0 ? 3 : 1.5} />;
      })}
      {big && [12, 3, 6, 9].map((n, i) => {
        const a = ((i * 90 - 90) * Math.PI) / 180;
        return <text key={n} x={r + Math.cos(a) * 29} y={r + Math.sin(a) * 29 + 4.5} textAnchor="middle" fontSize="12" fontWeight="800" fill="#1f2937" fontFamily="system-ui, sans-serif">{n}</text>;
      })}
      {time && hand(hourAngle, big ? 22 : 24, big ? 5 : 8, '#1f2937')}
      {time && hand(minAngle, big ? 34 : 36, big ? 3.5 : 6, '#f472b6')}
      <circle cx={r} cy={r} r={big ? 3 : 5} fill="#1f2937" />
    </svg>
  );
}
