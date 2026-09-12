import { AnalogClock } from './AnalogClock';

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const MINUTES = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0'));

/** 24-uurs tijdkiezer met analoge klok. value is 'HH:MM' of '' voor geen tijd. */
export function TimePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [h, m] = value ? value.split(':') : ['', ''];
  const set = (hh: string, mm: string) => onChange(`${hh || '08'}:${mm || '00'}`);
  return (
    <div className="timepicker">
      <AnalogClock time={value || null} size={96} />
      <div className="timepicker-fields">
        <div className="timepicker-selects">
          <select value={h} onChange={(e) => set(e.target.value, m)} aria-label="Uur">
            <option value="" disabled>uur</option>
            {HOURS.map((x) => <option key={x} value={x}>{x}</option>)}
          </select>
          <span className="timepicker-colon">:</span>
          <select value={m} onChange={(e) => set(h, e.target.value)} aria-label="Minuten">
            <option value="" disabled>min</option>
            {MINUTES.map((x) => <option key={x} value={x}>{x}</option>)}
          </select>
        </div>
        {value
          ? <button type="button" className="btn btn-small" onClick={() => onChange('')}>Geen tijd</button>
          : <span className="muted" style={{ fontSize: 13, fontWeight: 700 }}>Geen tijd gekozen</span>}
      </div>
    </div>
  );
}
