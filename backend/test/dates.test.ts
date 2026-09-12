import { expect, test } from 'vitest';
import { addDays, isIsoDate, weekStart, weekday } from '../src/dates.js';

test('weekStart geeft maandag', () => {
  expect(weekStart('2026-09-12')).toBe('2026-09-07'); // zaterdag
  expect(weekStart('2026-09-07')).toBe('2026-09-07'); // maandag
  expect(weekStart('2026-09-13')).toBe('2026-09-07'); // zondag
});
test('weekday: maandag 1, zondag 7', () => {
  expect(weekday('2026-09-07')).toBe(1);
  expect(weekday('2026-09-13')).toBe(7);
});
test('addDays over maandgrens', () => {
  expect(addDays('2026-09-30', 1)).toBe('2026-10-01');
  expect(addDays('2026-10-01', -1)).toBe('2026-09-30');
});
test('isIsoDate', () => {
  expect(isIsoDate('2026-09-12')).toBe(true);
  expect(isIsoDate('12-09-2026')).toBe(false);
  expect(isIsoDate('2026-13-40')).toBe(false);
});
